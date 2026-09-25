import { describe, expect, it } from "vitest";
import { parsePickInput } from "./picks";
import { searchPlayers } from "./search";

const players = [
  { id: "1", name: "Ja'Marr Chase", pos: "WR", team: "CIN", value: 10000 },
  { id: "2", name: "Chase Brown", pos: "RB", team: "CIN", value: 5000 },
  { id: "3", name: "Amon-Ra St. Brown", pos: "WR", team: "DET", value: 9000 },
  { id: "4", name: "Chase Claypool", pos: "WR", team: null, value: null },
];

describe("searchPlayers", () => {
  it("matches name words, position and team", () => {
    expect(searchPlayers("chase", players).map((p) => p.id)).toEqual(["2", "4", "1"]);
    expect(searchPlayers("wr det", players).map((p) => p.id)).toEqual(["3"]);
    expect(searchPlayers("cin", players).map((p) => p.id)).toEqual(["1", "2"]);
    expect(searchPlayers("ja'marr chase", players)[0].id).toBe("1");
    expect(searchPlayers("", players)).toEqual([]);
  });
});

describe("parsePickInput", () => {
  it.each([
    ["2027-R1-EARLY", "2027-R1-EARLY"],
    ["2027-r2-late", "2027-R2-LATE"],
    ["2027 1st", "2027-R1-MID"],
    ["2027 Early 1st", "2027-R1-EARLY"],
    ["2027 1st (Late)", "2027-R1-LATE"],
    ["2027 Pick 1.04", "2027-1.04"],
    ["2027-1.04", "2027-1.04"],
    ["Bijan Robinson", null],
  ])("%s -> %s", (input, expected) => {
    expect(parsePickInput(input)).toBe(expected);
  });
});
