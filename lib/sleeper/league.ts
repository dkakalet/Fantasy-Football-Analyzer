// Map a Sleeper league to this app's settings and teams. Pure; tested against
// fixtures/sleeper.

import { ALLOWED_PPR, ALLOWED_TEAMS, closest } from "../settings";
import type { LeagueSettings, TePremium } from "../types";
import type { SleeperLeague, SleeperLeagueUser, SleeperRoster } from "./client";

/** `settings.type` values seen in live leagues (see fixtures/sleeper/leagues-by-type.json). */
export const LEAGUE_TYPE: Record<number, string> = { 0: "redraft", 1: "keeper", 2: "dynasty", 3: "type 3 (seen on guillotine leagues)" };

/**
 * TE bonus per reception -> FantasyCalc `tep`. FantasyCalc doesn't document the
 * numeric meaning of te+/te++; this mapping is our assumption: up to 0.75 -> te+,
 * 0.75 and up -> te++.
 */
export function tepFromBonus(bonus: number | undefined): TePremium {
  if (!bonus || bonus <= 0) return "none";
  return bonus < 0.75 ? "te+" : "te++";
}

export function isSuperflex(rosterPositions: readonly string[]): boolean {
  return rosterPositions.includes("SUPER_FLEX") || rosterPositions.filter((p) => p === "QB").length >= 2;
}

export interface MappedLeague {
  settings: LeagueSettings;
  /** Where the mapping approximates or assumes something. */
  notes: string[];
  /** The league values the mapping read. */
  source: { type: number | null; superflex: boolean; rec: number; bonusRecTe: number; totalRosters: number; draftRounds: number | null };
}

export function mapLeagueSettings(league: SleeperLeague): MappedLeague {
  const type = league.settings.type ?? null;
  const rec = league.scoring_settings.rec ?? 0;
  const bonusRecTe = league.scoring_settings.bonus_rec_te ?? 0;
  const teams = league.total_rosters;
  const superflex = isSuperflex(league.roster_positions);
  const notes: string[] = [];

  const format = type === 2 ? "dynasty" : "redraft";
  if (type !== 0 && type !== 2) notes.push(`League type ${type === null ? "unknown" : LEAGUE_TYPE[type] ?? type} treated as redraft.`);

  const ppr = closest(rec, ALLOWED_PPR);
  if (ppr !== rec) notes.push(`League scores ${rec} per reception → using ${ppr} PPR (approx.).`);

  const numTeams = closest(teams, ALLOWED_TEAMS);
  if (numTeams !== teams) notes.push(`League has ${teams} teams → using ${numTeams} (approx.).`);

  const tep = tepFromBonus(bonusRecTe);
  if (tep !== "none") notes.push(`TE bonus ${bonusRecTe} per reception → ${tep === "te+" ? "TE+" : "TE++"} (assumed mapping).`);

  return {
    settings: { format, numQbs: superflex ? 2 : 1, ppr, numTeams, tep },
    notes,
    source: { type, superflex, rec, bonusRecTe, totalRosters: teams, draftRounds: league.settings.draft_rounds ?? null },
  };
}

export interface LeagueTeam {
  rosterId: number;
  name: string;
  owner: string | null;
  /** Every player on the roster, including taxi and reserve. */
  players: string[];
}

export function buildTeams(rosters: readonly SleeperRoster[], users: readonly SleeperLeagueUser[]): LeagueTeam[] {
  const byId = new Map(users.map((u) => [u.user_id, u]));
  return [...rosters]
    .sort((a, b) => a.roster_id - b.roster_id)
    .map((r) => {
      const u = r.owner_id ? byId.get(r.owner_id) : undefined;
      const players = new Set([...(r.players ?? []), ...(r.taxi ?? []), ...(r.reserve ?? [])]);
      return {
        rosterId: r.roster_id,
        name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
        owner: u?.display_name ?? null,
        players: [...players],
      };
    });
}
