import { normalizeName } from "./names";

export interface SearchablePlayer {
  id: string;
  name: string;
  pos: string;
  team: string | null;
  /** Consensus value, used to rank equally good matches. */
  value?: number | null;
}

/**
 * Typeahead over name, position and NFL team. Every query word must prefix a
 * name word, the position, or the team ("wr det", "chase", "bij"). Exact and
 * leading-name matches rank first, then higher consensus value.
 */
export function searchPlayers<T extends SearchablePlayer>(query: string, players: readonly T[], limit = 10): T[] {
  const q = normalizeName(query);
  if (!q) return [];
  const tokens = q.split(" ");
  const hits: { p: T; rank: number }[] = [];
  for (const p of players) {
    const name = normalizeName(p.name);
    const words = [...name.split(" "), p.pos.toLowerCase(), (p.team ?? "").toLowerCase()];
    if (!tokens.every((t) => words.some((w) => w.startsWith(t)))) continue;
    hits.push({ p, rank: name === q ? 0 : name.startsWith(q) ? 1 : 2 });
  }
  hits.sort((a, b) => a.rank - b.rank || (b.p.value ?? -1) - (a.p.value ?? -1) || a.p.name.localeCompare(b.p.name));
  return hits.slice(0, limit).map((h) => h.p);
}
