// Sleeper player database (/players/nfl). The raw payload is ~15 MB, which is
// over Next's 2 MB data-cache limit, so it's fetched with `no-store`, trimmed to
// offensive skill positions, and cached for 24h by lib/cache.ts.

import { cached, TTL, type Cached } from "../cache";
import { fetchJson } from "../http";
import { sleeperUrls } from "./client";

export const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE"] as const;

/** Fields of a raw /players/nfl entry that this app reads. */
export interface SleeperRawPlayer {
  player_id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  active?: boolean | null;
  years_exp?: number | null;
}

export interface SleeperPlayer {
  id: string;
  name: string;
  pos: string;
  team: string | null;
  active: boolean;
}

export function trimPlayers(raw: Record<string, SleeperRawPlayer>): SleeperPlayer[] {
  const out: SleeperPlayer[] = [];
  for (const p of Object.values(raw)) {
    const pos = p.position ?? "";
    if (!(FANTASY_POSITIONS as readonly string[]).includes(pos)) continue;
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (!name) continue;
    out.push({ id: p.player_id, name, pos, team: p.team ?? null, active: Boolean(p.active) });
  }
  return out;
}

export function fetchSleeperPlayers(): Promise<Cached<SleeperPlayer[]>> {
  return cached("sleeper:players:nfl", TTL.sleeperPlayers, async () =>
    trimPlayers(await fetchJson<Record<string, SleeperRawPlayer>>(sleeperUrls.players(), 60_000)),
  );
}
