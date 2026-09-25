import { describe, expect, it } from "vitest";
import { computeScaleFactor } from "./normalize";
import { DEFAULT_SETTINGS } from "./settings";
import { createDynastyProcessSource, mapDynastyProcess } from "./sources/dynastyprocess";
import { createFantasyCalcSource, mapFantasyCalc } from "./sources/fantasycalc";
import { asCached, dpFixture, dpIdsFixture, fcFixture, FIXTURE_TIME, sleeperPlayersFixture } from "./testing/fixtures";
import type { LeagueSettings } from "./types";
import { buildValuation, loadSource, type SourceResult } from "./valuation";

const fc = createFantasyCalcSource(async (s) => asCached(fcFixture(s.format === "redraft" ? "redraft-1qb-12-ppr0.5" : "dynasty-1qb-12-ppr0.5")));
const dp = createDynastyProcessSource({
  loadRaw: async () => asCached(dpFixture()),
  loadIds: async () => asCached(dpIdsFixture()),
  loadSleeperPlayers: async () => asCached(sleeperPlayersFixture()),
});
const now = new Date(FIXTURE_TIME);

async function build(settings: LeagueSettings = DEFAULT_SETTINGS, results?: SourceResult[]) {
  return buildValuation({
    settings,
    results: results ?? (await Promise.all([fc, dp].map((a) => loadSource(a, settings)))),
    sleeperPlayers: sleeperPlayersFixture(),
    now,
  });
}

describe("adapters on fixtures", () => {
  it("FantasyCalc: every player joins on sleeperId, every pick maps to a key", () => {
    const { values, stats } = mapFantasyCalc(fcFixture());
    expect(stats).toMatchObject({ players: 395, picks: 24, skipped: {} });
    expect(values.find((v) => v.sourceName === "2027 1st (Mid)")?.assetId).toBe("2027-R1-MID");
  });

  it("DynastyProcess: fp_id crosswalk first, name fallback second, 1QB vs 2QB column", () => {
    const raw = dpFixture();
    const oneQb = mapDynastyProcess(raw, dpIdsFixture(), sleeperPlayersFixture(), 1);
    expect(oneQb.stats.matchedBy.crosswalk).toBe(344);
    expect(oneQb.stats.picks).toBe(85);
    const chase = oneQb.values.find((v) => v.sourceName === "Ja'Marr Chase")!;
    expect(chase.rawValue).toBe(10208);
    const sf = mapDynastyProcess(raw, dpIdsFixture(), sleeperPlayersFixture(), 2);
    expect(sf.values.find((v) => v.assetId === chase.assetId)!.rawValue).toBe(9270);

    // With no crosswalk at all, the name fallback still finds players in the Sleeper DB.
    const byName = mapDynastyProcess(raw, [], sleeperPlayersFixture(), 1);
    expect(byName.stats.matchedBy.name).toBeGreaterThan(300);
    expect(byName.values.find((v) => v.sourceName === "Ja'Marr Chase")!.assetId).toBe(chase.assetId);
  });

  it("DynastyProcess supports dynasty only and flags its fixed baseline", () => {
    expect(dp.supports({ ...DEFAULT_SETTINGS, format: "redraft" }).supported).toBe(false);
    expect(dp.supports(DEFAULT_SETTINGS)).toEqual({ supported: true, approximated: ["ppr", "teams"] });
    expect(dp.supports({ ...DEFAULT_SETTINGS, tep: "te+" }).approximated).toContain("tep");
  });
});

describe("buildValuation", () => {
  it("uses FantasyCalc as the reference and scales DynastyProcess by the documented factor", async () => {
    const v = await build();
    expect(v.reference).toBe("fantasycalc");
    const [fcMeta, dpMeta] = v.sources;
    expect(fcMeta).toMatchObject({ id: "fantasycalc", isReference: true, factor: 1, status: "ok" });
    expect(dpMeta).toMatchObject({ id: "dynastyprocess", status: "ok", factorPlayers: 150 });

    // Recompute the factor independently from the adapter output.
    const fcPlayers = new Map(mapFantasyCalc(fcFixture()).values.filter((x) => x.kind === "player").map((x) => [x.assetId, x.rawValue]));
    const dpPlayers = new Map(
      mapDynastyProcess(dpFixture(), dpIdsFixture(), sleeperPlayersFixture(), 1).values.filter((x) => x.kind === "player").map((x) => [x.assetId, x.rawValue]),
    );
    expect(dpMeta.factor).toBeCloseTo(computeScaleFactor(fcPlayers, dpPlayers, 150).factor!);

    // Every normalized value is raw × factor.
    const asset = v.assets.find((a) => a.name === "Ja'Marr Chase")!;
    const dpVal = asset.sources.find((s) => s.source === "dynastyprocess")!;
    expect(dpVal.normalized).toBeCloseTo(dpVal.raw * dpMeta.factor!);
    expect(asset.value).toBeCloseTo((asset.sources[0].normalized + asset.sources[1].normalized) / 2);
  });

  it("V_ref is the top consensus asset and assets are sorted by value", async () => {
    const v = await build();
    expect(v.vRef).toBe(v.assets[0].value);
    expect(v.vRefAsset).toBe(v.assets[0].id);
    for (let i = 1; i < v.assets.length; i++) expect(v.assets[i - 1].value!).toBeGreaterThanOrEqual(v.assets[i].value!);
  });

  it("reports match rates against the Sleeper DB", async () => {
    const v = await build();
    expect(v.sources[0].matchRate).toBe(1);
    expect(v.sources[1].matchRate).toBeGreaterThan(0.99);
  });

  it("picks: live seasons from the reference, stale past-season rows ignored", async () => {
    const v = await build();
    expect(v.pickSeasons).toEqual([2027, 2028, 2029]);
    expect(v.pickRounds).toBe(5);
    expect(v.sources[1].pastSeasonPicks).toBe(60); // DynastyProcess "2026 Pick 1.01".."5.12"
    expect(v.assets.some((a) => a.id.startsWith("2026"))).toBe(false);

    const early = v.assets.find((a) => a.id === "2027-R1-EARLY")!;
    expect(early.sources.map((s) => [s.source, s.via])).toEqual([
      ["fantasycalc", "exact"],
      ["dynastyprocess", "exact"],
    ]);
    // 2028 has round-level values only, in both sources.
    const later = v.assets.find((a) => a.id === "2028-R1-LATE")!;
    expect(later.sources.every((s) => s.via === "round" && s.flags.some((f) => f.startsWith("round-level")))).toBe(true);
    // Round 5 exists only in DynastyProcess: single source.
    expect(v.assets.find((a) => a.id === "2027-R5-MID")!.singleSource).toBe(true);
    // 2029 DynastyProcess has no picks; FantasyCalc's round 1 only.
    expect(v.assets.find((a) => a.id === "2029-R1-MID")!.singleSource).toBe(true);
    expect(v.assets.find((a) => a.id === "2029-R5-MID")).toBeUndefined(); // no value anywhere
  });

  it("redraft: DynastyProcess is unsupported and FantasyCalc has no picks", async () => {
    const v = await build({ ...DEFAULT_SETTINGS, format: "redraft" });
    expect(v.sources[1].status).toBe("unsupported");
    expect(v.assets.every((a) => a.kind === "player" && a.singleSource)).toBe(true);
    expect(v.pickSeasons).toEqual([]);
  });

  it("a failing source is reported and the rest still work", async () => {
    const v = await build(DEFAULT_SETTINGS, [await loadSource(fc, DEFAULT_SETTINGS), { adapter: dp, error: "HTTP 503" }]);
    expect(v.sources[1]).toMatchObject({ status: "error", error: "HTTP 503" });
    expect(v.warnings.join(" ")).toContain("DynastyProcess failed");
    expect(v.assets.filter((a) => a.kind === "player").every((a) => a.singleSource)).toBe(true);
  });

  it("falls back to the next source as reference when FantasyCalc is down", async () => {
    const v = await build(DEFAULT_SETTINGS, [{ adapter: fc, error: "timeout" }, await loadSource(dp, DEFAULT_SETTINGS)]);
    expect(v.reference).toBe("dynastyprocess");
    expect(v.sources[1].factor).toBe(1);
    expect(v.warnings[0]).toContain("DynastyProcess scale");
  });
});
