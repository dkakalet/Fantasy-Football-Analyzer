// Scale normalization: put every source on the reference source's scale
// (FantasyCalc unless it's down) so their values can be combined.
//
// Default method, "rank" (rank matching, a.k.a. equipercentile linking):
//   Take the players both sources list. Sort each source's values for those players
//   on its own. The source's k-th highest value maps to the reference's k-th highest
//   value; values in between are interpolated linearly; values above/below the
//   shared range are scaled proportionally from the nearest end.
//   A source's opinion (its ordering, and where a pick sits among its players) is
//   kept; only the shape of its value curve is replaced by the reference's. Sources
//   whose curves are flatter (Dynasty Dealer, KTC) or steeper (DynastyProcess) than
//   FantasyCalc's no longer read systematically low at the top or high in depth.
//
// Previous method, "linear" (still available with NORMALIZATION=linear):
//   factor = Σ ref_values / Σ source_values over the top N (default 150) shared
//   players by reference value; every value × factor. One number per source, but it
//   can't correct curve shape.
//
// Only players are used to fit either mapping; it is then applied to picks too.

export type NormalizationMethod = "rank" | "linear";
export const DEFAULT_NORMALIZATION: NormalizationMethod = "rank";

/** Linear method: how many top shared players fit the factor. */
export const DEFAULT_TOP_N = 150;

/** Rank method: fewer shared players than this and the source can't be calibrated. */
export const MIN_SHARED = 20;

// ------------------------------------------------------------------- linear

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

// --------------------------------------------------------------------- rank

/** One point of a rank map: source value -> reference value, at a (1-based) rank among shared players. */
export interface RankAnchor {
  source: number;
  reference: number;
  rank: number;
}

export interface RankMap {
  /** Strictly descending by `source`. Tied source values are merged (reference and rank averaged). */
  anchors: RankAnchor[];
  overlap: number;
}

export function fitRankMap(reference: ReadonlyMap<string, number>, source: ReadonlyMap<string, number>): RankMap {
  const shared = [...reference.keys()].filter((id) => source.has(id));
  const s = shared.map((id) => source.get(id)!).sort((a, b) => b - a);
  const r = shared.map((id) => reference.get(id)!).sort((a, b) => b - a);
  const anchors: RankAnchor[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[i]) j++;
    let refSum = 0;
    for (let k = i; k <= j; k++) refSum += r[k];
    anchors.push({ source: s[i], reference: refSum / (j - i + 1), rank: (i + j) / 2 + 1 });
    i = j + 1;
  }
  return { anchors, overlap: shared.length };
}

/** Map a source value onto the reference scale; also returns the equivalent rank among shared players. */
export function applyRankMap(map: RankMap, v: number): { value: number; rank: number } {
  const a = map.anchors;
  const first = a[0];
  const last = a[a.length - 1];
  if (v >= first.source) return { value: first.reference * (v / first.source), rank: first.rank };
  if (v <= last.source) return { value: last.source > 0 ? last.reference * (v / last.source) : last.reference, rank: last.rank };
  // Binary search: a[lo].source >= v > a[hi].source.
  let lo = 0;
  let hi = a.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid].source >= v) lo = mid;
    else hi = mid;
  }
  const t = (a[lo].source - v) / (a[lo].source - a[hi].source);
  return {
    value: a[lo].reference + t * (a[hi].reference - a[lo].reference),
    rank: a[lo].rank + t * (a[hi].rank - a[lo].rank),
  };
}

// --------------------------------------------------------------- normalizer

export interface Normalizer {
  method: "reference" | NormalizationMethod;
  /** Players both sources list. */
  overlap: number;
  /** Players the mapping was fitted on. */
  used: number;
  /** Linear method only (1 for the reference). */
  factor: number | null;
  apply(v: number): { value: number; rank?: number };
}

export function referenceNormalizer(overlap: number): Normalizer {
  return { method: "reference", overlap, used: overlap, factor: 1, apply: (v) => ({ value: v }) };
}

/** Fit a source onto the reference scale; null when there isn't enough overlap to do so. */
export function fitNormalizer(
  reference: ReadonlyMap<string, number>,
  source: ReadonlyMap<string, number>,
  method: NormalizationMethod = DEFAULT_NORMALIZATION,
  opts: { topN?: number; minShared?: number } = {},
): Normalizer | null {
  if (method === "linear") {
    const f = computeScaleFactor(reference, source, opts.topN ?? DEFAULT_TOP_N);
    if (f.factor === null) return null;
    const factor = f.factor;
    return { method, overlap: f.overlap, used: f.used, factor, apply: (v) => ({ value: v * factor }) };
  }
  const map = fitRankMap(reference, source);
  if (map.overlap < (opts.minShared ?? MIN_SHARED)) return null;
  return { method, overlap: map.overlap, used: map.overlap, factor: null, apply: (v) => applyRankMap(map, v) };
}
