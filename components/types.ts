// Response shapes of the app's own API routes, as the client sees them.

import type { LeagueTeam, MappedLeague } from "@/lib/sleeper/league";
import type { InventoryPick } from "@/lib/sleeper/picks";
import type { LeagueSettings } from "@/lib/types";
import type { SourceMeta } from "@/lib/valuation";

export type HealthStatus = SourceMeta["status"] | "disabled";

export interface HealthSource extends Partial<Omit<SourceMeta, "id" | "name" | "status">> {
  id: string;
  name: string;
  status: HealthStatus;
  recordCount?: number;
}

export interface Health {
  checkedAt: string;
  settings: LeagueSettings;
  reference: string | null;
  sources: HealthSource[];
  sleeperPlayers: { status: string; recordCount?: number; fetchedAt?: string; error?: string };
  warnings: string[];
}

export interface IndexPlayer {
  id: string;
  name: string;
  pos: string;
  team: string | null;
}

export interface PlayersResponse {
  fetchedAt?: string;
  players: IndexPlayer[];
  error?: string;
}

export interface LeagueSummary {
  id: string;
  name: string;
  season: string;
  status: string;
  totalRosters: number;
  type: string;
  superflex: boolean;
}

export interface LeaguesResponse {
  user: { id: string; displayName: string };
  season: string;
  leagues: LeagueSummary[];
}

export interface LeagueResponse {
  league: { id: string; name: string; season: string; status: string; totalRosters: number };
  settings: LeagueSettings;
  notes: string[];
  source: MappedLeague["source"];
  teams: (LeagueTeam & { picks: InventoryPick[] })[];
  pickSeasons: number[];
  rounds: number;
  players: IndexPlayer[];
  fetchedAt: string;
}
