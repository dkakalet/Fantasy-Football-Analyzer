// RosterAudit — https://rosteraudit.com/developers/. Free public API (no key needed
// for these endpoints); values come from an Elo engine over real Sleeper trades.
// Terms (rosteraudit.com/terms): personal tools are fine; display "Values by
// RosterAudit.com" with a link wherever the data is shown; no competing service and
// no commercial redistribution without permission; stay under 200 requests/minute.
//
// What the live API showed (2026-09-29, see fixtures/rosteraudit):
// - GET /rankings?format=sf|1qb&per_page=100&page=N -> { players, total, total_pages,
//   preset, attribution }. Each player has `sleeper_id`, `val_sf_market`,
//   `val_1qb_market` (strings) and a preset-adjusted `value`. The list also holds
//   pick rows (position "PICK", no sleeper_id), which are ignored here. `format_key` and
//   `league_size` are accepted but don't change anything, and the Superflex preset
//   bakes in TE premium, so this app uses the raw *market* values.
// - GET /picks -> { picks: [{ pick_season, pick_round, pick_slot: early|mid|late,
//   val_sf, val_1qb, label }] } for rounds 1-5 of the next three drafts.
// Dynasty only. PPR, team count and TE premium are approximations.

import { cached, TTL, type Cached } from "../cache";
import { fetchJson } from "../http";
import { slotKey, tierKey, type Tier } from "../picks";
import type { AssetValue, LeagueSettings, SourceAdapter, SourceLoad } from "../types";

export const RA_BASE = "https://rosteraudit.com/wp-json/ra/v1";
const PER_PAGE = 100;
const MAX_PAGES = 20;

type RaFormat = "sf" | "1qb";

/** Fields of a `/rankings` player that this app reads. */
export interface RaPlayer {
  sleeper_id: string;
  name: string;
  position: string;
  team: string | null;
  val_sf_market: string | number;
  val_1qb_market: string | number;
}

export interface RaPick {
  pick_season: number;
  pick_round: number;
  pick_slot: string | number;
  val_sf: number;
  val_1qb: number;
  label: string;
}

export interface RaRaw {
  players: RaPlayer[];
  picks: RaPick[];
}

interface RaRankingsPage {
  players: RaPlayer[];
  total_pages?: number;
}

const formatOf = (s: LeagueSettings): RaFormat => (s.numQbs === 2 ? "sf" : "1qb");

export function fetchRosterAuditRaw(s: LeagueSettings): Promise<Cached<RaRaw>> {
  const format = formatOf(s);
  return cached(`rosteraudit:${format}`, TTL.values, async () => {
    const players: RaPlayer[] = [];
    // Sequential pages (~5 requests) — well under the documented 200/minute.
    for (let page = 1, pages = 1; page <= Math.min(pages, MAX_PAGES); page++) {
      const res = await fetchJson<RaRankingsPage>(`${RA_BASE}/rankings?format=${format}&per_page=${PER_PAGE}&page=${page}`);
      if (!res || !Array.isArray(res.players)) throw new Error("RosterAudit: unexpected rankings response");
      players.push(...res.players);
      pages = res.total_pages ?? 1;
    }
    const picks = await fetchJson<{ picks: RaPick[] }>(`${RA_BASE}/picks`);
    if (!picks || !Array.isArray(picks.picks)) throw new Error("RosterAudit: unexpected picks response");
    return { players, picks: picks.picks };
  });
}

export function rosterAuditPickKey(p: Pick<RaPick, "pick_season" | "pick_round" | "pick_slot">): string | null {
  const slot = String(p.pick_slot).toLowerCase();
  if (slot === "early" || slot === "mid" || slot === "late") return tierKey(p.pick_season, p.pick_round, slot.toUpperCase() as Tier);
  if (/^\d+$/.test(slot)) return slotKey(p.pick_season, p.pick_round, Number(slot));
  return null;
}

export function mapRosterAudit(raw: RaRaw, numQbs: LeagueSettings["numQbs"]): Pick<SourceLoad, "values" | "stats"> {
  const values: AssetValue[] = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  const sf = numQbs === 2;
  // /rankings also lists picks (position "PICK", no sleeper_id or market values);
  // pick values come from /picks instead.
  let players = 0;
  for (const p of raw.players) {
    if (p.position === "PICK") continue;
    const v = Number(sf ? p.val_sf_market : p.val_1qb_market);
    // Zero-value entries are skipped and don't count as player records (see match rate).
    if (!(v > 0)) {
      skip("zero or missing value");
      continue;
    }
    players++;
    if (!/^\d+$/.test(p.sleeper_id ?? "")) skip("no sleeper_id");
    else values.push({ assetId: p.sleeper_id, kind: "player", rawValue: v, sourceName: p.name, position: p.position, team: p.team });
  }
  let picks = 0;
  for (const p of raw.picks) {
    const key = rosterAuditPickKey(p);
    const v = Number(sf ? p.val_sf : p.val_1qb);
    if (!key) skip("unrecognized pick slot");
    else if (!(v > 0)) skip("zero or missing value");
    else {
      picks++;
      values.push({ assetId: key, kind: "pick", rawValue: v, sourceName: p.label });
    }
  }
  return {
    values,
    stats: { players, picks, skipped, matchedBy: { sleeperId: values.filter((x) => x.kind === "player").length } },
  };
}

export function createRosterAuditSource(
  loadRaw: (s: LeagueSettings) => Promise<Cached<RaRaw>> = fetchRosterAuditRaw,
): SourceAdapter {
  const source: SourceAdapter = {
    id: "rosteraudit",
    name: "RosterAudit",
    homepage: "https://rosteraudit.com",
    supports: (s) =>
      s.format !== "dynasty"
        ? { supported: false, approximated: [] }
        : { supported: true, approximated: ["ppr", "teams", ...(s.tep !== "none" ? ["tep"] : [])] },
    async load(settings) {
      const raw = await loadRaw(settings);
      return { ...mapRosterAudit(raw.value, settings.numQbs), fetchedAt: raw.fetchedAt, from: raw.from, error: raw.error };
    },
    fetchValues: async (settings) => (await source.load(settings)).values,
  };
  return source;
}
