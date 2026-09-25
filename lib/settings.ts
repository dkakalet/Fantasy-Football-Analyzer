import type { LeagueSettings, NumTeams, Ppr, TePremium } from "./types";

export const DEFAULT_SETTINGS: LeagueSettings = {
  format: "dynasty",
  numQbs: 1,
  ppr: 0.5,
  numTeams: 12,
  tep: "none",
};

// Allowed values come from FantasyCalc's API docs (fantasycalc.com/api-docs).
export const ALLOWED_TEAMS: readonly NumTeams[] = [8, 10, 12, 14];
export const ALLOWED_PPR: readonly Ppr[] = [0, 0.5, 1];

export const TEP_VALUES: readonly TePremium[] = ["none", "te+", "te++"];

/** Read settings from URL query params (format, qb, ppr, teams, tep); invalid values fall back to defaults. */
export function parseSettings(params: URLSearchParams): LeagueSettings {
  const d = DEFAULT_SETTINGS;
  const format = params.get("format");
  const qb = Number(params.get("qb"));
  const ppr = params.get("ppr");
  const teams = params.get("teams");
  const tep = params.get("tep") as TePremium | null;
  return {
    format: format === "dynasty" || format === "redraft" ? format : d.format,
    numQbs: qb === 1 || qb === 2 ? qb : d.numQbs,
    ppr: ppr !== null && ppr !== "" && Number.isFinite(Number(ppr)) ? closest(Number(ppr), ALLOWED_PPR) : d.ppr,
    numTeams: teams !== null && teams !== "" && Number.isFinite(Number(teams)) ? closest(Number(teams), ALLOWED_TEAMS) : d.numTeams,
    tep: tep && TEP_VALUES.includes(tep) ? tep : d.tep,
  };
}

export function settingsToQuery(s: LeagueSettings): string {
  return new URLSearchParams({
    format: s.format,
    qb: String(s.numQbs),
    ppr: String(s.ppr),
    teams: String(s.numTeams),
    tep: s.tep,
  }).toString();
}

/** Closest allowed value; ties resolve to the larger option. */
export function closest<T extends number>(value: number, allowed: readonly T[]): T {
  let best = allowed[0];
  for (const a of allowed) {
    const d = Math.abs(a - value);
    const bestD = Math.abs(best - value);
    if (d < bestD || (d === bestD && a > best)) best = a;
  }
  return best;
}
