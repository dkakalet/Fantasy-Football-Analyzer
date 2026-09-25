import { describe, expect, it } from "vitest";
import { normalizeName } from "./names";

describe("normalizeName", () => {
  it.each([
    ["Ja'Marr Chase", "jamarr chase"],
    ["Marvin Harrison Jr.", "marvin harrison"],
    ["Amon-Ra St. Brown", "amon ra st brown"],
    ["Kenneth Walker III", "kenneth walker"],
    ["D.J. Moore", "dj moore"],
    ["José Núñez", "jose nunez"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});
