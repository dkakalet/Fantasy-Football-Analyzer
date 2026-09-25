import { describe, expect, it } from "vitest";
import {
  parseDynastyProcessPick,
  parseFantasyCalcPick,
  parsePickKey,
  pickLabel,
  resolvePick,
  roundKey,
  slotKey,
  slotToTier,
  tierKey,
} from "./picks";
import { dpFixture, fcFixture } from "./testing/fixtures";

describe("pick keys", () => {
  it("formats and parses canonical keys", () => {
    expect(tierKey(2027, 1, "MID")).toBe("2027-R1-MID");
    expect(slotKey(2027, 1, 4)).toBe("2027-1.04");
    expect(roundKey(2028, 2)).toBe("2028-R2");
    expect(parsePickKey("2027-R1-EARLY")).toEqual({ season: 2027, round: 1, tier: "EARLY", slot: null });
    expect(parsePickKey("2027-2.11")).toEqual({ season: 2027, round: 2, tier: null, slot: 11 });
    expect(parsePickKey("2028-R3")).toEqual({ season: 2028, round: 3, tier: null, slot: null });
    expect(parsePickKey("9221")).toBeNull();
  });

  it("labels", () => {
    expect(pickLabel("2027-R1-EARLY")).toBe("2027 1st (Early)");
    expect(pickLabel("2027-3.07")).toBe("2027 Pick 3.07");
    expect(pickLabel("2028-R2")).toBe("2028 2nd");
  });
});

describe("slotToTier (scaled to team count)", () => {
  const tiers = (teams: number) => Array.from({ length: teams }, (_, i) => slotToTier(i + 1, teams)[0]).join("");
  it.each([
    [8, "EEEMMLLL"],
    [10, "EEEMMMMLLL"],
    [12, "EEEEMMMMLLLL"],
    [14, "EEEEEMMMMLLLLL"],
  ])("%i teams", (teams, expected) => {
    expect(tiers(teams)).toBe(expected);
  });
});

describe("source pick labels (from fixtures)", () => {
  it("parses every FantasyCalc pick name", () => {
    const names = fcFixture().filter((r) => r.player.position === "PICK").map((r) => r.player.name);
    expect(names.length).toBe(24);
    for (const n of names) expect(parseFantasyCalcPick(n), n).not.toBeNull();
    expect(parseFantasyCalcPick("2027 1st (Early)")).toBe("2027-R1-EARLY");
    expect(parseFantasyCalcPick("2029 4th")).toBe("2029-R4");
  });

  it("parses every DynastyProcess pick label", () => {
    const labels = dpFixture().picks.map((r) => r.player);
    expect(labels.length).toBe(85);
    for (const l of labels) expect(parseDynastyProcessPick(l), l).not.toBeNull();
    expect(parseDynastyProcessPick("2026 Pick 1.01")).toBe("2026-1.01");
    expect(parseDynastyProcessPick("2027 Late 2nd")).toBe("2027-R2-LATE");
    expect(parseDynastyProcessPick("2028 5th")).toBe("2028-R5");
  });
});

describe("resolvePick", () => {
  const values = new Map<string, number>([
    ["2027-R1-EARLY", 4600],
    ["2027-R1", 2800],
    ["2028-R1", 2100],
  ]);
  const lookup = (k: string) => values.get(k);

  it("prefers the exact key", () => {
    expect(resolvePick(lookup, "2027-R1-EARLY", 12)).toEqual({ value: 4600, key: "2027-R1-EARLY", via: "exact" });
  });
  it("maps an exact slot to its tier", () => {
    expect(resolvePick(lookup, "2027-1.03", 12)).toEqual({ value: 4600, key: "2027-R1-EARLY", via: "tier" });
  });
  it("falls back to a round-level value", () => {
    expect(resolvePick(lookup, "2027-1.07", 12)).toEqual({ value: 2800, key: "2027-R1", via: "round" });
    expect(resolvePick(lookup, "2028-R1-LATE", 12)).toEqual({ value: 2100, key: "2028-R1", via: "round" });
  });
  it("returns null when the source has nothing for that round", () => {
    expect(resolvePick(lookup, "2027-R5-MID", 12)).toBeNull();
  });
});
