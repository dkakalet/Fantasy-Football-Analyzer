import { describe, expect, it } from "vitest";
import { computeScaleFactor, DEFAULT_TOP_N } from "./normalize";

const map = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("computeScaleFactor", () => {
  it("is Σ reference / Σ source over shared players", () => {
    const ref = map({ a: 1000, b: 600, c: 400 });
    const src = map({ a: 500, b: 300, c: 200 });
    const f = computeScaleFactor(ref, src);
    expect(f.factor).toBe(2000 / 1000);
    expect(f).toMatchObject({ overlap: 3, used: 3, refSum: 2000, sourceSum: 1000 });
  });

  it("ignores players missing from either source", () => {
    const ref = map({ a: 900, b: 600, onlyRef: 5000 });
    const src = map({ a: 300, b: 300, onlySrc: 9999 });
    const f = computeScaleFactor(ref, src);
    expect(f.overlap).toBe(2);
    expect(f.factor).toBeCloseTo(1500 / 600);
  });

  it("uses only the top N shared players, ranked by reference value", () => {
    const ref = map({ a: 1000, b: 800, c: 100 });
    const src = map({ a: 100, b: 100, c: 1000 });
    // N = 2 keeps a and b (highest reference values); c is excluded.
    expect(computeScaleFactor(ref, src, 2).factor).toBe(1800 / 200);
    expect(computeScaleFactor(ref, src, 3).factor).toBe(1900 / 1200);
  });

  it("defaults N to 150", () => {
    expect(DEFAULT_TOP_N).toBe(150);
    const ids = Array.from({ length: 200 }, (_, i) => `p${i}`);
    const ref = new Map(ids.map((id, i) => [id, 1000 - i]));
    const src = new Map(ids.map((id) => [id, 1]));
    const f = computeScaleFactor(ref, src);
    expect(f.used).toBe(150);
    expect(f.sourceSum).toBe(150);
  });

  it("returns a null factor with no overlap", () => {
    expect(computeScaleFactor(map({ a: 1 }), map({ b: 1 })).factor).toBeNull();
  });
});
