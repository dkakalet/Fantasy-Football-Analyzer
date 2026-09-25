import { describe, expect, it } from "vitest";
import { evaluateTrade, valueAsset } from "./trade";
import type { ConsensusAsset } from "./valuation";

const asset = (id: string, value: number, kind: "player" | "pick" = "player"): ConsensusAsset => ({
  id,
  kind,
  name: id,
  position: null,
  team: null,
  value,
  singleSource: false,
  sources: [],
});

const assets = new Map([
  ["p1", asset("p1", 8000)],
  ["p2", asset("p2", 4000)],
  ["2027-R1-EARLY", asset("2027-R1-EARLY", 4500, "pick")],
]);

describe("valueAsset", () => {
  it("values an exact slot at its tier when no source prices the slot", () => {
    const v = valueAsset({ id: "2027-1.02" }, assets, 12);
    expect(v).toMatchObject({ kind: "pick", name: "2027 Pick 1.02", value: 4500, valuedAs: "2027-R1-EARLY" });
  });

  it("marks unknown assets as no value instead of 0", () => {
    expect(valueAsset({ id: "999", name: "Deep Sleeper" }, assets, 12)).toMatchObject({ value: null, name: "Deep Sleeper" });
    expect(valueAsset({ id: "2027-R6-MID" }, assets, 12).value).toBeNull();
  });
});

describe("evaluateTrade", () => {
  it("Team A receives what Team B gives", () => {
    const t = evaluateTrade({ aGives: [{ id: "p1" }], bGives: [{ id: "p2" }, { id: "999" }], assets, teams: 12, vRef: 10000, alpha: 1 });
    expect(t.analysis.raw.A).toBe(4000);
    expect(t.analysis.raw.B).toBe(8000);
    expect(t.analysis.missing).toEqual({ A: 1, B: 0 });
  });
});
