// Scale normalization. FantasyCalc is the reference scale; every other source is
// multiplied by a factor so its values line up:
//
//   factor = Σ ref_values / Σ source_values
//
// over the top N players (by reference value) present in both sources.
// Only players are used to fit the factor; it is then applied to picks too.

export const DEFAULT_TOP_N = 150;

export interface ScaleFactor {
  /** null when the sources share no players (source can't be normalized). */
  factor: number | null;
  /** Players present in both sources. */
  overlap: number;
  /** Players actually used (min(overlap, N)). */
  used: number;
  refSum: number;
  sourceSum: number;
}

export function computeScaleFactor(
  reference: ReadonlyMap<string, number>,
  source: ReadonlyMap<string, number>,
  topN: number = DEFAULT_TOP_N,
): ScaleFactor {
  const shared = [...reference.keys()].filter((id) => source.has(id));
  const top = shared.sort((a, b) => reference.get(b)! - reference.get(a)!).slice(0, topN);
  let refSum = 0;
  let sourceSum = 0;
  for (const id of top) {
    refSum += reference.get(id)!;
    sourceSum += source.get(id)!;
  }
  return {
    factor: top.length > 0 && sourceSum > 0 ? refSum / sourceSum : null,
    overlap: shared.length,
    used: top.length,
    refSum,
    sourceSum,
  };
}
