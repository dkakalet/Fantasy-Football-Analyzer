import { describe, expect, it } from "vitest";
import { jsonFixture } from "../testing/fixtures";
import type { SleeperDraft, SleeperLeague, SleeperLeagueUser, SleeperRoster, SleeperTradedPick } from "./client";
import { buildTeams, isSuperflex, mapLeagueSettings, tepFromBonus, type MappedLeague } from "./league";
import { buildPickInventory, firstOpenSeason } from "./picks";

const league = jsonFixture<SleeperLeague>("sleeper/league.json");
const rosters = jsonFixture<SleeperRoster[]>("sleeper/rosters.json");
const users = jsonFixture<SleeperLeagueUser[]>("sleeper/users.json");
const traded = jsonFixture<SleeperTradedPick[]>("sleeper/traded_picks.json");
const drafts = jsonFixture<SleeperDraft[]>("sleeper/drafts.json");
const byType = jsonFixture<SleeperLeague[]>("sleeper/leagues-by-type.json");

describe("mapLeagueSettings", () => {
  it("maps the sample dynasty superflex league", () => {
    const m = mapLeagueSettings(league);
    expect(m.settings).toEqual({ format: "dynasty", numQbs: 2, ppr: 1, numTeams: 12, tep: "te+" });
    expect(m.source).toMatchObject({ type: 2, superflex: true, rec: 1, bonusRecTe: 0.5, totalRosters: 12, draftRounds: 3 });
  });

  it("maps every observed league type", () => {
    const formats: Record<number, MappedLeague> = Object.fromEntries(byType.map((l) => [l.settings.type, mapLeagueSettings(l)]));
    expect(formats[0].settings.format).toBe("redraft");
    expect(formats[1].settings.format).toBe("redraft");
    expect(formats[1].notes[0]).toContain("keeper");
    expect(formats[2].settings.format).toBe("dynasty");
    expect(formats[3].settings.format).toBe("redraft");
    // 16-team league snaps to FantasyCalc's closest supported size.
    expect(formats[3].settings.numTeams).toBe(14);
    expect(formats[3].notes.some((n) => n.includes("16 teams → using 14"))).toBe(true);
  });

  it("maps TE bonus to FantasyCalc's tep", () => {
    expect(tepFromBonus(undefined)).toBe("none");
    expect(tepFromBonus(0)).toBe("none");
    expect(tepFromBonus(0.25)).toBe("te+");
    expect(tepFromBonus(0.5)).toBe("te+");
    expect(tepFromBonus(0.75)).toBe("te++");
    expect(tepFromBonus(1)).toBe("te++");
  });

  it("detects superflex from SUPER_FLEX or two QB slots", () => {
    expect(isSuperflex(["QB", "RB", "SUPER_FLEX"])).toBe(true);
    expect(isSuperflex(["QB", "QB", "RB"])).toBe(true);
    expect(isSuperflex(["QB", "RB", "FLEX"])).toBe(false);
  });

  it("snaps fractional PPR and notes it", () => {
    const m = mapLeagueSettings({ ...league, scoring_settings: { rec: 0.25 } as SleeperLeague["scoring_settings"] });
    expect(m.settings.ppr).toBe(0.5);
    expect(m.notes.some((n) => n.includes("0.25"))).toBe(true);
  });
});

describe("buildTeams", () => {
  it("names teams from team_name, then display name, then roster id", () => {
    const teams = buildTeams(rosters, users);
    expect(teams).toHaveLength(12);
    expect(teams[0].rosterId).toBe(1);
    expect(teams.every((t) => t.name.startsWith("Team "))).toBe(true);
    expect(teams[0].players.length).toBeGreaterThan(20); // includes taxi + reserve
    expect(buildTeams([{ roster_id: 7, owner_id: null, players: [] }], [])[0].name).toBe("Team 7");
  });
});

describe("buildPickInventory", () => {
  const inv = buildPickInventory({ league, rosterIds: rosters.map((r) => r.roster_id), tradedPicks: traded, drafts });

  it("starts after the completed 2026 draft and covers three seasons", () => {
    expect(firstOpenSeason(league, drafts)).toBe(2027);
    expect(inv.seasons).toEqual([2027, 2028, 2029]);
    expect(inv.rounds).toBe(3);
    expect(inv.picks).toHaveLength(12 * 3 * 3);
  });

  it("applies traded picks and ignores used 2026 ones", () => {
    const owned = (rosterId: number) => inv.picks.filter((p) => p.ownerRosterId === rosterId);
    // Roster 1 received 2027 1sts from rosters 3 and 6.
    expect(owned(1).filter((p) => p.season === 2027 && p.round === 1).map((p) => p.originalRosterId)).toEqual([1, 3, 6]);
    // Roster 2 traded its 2027 2nd and 2028 1st + 2nd to roster 6.
    expect(owned(2)).toHaveLength(9 - 3);
    expect(owned(6).filter((p) => p.originalRosterId === 2).map((p) => p.id)).toEqual(["2027-2-2", "2028-1-2", "2028-2-2"]);
    expect(inv.picks.some((p) => p.season === 2026)).toBe(false);
  });

  it("uses MID tier keys when the draft order isn't set", () => {
    expect(inv.picks[0]).toMatchObject({ key: "2027-R1-MID", slot: null });
  });

  it("uses the exact slot once the draft order is set", () => {
    const withOrder: SleeperDraft[] = [
      ...drafts,
      { draft_id: "x", season: "2027", status: "pre_draft", type: "linear", settings: {}, slot_to_roster_id: { "1": 5, "2": 1 } },
    ];
    const p = buildPickInventory({ league, rosterIds: [1, 5], tradedPicks: [], drafts: withOrder }).picks;
    expect(p.find((x) => x.id === "2027-1-1")).toMatchObject({ key: "2027-1.02", slot: 2 });
    expect(p.find((x) => x.id === "2027-2-5")).toMatchObject({ key: "2027-2.01", slot: 1 });
    expect(p.find((x) => x.id === "2028-1-1")!.key).toBe("2028-R1-MID");
  });

  it("includes the current season while its draft hasn't happened", () => {
    const pre = buildPickInventory({ league, rosterIds: [1], tradedPicks: [], drafts: [{ ...drafts[0], status: "pre_draft" }] });
    expect(pre.seasons).toEqual([2026, 2027, 2028]);
  });
});
