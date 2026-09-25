// Future draft pick inventory per team, from the league's draft settings plus
// its traded-picks list.
//
// What the live API showed (fixtures/sleeper):
// - traded_picks rows are {season, round, roster_id (original owner),
//   owner_id (current roster), previous_owner_id}, and include picks from
//   drafts that already happened.
// - No endpoint states how many future seasons are tradable. Across 26 live
//   leagues in Sept 2026, traded seasons were 2027-2029, i.e. three seasons
//   from the first draft that hasn't happened yet. That window is a constant here.

import { slotKey, tierKey } from "../picks";
import type { SleeperDraft, SleeperLeague, SleeperTradedPick } from "./client";

export const FUTURE_PICK_SEASONS = 3;

export interface InventoryPick {
  /** Stable ID for this physical pick: season-round-original roster. */
  id: string;
  season: number;
  round: number;
  originalRosterId: number;
  ownerRosterId: number;
  /** Canonical pick key: exact slot when the draft order is set, else the MID tier. */
  key: string;
  slot: number | null;
}

/** First season whose draft hasn't completed: the league season, or the next one. */
export function firstOpenSeason(league: SleeperLeague, drafts: readonly SleeperDraft[]): number {
  const season = Number(league.season);
  const done = drafts.some((d) => Number(d.season) === season && d.status === "complete");
  return done ? season + 1 : season;
}

/** Exact slot of a roster's pick in a season, when that season's draft order is set. */
function slotFor(drafts: readonly SleeperDraft[], season: number, rosterId: number): number | null {
  for (const d of drafts) {
    if (Number(d.season) !== season || !d.slot_to_roster_id) continue;
    for (const [slot, rid] of Object.entries(d.slot_to_roster_id)) if (rid === rosterId) return Number(slot);
  }
  return null;
}

export function buildPickInventory(input: {
  league: SleeperLeague;
  rosterIds: readonly number[];
  tradedPicks: readonly SleeperTradedPick[];
  drafts: readonly SleeperDraft[];
  seasonsAhead?: number;
}): { seasons: number[]; rounds: number; picks: InventoryPick[] } {
  const { league, rosterIds, tradedPicks, drafts, seasonsAhead = FUTURE_PICK_SEASONS } = input;
  const first = firstOpenSeason(league, drafts);
  const rounds = league.settings.draft_rounds ?? 4;
  const seasons = new Set<number>();
  for (let s = first; s < first + seasonsAhead; s++) seasons.add(s);
  // Never hide a pick that was actually traded for a later season.
  for (const t of tradedPicks) if (Number(t.season) >= first) seasons.add(Number(t.season));

  const owner = new Map<string, number>();
  const id = (season: number, round: number, orig: number) => `${season}-${round}-${orig}`;
  for (const season of seasons) for (let round = 1; round <= rounds; round++) for (const r of rosterIds) owner.set(id(season, round, r), r);
  for (const t of tradedPicks) {
    const k = id(Number(t.season), t.round, t.roster_id);
    if (owner.has(k)) owner.set(k, t.owner_id);
  }

  const picks: InventoryPick[] = [];
  for (const [k, ownerRosterId] of owner) {
    const [season, round, orig] = k.split("-").map(Number);
    const slot = slotFor(drafts, season, orig);
    picks.push({
      id: k,
      season,
      round,
      originalRosterId: orig,
      ownerRosterId,
      key: slot !== null ? slotKey(season, round, slot) : tierKey(season, round, "MID"),
      slot,
    });
  }
  picks.sort((a, b) => a.season - b.season || a.round - b.round || a.originalRosterId - b.originalRosterId);
  return { seasons: [...seasons].sort((a, b) => a - b), rounds, picks };
}
