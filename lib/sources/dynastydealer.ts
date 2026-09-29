// Dynasty Dealer — https://www.dynastydealer.com. Free, keyless public API; values
// are computed from real Sleeper trades (dynasty) or a single-season model
// (redraft). Terms (from the API author's announcement): free for any use as long
// as a visible link to dynastydealer.com is shown. Responses are edge-cached for
// 60 s and change a few times a day, so the 6 h TTL here is plenty.
//
// What the live API showed (2026-09-29, see fixtures/dynastydealer):
// - GET /api/player-values -> { players: [...], total, timestamp, scoringSettings }.
//   Top 1,000 assets; players carry `sleeper_id`.
// - Dynasty mode is ONE blended market: `sf=true` and `tep=true` are echoed in
//   `scoringSettings` but don't change any value. So QB format, PPR, team count and
//   TE premium are all approximations for dynasty.
// - Picks: position "PICK", sleeper_id "pick_2027_1_early"; with `perSlot=true` also
//   "pick_2027_1_slot_01" (exact slots, next draft only). Rounds 1-4.
// - Redraft mode (`format=redraft&scoring=std|half|ppr[&sf=true]`) is players only and
//   does honour scoring and superflex.
// - `base_value` is the trade-derived engine value; `current_value` adds community
//   vote adjustments (a few percent). This app uses `current_value`, the published value.

import { cached, TTL, type Cached } from "../cache";
import { fetchJson } from "../http";
import { slotKey, tierKey, type Tier } from "../picks";
import type { AssetValue, LeagueSettings, SourceAdapter, SourceLoad } from "../types";

export const DD_BASE = "https://www.dynastydealer.com/api/player-values";

/** Fields of a `players` entry that this app reads. */
export interface DdEntry {
  sleeper_id: string;
  name: string;
  position: string; // QB | RB | WR | TE | PICK
  team: string | null;
  base_value: number;
  current_value: number;
}

interface DdResponse {
  players: DdEntry[];
  total?: number;
  timestamp?: string;
}

const SCORING: Record<LeagueSettings["ppr"], string> = { 0: "std", 0.5: "half", 1: "ppr" };

export function dynastyDealerUrl(s: LeagueSettings): string {
  if (s.format === "dynasty") return `${DD_BASE}?perSlot=true`;
  return `${DD_BASE}?format=redraft&scoring=${SCORING[s.ppr]}${s.numQbs === 2 ? "&sf=true" : ""}`;
}

export function fetchDynastyDealerRaw(s: LeagueSettings): Promise<Cached<DdEntry[]>> {
  const url = dynastyDealerUrl(s);
  return cached(`dynastydealer:${url}`, TTL.values, async () => {
    const res = await fetchJson<DdResponse>(url);
    if (!res || !Array.isArray(res.players)) throw new Error("Dynasty Dealer: unexpected response shape");
    return res.players;
  });
}

/** Dynasty Dealer pick IDs: "pick_2027_1_early" (tier) or "pick_2027_1_slot_01" (exact slot). */
export function parseDynastyDealerPick(id: string): string | null {
  let m = /^pick_(\d{4})_(\d+)_(early|mid|late)$/.exec(id);
  if (m) return tierKey(+m[1], +m[2], m[3].toUpperCase() as Tier);
  m = /^pick_(\d{4})_(\d+)_slot_(\d+)$/.exec(id);
  if (m) return slotKey(+m[1], +m[2], +m[3]);
  return null;
}

export function mapDynastyDealer(entries: readonly DdEntry[]): Pick<SourceLoad, "values" | "stats"> {
  const values: AssetValue[] = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  let players = 0;
  let picks = 0;
  for (const e of entries) {
    const v = Number(e.current_value);
    if (e.position === "PICK") {
      const key = parseDynastyDealerPick(e.sleeper_id);
      if (!key) skip("unrecognized pick id");
      else if (!(v > 0)) skip("zero or missing value");
      else {
        picks++;
        values.push({ assetId: key, kind: "pick", rawValue: v, sourceName: e.name });
      }
      continue;
    }
    // Zero-value entries (deep bench) are skipped and don't count as player records,
    // so the match rate reflects ID matching only.
    if (!(v > 0)) {
      skip("zero or missing value");
      continue;
    }
    players++;
    if (!/^\d+$/.test(e.sleeper_id ?? "")) skip("no sleeper_id");
    else values.push({ assetId: e.sleeper_id, kind: "player", rawValue: v, sourceName: e.name, position: e.position, team: e.team });
  }
  return { values, stats: { players, picks, skipped, matchedBy: { sleeperId: values.filter((x) => x.kind === "player").length } } };
}

export function createDynastyDealerSource(
  loadRaw: (s: LeagueSettings) => Promise<Cached<DdEntry[]>> = fetchDynastyDealerRaw,
): SourceAdapter {
  const source: SourceAdapter = {
    id: "dynastydealer",
    name: "Dynasty Dealer",
    homepage: "https://www.dynastydealer.com",
    supports: (s) => {
      const tep = s.tep !== "none" ? ["tep"] : [];
      // Dynasty is one blended market (see header); redraft honours scoring and superflex.
      return s.format === "dynasty"
        ? { supported: true, approximated: ["qb", "ppr", "teams", ...tep] }
        : { supported: true, approximated: ["teams", ...tep] };
    },
    async load(settings) {
      const raw = await loadRaw(settings);
      return { ...mapDynastyDealer(raw.value), fetchedAt: raw.fetchedAt, from: raw.from, error: raw.error };
    },
    fetchValues: async (settings) => (await source.load(settings)).values,
  };
  return source;
}
