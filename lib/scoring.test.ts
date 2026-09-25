import { describe, expect, it } from "vitest";
import { adjust, analyzeTrade, inverseAdjust, tradeScores, verdict, verdictLabel, VERDICT_BANDS } from "./scoring";

const V_REF = 10_000;

describe("adjust", () => {
  it("leaves V_ref unchanged and shrinks smaller values more as α grows", () => {
    expect(adjust(V_REF, V_REF, 1.35)).toBe(V_REF);
    expect(adjust(5000, V_REF, 1)).toBeCloseTo(5000);
    expect(adjust(5000, V_REF, 1.35)).toBeLessThan(5000);
    expect(adjust(5000, V_REF, 2)).toBeCloseTo(2500);
  });

  it("inverseAdjust undoes adjust", () => {
    expect(inverseAdjust(adjust(3210, V_REF, 1.35), V_REF, 1.35)).toBeCloseTo(3210);
  });
});

describe("analyzeTrade", () => {
  it("α = 1 matches the raw sum", () => {
    const t = analyzeTrade({ aReceives: [7000, 1200], bReceives: [4000, 3500, 900], vRef: V_REF, alpha: 1 });
    expect(t.adjusted.A).toBeCloseTo(t.raw.A);
    expect(t.adjusted.B).toBeCloseTo(t.raw.B);
    expect(t.adjusted.scoreA).toBeCloseTo(t.raw.scoreA);
    expect(t.raw).toMatchObject({ A: 8200, B: 8400 });
  });

  it("1-for-2 consolidation: an even raw trade favors the side getting the star", () => {
    // Team A receives one 8000 star; Team B receives two 4000 pieces.
    const t = analyzeTrade({ aReceives: [8000], bReceives: [4000, 4000], vRef: V_REF, alpha: 1.35 });
    expect(t.raw.scoreA).toBe(50);
    expect(t.raw.verdict).toEqual({ kind: "fair", favored: null });
    // adj(8000) = 10000 × 0.8^1.35 ≈ 7399; adj(4000) ≈ 2903 each.
    expect(t.adjusted.A).toBeCloseTo(7399.3, 0);
    expect(t.adjusted.B).toBeCloseTo(2 * 2902.5, 0);
    expect(t.adjusted.scoreA).toBeCloseTo(56.04, 1);
    expect(t.adjusted.verdict).toEqual({ kind: "slight", favored: "A" });
    expect(t.adjusted.payer).toBe("A");
    // The adjusted gap is expressed as one asset's consensus value.
    expect(adjust(t.adjusted.gapAssetValue, V_REF, 1.35)).toBeCloseTo(t.adjusted.gap);
  });

  it("excludes no-value assets from totals and counts them", () => {
    const t = analyzeTrade({ aReceives: [5000, null], bReceives: [5000], vRef: V_REF, alpha: 1.35 });
    expect(t.raw.A).toBe(5000);
    expect(t.missing).toEqual({ A: 1, B: 0 });
  });

  it("reports the raw gap and who needs to add it", () => {
    const t = analyzeTrade({ aReceives: [3000], bReceives: [5000], vRef: V_REF, alpha: 1.35 });
    expect(t.raw.gap).toBe(2000);
    expect(t.raw.gapAssetValue).toBe(2000);
    expect(t.raw.payer).toBe("B"); // B receives more, so B adds
  });

  it("an empty trade scores 50/50", () => {
    expect(tradeScores(0, 0)).toEqual({ scoreA: 50, scoreB: 50 });
    expect(analyzeTrade({ aReceives: [], bReceives: [], vRef: V_REF, alpha: 1.35 }).raw.payer).toBeNull();
  });
});

describe("verdict bands", () => {
  it("uses the configured constants", () => {
    expect(VERDICT_BANDS).toEqual({ fair: 2.5, slight: 7.5 });
  });

  it.each([
    [50, "fair", null],
    [52.5, "fair", null], // |d| = 2.5 is still fair
    [47.5, "fair", null],
    [52.51, "slight", "A"],
    [47.49, "slight", "B"],
    [57.5, "slight", "A"], // |d| = 7.5 is still a slight edge
    [42.5, "slight", "B"],
    [57.51, "favors", "A"],
    [42.49, "favors", "B"],
  ])("score_A = %s -> %s (%s)", (scoreA, kind, favored) => {
    expect(verdict(scoreA)).toEqual({ kind, favored });
  });

  it("band edges hold with scores computed from totals", () => {
    expect(verdict(tradeScores(52.5, 47.5).scoreA).kind).toBe("fair");
    expect(verdict(tradeScores(57.5, 42.5).scoreA).kind).toBe("slight");
  });

  it("labels", () => {
    const names = { A: "Sharks", B: "Jets" };
    expect(verdictLabel({ kind: "fair", favored: null }, names)).toBe("Fair");
    expect(verdictLabel({ kind: "slight", favored: "B" }, names)).toBe("Slight edge to Jets");
    expect(verdictLabel({ kind: "favors", favored: "A" }, names)).toBe("Favors Sharks");
  });
});
