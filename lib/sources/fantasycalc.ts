// FantasyCalc — primary source and the reference scale.
// Docs: https://fantasycalc.com/api-docs. Only the documented endpoints may be
// called; results must be cached server-side (refresh at most hourly).

import { cached, TTL, type Cached } from "../cache";
import { fetchJson } from "../http";
import type { LeagueSettings } from "../types";

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
