import { describe, expect, it } from "vitest";
import { applyRankMap, computeScaleFactor, DEFAULT_TOP_N, fitNormalizer, fitRankMap, MIN_SHARED } from "./normalize";

const map = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("computeScaleFactor (linear method, NORMALIZATION=linear)", () => {
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

describe("rank matching (default)", () => {
  // The source ranks players the same way but on a squashed, capped curve.
  const ref = map({ a: 10000, b: 8000, c: 5000, d: 2000, e: 500 });
  const src = map({ a: 9999, b: 9998, c: 9000, d: 7000, e: 6000, onlySrc: 9500 });

  it("maps the k-th highest shared source value to the k-th highest reference value", () => {
    const m = fitRankMap(ref, src);
    expect(m.overlap).toBe(5);
    expect(applyRankMap(m, 9999)).toEqual({ value: 10000, rank: 1 });
    expect(applyRankMap(m, 9000)).toEqual({ value: 5000, rank: 3 });
    expect(applyRankMap(m, 6000)).toEqual({ value: 500, rank: 5 });
  });

  it("interpolates between neighbours, for players and picks the reference doesn't list", () => {
    const m = fitRankMap(ref, src);
    // 9500 (a player only the source lists) sits between its 2nd (9998) and 3rd (9000) shared values.
    const t = (9998 - 9500) / (9998 - 9000);
    const r = applyRankMap(m, 9500);
    expect(r.value).toBeCloseTo(8000 + t * (5000 - 8000));
    expect(r.rank).toBeCloseTo(2 + t);
  });

  it("scales proportionally beyond either end of the shared range", () => {
    const m = fitRankMap(ref, src);
    expect(applyRankMap(m, 3000).value).toBeCloseTo(500 * (3000 / 6000));
    expect(applyRankMap(m, 12000).value).toBeCloseTo(10000 * (12000 / 9999));
  });

  it("is monotonic and ignores the source's curve shape", () => {
    // Any increasing transform of the reference gives back the reference exactly.
    const squashed = new Map([...ref].map(([id, v]) => [id, Math.sqrt(v) * 3]));
    const m = fitRankMap(ref, squashed);
    for (const [id, v] of squashed) expect(applyRankMap(m, v).value).toBeCloseTo(ref.get(id)!);
    let prev = Infinity;
    for (let v = 400; v >= 1; v -= 7) {
      const out = applyRankMap(m, v).value;
      expect(out).toBeLessThanOrEqual(prev);
      prev = out;
    }
  });

  it("averages tied source values", () => {
    const m = fitRankMap(map({ a: 900, b: 600, c: 300 }), map({ a: 50, b: 50, c: 10 }));
    expect(m.anchors).toEqual([
      { source: 50, reference: 750, rank: 1.5 },
      { source: 10, reference: 300, rank: 3 },
    ]);
  });

  it("needs enough shared players to calibrate", () => {
    expect(fitNormalizer(ref, src, "rank", { minShared: 6 })).toBeNull();
    expect(fitNormalizer(ref, src, "rank", { minShared: 5 })).not.toBeNull();
    expect(MIN_SHARED).toBe(20);
  });

  it("the linear method is still available", () => {
    const n = fitNormalizer(map({ a: 1000, b: 600 }), map({ a: 500, b: 300 }), "linear")!;
    expect(n).toMatchObject({ method: "linear", factor: 2 });
    expect(n.apply(250).value).toBe(500);
  });
});
