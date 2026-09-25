// Trade scoring. Pure functions only — shared by the UI, the CLI and tests.
//
// 1. Raw sum:        A = Σ consensus values Team A receives; B likewise.
// 2. Consolidation-adjusted (our own transparent heuristic, not any site's formula):
//                    adj(v) = V_ref × (v / V_ref)^α
//    V_ref = consensus value of the #1 overall asset under the current settings.
//    α = 1 reproduces the raw sum; larger α rewards stars over depth.
// Score per party:   score_A = 100 × A / (A + B), score_B = 100 − score_A.

export const DEFAULT_ALPHA = 1.35;
export const ALPHA_RANGE = { min: 1, max: 2, step: 0.05 } as const;

/** |score − 50| ≤ fair → "Fair"; ≤ slight → "Slight edge to X"; otherwise "Favors X". */
export const VERDICT_BANDS = { fair: 2.5, slight: 7.5 } as const;
export type VerdictBands = { fair: number; slight: number };

export type Side = "A" | "B";

export function adjust(v: number, vRef: number, alpha: number): number {
  return vRef * Math.pow(v / vRef, alpha);
}

/** Inverse of adjust(): the raw value whose adjusted value is `adj`. */
export function inverseAdjust(adj: number, vRef: number, alpha: number): number {
  return vRef * Math.pow(adj / vRef, 1 / alpha);
}

export function tradeScores(a: number, b: number): { scoreA: number; scoreB: number } {
  if (a + b <= 0) return { scoreA: 50, scoreB: 50 };
  const scoreA = (100 * a) / (a + b);
  return { scoreA, scoreB: 100 - scoreA };
}

export type VerdictKind = "fair" | "slight" | "favors";
export interface Verdict {
  kind: VerdictKind;
  favored: Side | null;
}

export function verdict(scoreA: number, bands: VerdictBands = VERDICT_BANDS): Verdict {
  const d = Math.abs(scoreA - 50);
  if (d <= bands.fair) return { kind: "fair", favored: null };
  const favored: Side = scoreA > 50 ? "A" : "B";
  return { kind: d <= bands.slight ? "slight" : "favors", favored };
}

export function verdictLabel(v: Verdict, names: Record<Side, string> = { A: "Team A", B: "Team B" }): string {
  if (v.kind === "fair" || !v.favored) return "Fair";
  return v.kind === "slight" ? `Slight edge to ${names[v.favored]}` : `Favors ${names[v.favored]}`;
}

export interface MethodResult {
  /** Totals received by each team, in this method's points. */
  A: number;
  B: number;
  scoreA: number;
  scoreB: number;
  verdict: Verdict;
  /** |A − B| in this method's points. */
  gap: number;
  /** The favored team, who would need to add value to even it out; null when even. */
  payer: Side | null;
  /**
   * Consensus value of one added asset that closes the gap.
   * Raw: equals `gap`. Adjusted: inverseAdjust(gap).
   */
  gapAssetValue: number;
}

export interface TradeInput {
  /** Consensus values of what Team A receives; null = no value (excluded from totals). */
  aReceives: readonly (number | null)[];
  bReceives: readonly (number | null)[];
  vRef: number;
  alpha: number;
  bands?: VerdictBands;
}

export interface TradeAnalysis {
  raw: MethodResult;
  adjusted: MethodResult;
  /** Count of assets per side excluded for having no value. */
  missing: Record<Side, number>;
}

const valued = (xs: readonly (number | null)[]) => xs.filter((x): x is number => x !== null);
const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

function method(A: number, B: number, bands: VerdictBands, toAsset: (gap: number) => number): MethodResult {
  const { scoreA, scoreB } = tradeScores(A, B);
  const gap = Math.abs(A - B);
  return {
    A,
    B,
    scoreA,
    scoreB,
    verdict: verdict(scoreA, bands),
    gap,
    payer: A > B ? "A" : B > A ? "B" : null,
    gapAssetValue: gap > 0 ? toAsset(gap) : 0,
  };
}

export function analyzeTrade({ aReceives, bReceives, vRef, alpha, bands = VERDICT_BANDS }: TradeInput): TradeAnalysis {
  const a = valued(aReceives);
  const b = valued(bReceives);
  const adj = (xs: number[]) => sum(xs.map((v) => adjust(v, vRef, alpha)));
  return {
    raw: method(sum(a), sum(b), bands, (g) => g),
    adjusted: method(adj(a), adj(b), bands, (g) => inverseAdjust(g, vRef, alpha)),
    missing: { A: aReceives.length - a.length, B: bReceives.length - b.length },
  };
}
