// FantasyCalc — primary source and the reference scale.
// Docs: https://fantasycalc.com/api-docs. Only the documented endpoints may be
// called; results must be cached server-side (refresh at most hourly).

import { cached, TTL, type Cached } from "../cache";
import { fetchJson } from "../http";
import { parseFantasyCalcPick } from "../picks";
import type { AssetValue, LeagueSettings, SourceAdapter, SourceLoad } from "../types";

export const FANTASYCALC_BASE = "https://api.fantasycalc.com";

/** Fields of a `/values/current` record that this app reads (see fixtures/fantasycalc). */
export interface FcRecord {
  player: {
    id: number;
    name: string;
    /** Sleeper player_id for players; "FP_<season>_<tier|round>_<n>" for picks. */
    sleeperId?: string | null;
    mflId?: string | null;
    position: string; // QB | RB | WR | TE | PICK
    maybeTeam?: string | null;
  };
  value: number;
  overallRank: number;
  positionRank: number;
  redraftValue?: number;
}

export function fantasyCalcUrl(s: LeagueSettings): string {
  const params = new URLSearchParams({
    isDynasty: String(s.format === "dynasty"),
    numQbs: String(s.numQbs),
    numTeams: String(s.numTeams),
    ppr: String(s.ppr),
  });
  if (s.tep !== "none") params.set("tep", s.tep);
  return `${FANTASYCALC_BASE}/values/current?${params}`;
}

export function fetchFantasyCalcRaw(s: LeagueSettings): Promise<Cached<FcRecord[]>> {
  const url = fantasyCalcUrl(s);
  return cached(`fantasycalc:${url}`, TTL.values, () => fetchJson<FcRecord[]>(url));
}

/** Turn FantasyCalc records into AssetValues. Players join on `player.sleeperId`. */
export function mapFantasyCalc(records: FcRecord[]): Pick<SourceLoad, "values" | "stats"> {
  const values: AssetValue[] = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  let players = 0;
  let picks = 0;
  for (const r of records) {
    const p = r.player;
    if (p.position === "PICK") {
      const key = parseFantasyCalcPick(p.name);
      if (!key) {
        skip("unrecognized pick label");
        continue;
      }
      picks++;
      values.push({ assetId: key, kind: "pick", rawValue: r.value, sourceName: p.name });
      continue;
    }
    players++;
    if (!p.sleeperId) {
      skip("no sleeperId");
      continue;
    }
    values.push({
      assetId: p.sleeperId,
      kind: "player",
      rawValue: r.value,
      sourceName: p.name,
      position: p.position,
      team: p.maybeTeam ?? null,
    });
  }
  return { values, stats: { players, picks, skipped, matchedBy: { sleeperId: players - (skipped["no sleeperId"] ?? 0) } } };
}

export function createFantasyCalcSource(
  loadRaw: (s: LeagueSettings) => Promise<Cached<FcRecord[]>> = fetchFantasyCalcRaw,
): SourceAdapter {
  const source: SourceAdapter = {
    id: "fantasycalc",
    name: "FantasyCalc",
    homepage: "https://fantasycalc.com",
    // Every setting the app offers is a documented FantasyCalc option.
    supports: () => ({ supported: true, approximated: [] }),
    async load(settings) {
      const raw = await loadRaw(settings);
      return { ...mapFantasyCalc(raw.value), fetchedAt: raw.fetchedAt, from: raw.from, error: raw.error };
    },
    fetchValues: async (settings) => (await source.load(settings)).values,
  };
  return source;
}
