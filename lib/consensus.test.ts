import { describe, expect, it } from "vitest";
import { consensus, median } from "./consensus";

describe("median / consensus", () => {
  it("one source: uses it and flags singleSource", () => {
    expect(consensus([4200])).toEqual({ value: 4200, singleSource: true, sourceCount: 1 });
  });

  it("two sources: the mean", () => {
    expect(consensus([4000, 5000])).toEqual({ value: 4500, singleSource: false, sourceCount: 2 });
  });

  it("three sources: the middle value, whatever the input order", () => {
    expect(median([9000, 3000, 5000])).toBe(5000);
    expect(consensus([5000, 9000, 3000]).value).toBe(5000);
  });

  it("missing from every source: null ('no value'), never 0", () => {
    expect(consensus([])).toEqual({ value: null, singleSource: false, sourceCount: 0 });
  });
});
