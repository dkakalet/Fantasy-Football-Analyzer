// KeepTradeCut — OPTIONAL, OFF BY DEFAULT (ENABLE_KTC=true in .env.local).
//
// KTC has no official API. This file is the only place that scrapes it: the
// public dynasty rankings page embeds its data as
//   <script type="application/json" id="ktc-players">[...]</script>
// (confirmed 2026-09-25; see fixtures/ktc). Check KTC's terms of use before
// enabling this or deploying with it. Any failure here is reported as a source
// error and the other sources keep working.
//
// Values use a 12-team, 0.5 PPR baseline with separate 1QB and Superflex lists,
// each with TE-premium variants (tep / tepp / teppp). Dynasty only.

import { cached, TTL, type Cached } from "../cache";
import { fetchText } from "../http";
import { parseDynastyProcessPick } from "../picks";
import { buildNameIndex, fetchSleeperPlayers, type SleeperPlayer } from "../sleeper/players";
import type { AssetValue, LeagueSettings, SourceAdapter, SourceLoad } from "../types";
import { fetchDynastyProcessIds, type DpIdRow } from "./dynastyprocess";

export const KTC_URL = "https://keeptradecut.com/dynasty-rankings";

interface KtcValueSet {
  value: number;
  tep?: { value: number };
  tepp?: { value: number };
  teppp?: { value: number };
}

/** Fields of a `ktc-players` entry that this app reads. */
export interface KtcPlayer {
  playerName: string;
  playerID: number;
  position: string; // QB | RB | WR | TE | RDP (draft pick)
  team: string | null;
  mflid?: number | string | null;
  oneQBValues: KtcValueSet;
  superflexValues: KtcValueSet;
}

/** Pull the embedded player JSON out of the rankings page. Throws if the page format changed. */
export function extractKtcPlayers(html: string): KtcPlayer[] {
  const m = /<script[^>]*id="ktc-players"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("KTC page format changed: ktc-players data not found");
  const data = JSON.parse(m[1]) as unknown;
  if (!Array.isArray(data) || !data.every((p) => p && typeof p.playerName === "string" && p.oneQBValues && p.superflexValues)) {
    throw new Error("KTC page format changed: unexpected ktc-players shape");
  }
  return data as KtcPlayer[];
}

export function fetchKtcRaw(): Promise<Cached<KtcPlayer[]>> {
  return cached("ktc:dynasty-rankings", TTL.values, async () => extractKtcPlayers(await fetchText(KTC_URL)));
}

/** Our TE-premium setting -> KTC's variant. te+ ≈ +0.5/rec (KTC "tep"), te++ ≈ +1.0/rec ("tepp"); an assumed mapping. */
const TEP_VARIANT = { none: null, "te+": "tep", "te++": "tepp" } as const;

export function ktcValue(set: KtcValueSet, tep: LeagueSettings["tep"]): number {
  const variant = TEP_VARIANT[tep];
  return (variant && set[variant]?.value) || set.value;
}

/**
 * Turn KTC entries into AssetValues. Players: mflid -> crosswalk mfl_id ->
 * sleeper_id, then normalized name + position. Picks ("2027 Early 1st") use the
 * same label format as DynastyProcess.
 */
export function mapKtc(
  raw: readonly KtcPlayer[],
  ids: readonly DpIdRow[],
  sleeperPlayers: readonly SleeperPlayer[],
  settings: LeagueSettings,
): Pick<SourceLoad, "values" | "stats"> {
  const byMfl = new Map<string, string>();
  for (const r of ids) if (r.mfl_id && r.mfl_id !== "NA" && !byMfl.has(r.mfl_id)) byMfl.set(r.mfl_id, r.sleeper_id);
  const byName = buildNameIndex(sleeperPlayers);

  const values: AssetValue[] = [];
  const skipped: Record<string, number> = {};
  const matchedBy: Record<string, number> = { crosswalk: 0, name: 0 };
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  let players = 0;
  let picks = 0;

  for (const p of raw) {
    const set = settings.numQbs === 2 ? p.superflexValues : p.oneQBValues;
    const v = ktcValue(set, settings.tep);
    if (p.position === "RDP") {
      const key = parseDynastyProcessPick(p.playerName);
      if (!key) {
        skip("unrecognized pick label");
        continue;
      }
      picks++;
      values.push({ assetId: key, kind: "pick", rawValue: v, sourceName: p.playerName });
      continue;
    }
    players++;
    let id = p.mflid ? byMfl.get(String(p.mflid)) : undefined;
    if (id) matchedBy.crosswalk++;
    else {
      id = byName(p.playerName, p.position, p.team);
      if (id) matchedBy.name++;
    }
    if (!id) {
      skip("no Sleeper match");
      continue;
    }
    values.push({ assetId: id, kind: "player", rawValue: v, sourceName: p.playerName, position: p.position, team: p.team });
  }
  return { values, stats: { players, picks, skipped, matchedBy } };
}

export interface KtcDeps {
  loadRaw: () => Promise<Cached<KtcPlayer[]>>;
  loadIds: () => Promise<Cached<DpIdRow[]>>;
  loadSleeperPlayers: () => Promise<Cached<SleeperPlayer[]>>;
}

export function createKtcSource(
  deps: KtcDeps = { loadRaw: fetchKtcRaw, loadIds: fetchDynastyProcessIds, loadSleeperPlayers: fetchSleeperPlayers },
): SourceAdapter {
  const source: SourceAdapter = {
    id: "ktc",
    name: "KeepTradeCut",
    homepage: "https://keeptradecut.com",
    supports: (s) =>
      s.format !== "dynasty"
        ? { supported: false, approximated: [] }
        : {
            supported: true,
            approximated: [...(s.ppr !== 0.5 ? ["ppr"] : []), ...(s.numTeams !== 12 ? ["teams"] : []), ...(s.tep !== "none" ? ["tep"] : [])],
          },
    async load(settings) {
      const [raw, ids, sleeperPlayers] = await Promise.all([
        deps.loadRaw(),
        deps.loadIds().catch(() => null),
        deps.loadSleeperPlayers().catch(() => null),
      ]);
      return {
        ...mapKtc(raw.value, ids?.value ?? [], sleeperPlayers?.value ?? [], settings),
        fetchedAt: raw.fetchedAt,
        from: raw.from,
        error: raw.error,
      };
    },
    fetchValues: async (settings) => (await source.load(settings)).values,
  };
  return source;
}
