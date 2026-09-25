import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { num, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas in fields, and CRLF", () => {
    const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n1,\n');
    expect(rows).toEqual([
      { a: "x, y", b: 'say "hi"' },
      { a: "1", b: "" },
    ]);
  });

  it("parses the DynastyProcess players fixture", () => {
    const text = readFileSync(path.join(__dirname, "../fixtures/dynastyprocess/values-players.csv"), "utf8");
    const rows = parseCsv(text);
    expect(rows.length).toBeGreaterThan(300);
    expect(Object.keys(rows[0])).toEqual(
      expect.arrayContaining(["player", "pos", "value_1qb", "value_2qb", "fp_id"]),
    );
    expect(rows.find((r) => r.player.includes("'"))).toBeDefined(); // e.g. Ja'Marr Chase
  });
});

describe("num", () => {
  it("treats NA and blanks as null", () => {
    expect(num("NA")).toBeNull();
    expect(num("")).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num("26.6")).toBe(26.6);
  });
});
