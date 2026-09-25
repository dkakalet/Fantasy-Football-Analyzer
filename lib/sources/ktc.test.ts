import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { asCached, dpFixture, dpIdsFixture, fcFixture, FIXTURE_TIME, ktcFixture, sleeperPlayersFixture } from "../testing/fixtures";
import { buildValuation, loadSource } from "../valuation";
import { createDynastyProcessSource } from "./dynastyprocess";
import { createFantasyCalcSource } from "./fantasycalc";
import { createKtcSource, extractKtcPlayers, ktcValue, mapKtc } from "./ktc";

const ktc = createKtcSource({
  loadRaw: async () => asCached(ktcFixture()),
  loadIds: async () => asCached(dpIdsFixture()),
  loadSleeperPlayers: async () => asCached(sleeperPlayersFixture()),
});

describe("extractKtcPlayers", () => {
  it("reads the embedded ktc-players JSON", () => {
    const html = `<html><body><script type="application/json" id="ktc-players">${JSON.stringify(ktcFixture().slice(0, 3))}</script></body></html>`;
    expect(extractKtcPlayers(html).map((p) => p.playerName)).toEqual(ktcFixture().slice(0, 3).map((p) => p.playerName));
  });

  it("fails loudly when the page format changes", () => {
    expect(() => extractKtcPlayers("<html>nothing here</html>")).toThrow(/format changed/);
    expect(() => extractKtcPlayers('<script id="ktc-players">[{"x":1}]</script>')).toThrow(/unexpected/);
  });
});

describe("mapKtc", () => {
  const raw = ktcFixture();

  it("maps players via mflid crosswalk / name and every pick label", () => {
    const { values, stats } = mapKtc(raw, dpIdsFixture(), sleeperPlayersFixture(), DEFAULT_SETTINGS);
    expect(stats.picks).toBe(36);
    expect(stats.skipped["unrecognized pick label"]).toBeUndefined();
    expect(stats.matchedBy.crosswalk + stats.matchedBy.name).toBeGreaterThan(stats.players * 0.95);
    expect(values.find((v) => v.sourceName === "2029 Late 4th")?.assetId).toBe("2029-R4-LATE");
  });

  it("uses the 1QB or Superflex list, and KTC's TE-premium variants", () => {
    const allen = raw.find((p) => p.playerName === "Josh Allen")!;
    const oneQb = mapKtc([allen], dpIdsFixture(), sleeperPlayersFixture(), DEFAULT_SETTINGS).values[0];
    const sf = mapKtc([allen], dpIdsFixture(), sleeperPlayersFixture(), { ...DEFAULT_SETTINGS, numQbs: 2 }).values[0];
    expect(oneQb.rawValue).toBe(allen.oneQBValues.value);
    expect(sf.rawValue).toBe(allen.superflexValues.value);
    const set = { value: 5000, tep: { value: 5600 }, tepp: { value: 6100 } };
    expect(ktcValue(set, "none")).toBe(5000);
    expect(ktcValue(set, "te+")).toBe(5600);
    expect(ktcValue(set, "te++")).toBe(6100);
  });

  it("supports dynasty only, flagging settings off its 12-team 0.5 PPR baseline", () => {
    expect(ktc.supports(DEFAULT_SETTINGS)).toEqual({ supported: true, approximated: [] });
    expect(ktc.supports({ ...DEFAULT_SETTINGS, ppr: 1, numTeams: 10 }).approximated).toEqual(["ppr", "teams"]);
    expect(ktc.supports({ ...DEFAULT_SETTINGS, format: "redraft" }).supported).toBe(false);
  });
});

describe("valuation with three sources", () => {
  it("normalizes KTC to the FantasyCalc scale and takes the median of three", async () => {
    const fc = createFantasyCalcSource(async () => asCached(fcFixture()));
    const dp = createDynastyProcessSource({
      loadRaw: async () => asCached(dpFixture()),
      loadIds: async () => asCached(dpIdsFixture()),
      loadSleeperPlayers: async () => asCached(sleeperPlayersFixture()),
    });
    const results = await Promise.all([fc, dp, ktc].map((a) => loadSource(a, DEFAULT_SETTINGS)));
    const v = buildValuation({ settings: DEFAULT_SETTINGS, results, sleeperPlayers: sleeperPlayersFixture(), now: new Date(FIXTURE_TIME) });
    const ktcMeta = v.sources.find((s) => s.id === "ktc")!;
    expect(ktcMeta).toMatchObject({ status: "ok", factorPlayers: 150 });
    const three = v.assets.find((a) => a.kind === "player" && a.sources.length === 3)!;
    const normalized = three.sources.map((s) => s.normalized).sort((a, b) => a - b);
    expect(three.value).toBe(normalized[1]);
    // 2028 picks: KTC has tiers, FantasyCalc and DynastyProcess only round-level values.
    const vias = v.assets.find((a) => a.id === "2028-R1-EARLY")!.sources.map((s) => `${s.source}:${s.via}`);
    expect(vias).toEqual(["fantasycalc:round", "dynastyprocess:round", "ktc:exact"]);
  });

  it("a KTC failure leaves the other sources working", async () => {
    const broken = createKtcSource({
      loadRaw: async () => {
        throw new Error("KTC page format changed: ktc-players data not found");
      },
      loadIds: async () => asCached(dpIdsFixture()),
      loadSleeperPlayers: async () => asCached(sleeperPlayersFixture()),
    });
    const fc = createFantasyCalcSource(async () => asCached(fcFixture()));
    const results = await Promise.all([fc, broken].map((a) => loadSource(a, DEFAULT_SETTINGS)));
    const v = buildValuation({ settings: DEFAULT_SETTINGS, results, sleeperPlayers: sleeperPlayersFixture(), now: new Date(FIXTURE_TIME) });
    expect(v.sources.find((s) => s.id === "ktc")).toMatchObject({ status: "error" });
    expect(v.assets.length).toBeGreaterThan(300);
  });
});
