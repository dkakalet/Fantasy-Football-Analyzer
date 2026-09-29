import { describe, expect, it } from "vitest";
import { parsePickKey } from "../picks";
import { DEFAULT_SETTINGS } from "../settings";
import {
  asCached,
  ddFixture,
  dpFixture,
  dpIdsFixture,
  fcFixture,
  FIXTURE_TIME,
  raFixture,
  sleeperPlayersFixture,
} from "../testing/fixtures";
import type { LeagueSettings } from "../types";
import { buildValuation, loadSource } from "../valuation";
import { createDynastyDealerSource, dynastyDealerUrl, mapDynastyDealer, parseDynastyDealerPick } from "./dynastydealer";
import { createDynastyProcessSource } from "./dynastyprocess";
import { createFantasyCalcSource } from "./fantasycalc";
import { createRosterAuditSource, mapRosterAudit, rosterAuditPickKey } from "./rosteraudit";

const dd = createDynastyDealerSource(async (s) =>
  asCached(ddFixture(s.format === "dynasty" ? "dynasty" : s.numQbs === 2 ? "redraft-ppr-sf" : "redraft-half")),
);
const ra = createRosterAuditSource(async () => asCached(raFixture()));

describe("Dynasty Dealer", () => {
  it("builds dynasty and redraft URLs", () => {
    expect(dynastyDealerUrl(DEFAULT_SETTINGS)).toBe("https://www.dynastydealer.com/api/player-values?perSlot=true");
    expect(dynastyDealerUrl({ ...DEFAULT_SETTINGS, format: "redraft" })).toBe(
      "https://www.dynastydealer.com/api/player-values?format=redraft&scoring=half",
    );
    expect(dynastyDealerUrl({ ...DEFAULT_SETTINGS, format: "redraft", ppr: 1, numQbs: 2 })).toContain("scoring=ppr&sf=true");
    expect(dynastyDealerUrl({ ...DEFAULT_SETTINGS, format: "redraft", ppr: 0 })).toContain("scoring=std");
  });

  it("parses tier and exact-slot pick IDs", () => {
    expect(parseDynastyDealerPick("pick_2027_1_early")).toBe("2027-R1-EARLY");
    expect(parseDynastyDealerPick("pick_2027_2_slot_07")).toBe("2027-2.07");
    expect(parseDynastyDealerPick("4984")).toBeNull();
  });

  it("maps the dynasty fixture: Sleeper IDs, 36 tier picks and 48 exact slots", () => {
    const { values, stats } = mapDynastyDealer(ddFixture("dynasty"));
    expect(stats.skipped).toEqual({});
    const picks = values.filter((v) => v.kind === "pick").map((v) => parsePickKey(v.assetId)!);
    expect(picks.filter((p) => p.tier)).toHaveLength(36);
    expect(picks.filter((p) => p.slot !== null)).toHaveLength(48);
    expect(values.filter((v) => v.kind === "player").every((v) => /^\d+$/.test(v.assetId))).toBe(true);
  });

  it("flags its blended dynasty market; redraft honours scoring and superflex", () => {
    expect(dd.supports(DEFAULT_SETTINGS)).toEqual({ supported: true, approximated: ["qb", "ppr", "teams"] });
    expect(dd.supports({ ...DEFAULT_SETTINGS, format: "redraft", tep: "te+" })).toEqual({ supported: true, approximated: ["teams", "tep"] });
  });
});

describe("RosterAudit", () => {
  it("uses the market value for the QB format and skips zero values", () => {
    const raw = raFixture();
    const allen = raw.players.find((p) => p.name === "Josh Allen")!;
    const oneQb = mapRosterAudit(raw, 1).values.find((v) => v.assetId === allen.sleeper_id)!;
    const sf = mapRosterAudit(raw, 2).values.find((v) => v.assetId === allen.sleeper_id)!;
    expect(oneQb.rawValue).toBe(Number(allen.val_1qb_market));
    expect(sf.rawValue).toBe(Number(allen.val_sf_market));
    const players = raw.players.filter((p) => p.position !== "PICK");
    const zeros = players.filter((p) => !(Number(p.val_1qb_market) > 0)).length;
    const { stats } = mapRosterAudit(raw, 1);
    expect(stats.players).toBe(players.length - zeros); // pick rows and zero values aren't player records
    expect(stats.skipped).toEqual(zeros ? { "zero or missing value": zeros } : {});
  });

  it("maps picks: three seasons, rounds 1-5, early/mid/late", () => {
    const { values, stats } = mapRosterAudit(raFixture(), 1);
    expect(stats.picks).toBe(45);
    expect(new Set(values.filter((v) => v.kind === "pick").map((v) => parsePickKey(v.assetId)!.season))).toEqual(new Set([2027, 2028, 2029]));
    expect(rosterAuditPickKey({ pick_season: 2027, pick_round: 1, pick_slot: "early" })).toBe("2027-R1-EARLY");
    expect(rosterAuditPickKey({ pick_season: 2027, pick_round: 1, pick_slot: 4 })).toBe("2027-1.04");
  });

  it("is dynasty only", () => {
    expect(ra.supports({ ...DEFAULT_SETTINGS, format: "redraft" }).supported).toBe(false);
    expect(ra.supports(DEFAULT_SETTINGS)).toEqual({ supported: true, approximated: ["ppr", "teams"] });
  });
});

describe("valuation with the four default sources", () => {
  const fc = createFantasyCalcSource(async (s) => asCached(fcFixture(s.format === "redraft" ? "redraft-1qb-12-ppr0.5" : "dynasty-1qb-12-ppr0.5")));
  const dp = createDynastyProcessSource({
    loadRaw: async () => asCached(dpFixture()),
    loadIds: async () => asCached(dpIdsFixture()),
    loadSleeperPlayers: async () => asCached(sleeperPlayersFixture()),
  });
  const build = async (settings: LeagueSettings) =>
    buildValuation({
      settings,
      results: await Promise.all([fc, dp, dd, ra].map((a) => loadSource(a, settings))),
      sleeperPlayers: sleeperPlayersFixture(),
      now: new Date(FIXTURE_TIME),
    });

  it("normalizes every source to FantasyCalc and takes the median of four", async () => {
    const v = await build(DEFAULT_SETTINGS);
    expect(v.sources.map((s) => [s.id, s.status])).toEqual([
      ["fantasycalc", "ok"],
      ["dynastyprocess", "ok"],
      ["dynastydealer", "ok"],
      ["rosteraudit", "ok"],
    ]);
    for (const s of v.sources.slice(1)) expect(s.factorPlayers).toBe(150);
    const four = v.assets.find((a) => a.kind === "player" && a.sources.length === 4)!;
    const n = four.sources.map((s) => s.normalized).sort((a, b) => a - b);
    expect(four.value).toBeCloseTo((n[1] + n[2]) / 2);
  });

  it("prices exact 2027 slots where Dynasty Dealer has them", async () => {
    const v = await build(DEFAULT_SETTINGS);
    const slot = v.assets.find((a) => a.id === "2027-1.03")!;
    expect(slot.sources.find((s) => s.source === "dynastydealer")?.via).toBe("exact");
    expect(slot.sources.find((s) => s.source === "fantasycalc")?.via).toBe("tier");
  });

  it("redraft now has two sources: FantasyCalc and Dynasty Dealer", async () => {
    const v = await build({ ...DEFAULT_SETTINGS, format: "redraft" });
    expect(v.sources.filter((s) => s.status === "ok").map((s) => s.id)).toEqual(["fantasycalc", "dynastydealer"]);
    expect(v.assets.some((a) => a.sources.length === 2)).toBe(true);
  });
});
