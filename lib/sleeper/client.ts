// Sleeper read-only API (free for non-commercial use, no auth).
// Endpoint shapes confirmed against live responses — see fixtures/sleeper.

import { cached, TTL, type Cached } from "../cache";
import { fetchJson } from "../http";

export const SLEEPER_BASE = "https://api.sleeper.app/v1";

export const sleeperUrls = {
  state: () => `${SLEEPER_BASE}/state/nfl`,
  user: (username: string) => `${SLEEPER_BASE}/user/${encodeURIComponent(username)}`,
  leagues: (userId: string, season: string) =>
    `${SLEEPER_BASE}/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`,
  league: (id: string) => `${SLEEPER_BASE}/league/${encodeURIComponent(id)}`,
  rosters: (id: string) => `${SLEEPER_BASE}/league/${encodeURIComponent(id)}/rosters`,
  users: (id: string) => `${SLEEPER_BASE}/league/${encodeURIComponent(id)}/users`,
  tradedPicks: (id: string) => `${SLEEPER_BASE}/league/${encodeURIComponent(id)}/traded_picks`,
  drafts: (id: string) => `${SLEEPER_BASE}/league/${encodeURIComponent(id)}/drafts`,
  players: () => `${SLEEPER_BASE}/players/nfl`,
};

export interface SleeperState {
  season: string;
  season_type: string; // "pre" | "regular" | "post" | "off"
  league_season: string;
  previous_season: string;
  week: number;
}

export interface SleeperUser {
  user_id: string;
  username?: string;
  display_name: string;
  avatar?: string | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  roster_positions: string[];
  previous_league_id: string | null;
  draft_id: string | null;
  /** `type`: 0 redraft, 1 keeper, 2 dynasty, 3 observed on a guillotine league. */
  settings: { type?: number; draft_rounds?: number; num_teams?: number } & Record<string, unknown>;
  scoring_settings: { rec?: number; bonus_rec_te?: number } & Record<string, number>;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners?: string[] | null;
  players: string[] | null;
  reserve?: string[] | null;
  taxi?: string[] | null;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string } | null;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  /** Roster that originally owned the pick. */
  roster_id: number;
  /** Roster that owns it now. */
  owner_id: number;
  previous_owner_id: number;
}

export interface SleeperDraft {
  draft_id: string;
  season: string;
  status: string; // "pre_draft" | "drafting" | "complete" | ...
  type: string;
  settings: { rounds?: number; teams?: number } & Record<string, unknown>;
  draft_order?: Record<string, number> | null;
  slot_to_roster_id?: Record<string, number> | null;
}

const league = <T>(url: string) => cached(`sleeper:${url}`, TTL.sleeperLeague, () => fetchJson<T>(url));

export const sleeper = {
  state: () => league<SleeperState>(sleeperUrls.state()),
  user: (username: string) => league<SleeperUser | null>(sleeperUrls.user(username)),
  leagues: (userId: string, season: string) =>
    league<SleeperLeague[] | null>(sleeperUrls.leagues(userId, season)),
  league: (id: string) => league<SleeperLeague | null>(sleeperUrls.league(id)),
  rosters: (id: string) => league<SleeperRoster[]>(sleeperUrls.rosters(id)),
  users: (id: string) => league<SleeperLeagueUser[]>(sleeperUrls.users(id)),
  tradedPicks: (id: string) => league<SleeperTradedPick[]>(sleeperUrls.tradedPicks(id)),
  drafts: (id: string) => league<SleeperDraft[]>(sleeperUrls.drafts(id)),
} satisfies Record<string, (...args: string[]) => Promise<Cached<unknown>>>;
