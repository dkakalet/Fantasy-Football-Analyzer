// Response shapes of the app's own API routes, as the client sees them.

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
