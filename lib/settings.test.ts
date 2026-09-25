import { describe, expect, it } from "vitest";
import { ALLOWED_PPR, ALLOWED_TEAMS, closest, DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("closest", () => {
  it("snaps to the nearest allowed value, ties going up", () => {
    expect(closest(16, ALLOWED_TEAMS)).toBe(14);
    expect(closest(6, ALLOWED_TEAMS)).toBe(8);
    expect(closest(11, ALLOWED_TEAMS)).toBe(12);
    expect(closest(0.25, ALLOWED_PPR)).toBe(0.5);
    expect(closest(0.75, ALLOWED_PPR)).toBe(1);
  });
});

describe("parseSettings", () => {
  it("defaults to Dynasty, 1QB, 0.5 PPR, 12 teams, no TE premium", () => {
    expect(parseSettings(new URLSearchParams())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ format: "dynasty", numQbs: 1, ppr: 0.5, numTeams: 12, tep: "none" });
  });

  it("reads and validates query params", () => {
    expect(parseSettings(new URLSearchParams("format=redraft&qb=2&ppr=1&teams=10&tep=te%2B"))).toEqual({
      format: "redraft",
      numQbs: 2,
      ppr: 1,
      numTeams: 10,
      tep: "te+",
    });
    expect(parseSettings(new URLSearchParams("format=x&qb=3&ppr=abc&teams=16&tep=bad"))).toEqual({
      ...DEFAULT_SETTINGS,
      numTeams: 14,
    });
  });
});
