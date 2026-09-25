// Turning a list of trade assets into valued assets and a trade analysis.
// Pure and client-safe; shared by the UI and the CLI.

import { parsePickKey, pickLabel, slotToTier, tierKey } from "./picks";
import { analyzeTrade, type TradeAnalysis } from "./scoring";
import type { AssetKind } from "./types";
import type { ConsensusAsset, SourceValue } from "./valuation";

export interface AssetRef {
  id: string;
  /** Display fields for when the asset has no value (e.g. a player no source lists). */
  name?: string;
  position?: string | null;
  team?: string | null;
}

export interface ValuedAsset {
  id: string;
  kind: AssetKind;
  name: string;
  position: string | null;
  team: string | null;
  /** Consensus value; null = "no value" (excluded from totals). */
  value: number | null;
  singleSource: boolean;
  sources: SourceValue[];
  /** Set when the value came from a related key (an exact slot valued at its tier). */
  valuedAs?: string;
}

/**
 * Find the consensus entry for an asset. An exact-slot pick that no source
 * prices is valued at its tier (slot -> tier, scaled to team count).
 */
export function valueAsset(ref: AssetRef, assets: ReadonlyMap<string, ConsensusAsset>, teams: number): ValuedAsset {
  const pick = parsePickKey(ref.id);
  let found = assets.get(ref.id);
  let valuedAs: string | undefined;
  if (!found && pick?.slot != null) {
    const tk = tierKey(pick.season, pick.round, slotToTier(pick.slot, teams));
    found = assets.get(tk);
    if (found) valuedAs = tk;
  }
  return {
    id: ref.id,
    kind: pick ? "pick" : "player",
    name: pick ? pickLabel(ref.id) : (found?.name ?? ref.name ?? ref.id),
    position: found?.position ?? ref.position ?? null,
    team: found ? found.team : (ref.team ?? null),
    value: found?.value ?? null,
    singleSource: found?.singleSource ?? false,
    sources: found?.sources ?? [],
    ...(valuedAs ? { valuedAs } : {}),
  };
}

export interface TradeEvaluation {
  aGives: ValuedAsset[];
  bGives: ValuedAsset[];
  analysis: TradeAnalysis;
}

/** Team A receives what Team B gives, and vice versa. */
export function evaluateTrade(input: {
  aGives: readonly AssetRef[];
  bGives: readonly AssetRef[];
  assets: ReadonlyMap<string, ConsensusAsset>;
  teams: number;
  vRef: number;
  alpha: number;
}): TradeEvaluation {
  const aGives = input.aGives.map((r) => valueAsset(r, input.assets, input.teams));
  const bGives = input.bGives.map((r) => valueAsset(r, input.assets, input.teams));
  const analysis = analyzeTrade({
    aReceives: bGives.map((a) => a.value),
    bReceives: aGives.map((a) => a.value),
    vRef: input.vRef,
    alpha: input.alpha,
  });
  return { aGives, bGives, analysis };
}
