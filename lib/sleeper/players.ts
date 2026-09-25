// Sleeper player database (/players/nfl). The raw payload is ~15 MB, which is
// over Next's 2 MB data-cache limit, so it's fetched with `no-store`, trimmed to
// offensive skill positions, and cached for 24h by lib/cache.ts.

import { cached, TTL, type Cached } from "../cache";
import { fetchJson } from "../http";
import { normalizeName } from "../names";
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
  const offense = FANTASY_POSITIONS as readonly string[];
  for (const p of Object.values(raw)) {
    // Two-way players (e.g. Travis Hunter: position "DB", fantasy_positions ["DB", "WR"])
    // are kept under their first offensive fantasy position.
    const pos = offense.includes(p.position ?? "") ? p.position! : p.fantasy_positions?.find((f) => offense.includes(f));
    if (!pos) continue;
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (!name) continue;
    out.push({ id: p.player_id, name, pos, team: p.team ?? null, active: Boolean(p.active) });
  }
  return out;
}

export function fetchSleeperPlayers(): Promise<Cached<SleeperPlayer[]>> {
  // Bump the version when trimPlayers changes so cached copies are refetched.
  return cached("sleeper:players:nfl:v2", TTL.sleeperPlayers, async () =>
    trimPlayers(await fetchJson<Record<string, SleeperRawPlayer>>(sleeperUrls.players(), 60_000)),
  );
}

/**
 * Name + position lookup into the Sleeper player DB, for sources without a
 * usable ID. Ambiguous names prefer a team match, then active players.
 */
export function buildNameIndex(players: readonly SleeperPlayer[]) {
  const byKey = new Map<string, SleeperPlayer[]>();
  for (const p of players) {
    const k = `${normalizeName(p.name)}|${p.pos}`;
    const list = byKey.get(k);
    if (list) list.push(p);
    else byKey.set(k, [p]);
  }
  return (name: string, pos: string, team?: string | null): string | undefined => {
    const list = byKey.get(`${normalizeName(name)}|${pos}`);
    if (!list) return undefined;
    if (list.length === 1) return list[0].id;
    const score = (p: SleeperPlayer) => (team && p.team === team ? 2 : 0) + (p.active ? 1 : 0);
    return [...list].sort((a, b) => score(b) - score(a))[0].id;
  };
}
