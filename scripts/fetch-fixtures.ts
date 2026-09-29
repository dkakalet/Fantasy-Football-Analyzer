// Fetch every data source live, trim the responses, and write them to fixtures/.
// Also writes fixtures/probes.json: a summary of what each live call returned.
//
//   npm run fixtures                       # every default source + Sleeper
//   npm run fixtures -- --user <sleeper username> --league <league_id>
//   npm run fixtures -- --only dynastydealer,rosteraudit   # just those sections
//   npm run fixtures -- --only ktc         # KeepTradeCut (opt-in: check KTC's terms first)
//
// Sleeper fixtures are anonymized (display names / team names / league names
// replaced) so third-party usernames aren't committed.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "../lib/csv";
import { fetchJson, fetchText, HttpError } from "../lib/http";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { dynastyDealerUrl, type DdEntry } from "../lib/sources/dynastydealer";
import { DP_FILES, DP_ID_COLUMNS } from "../lib/sources/dynastyprocess";
import { fantasyCalcUrl, type FcRecord } from "../lib/sources/fantasycalc";
import { extractKtcPlayers, KTC_URL, type KtcPlayer } from "../lib/sources/ktc";
import { RA_BASE, type RaPick, type RaPlayer } from "../lib/sources/rosteraudit";
import {
  sleeperUrls,
  type SleeperDraft,
  type SleeperLeague,
  type SleeperLeagueUser,
  type SleeperRoster,
  type SleeperState,
  type SleeperTradedPick,
  type SleeperUser,
} from "../lib/sleeper/client";
import { trimPlayers, type SleeperRawPlayer } from "../lib/sleeper/players";
import type { LeagueSettings } from "../lib/types";

const ROOT = path.join(__dirname, "..", "fixtures");
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
// Public account with many dynasty leagues; any Sleeper username works.
const SLEEPER_USER = arg("user", "keeptradecut");
const SLEEPER_LEAGUE = arg("league", "1357193858412220416");
const ONLY = new Set(arg("only", "").split(",").filter(Boolean));

const probes: Record<string, unknown> = { fetchedAt: new Date().toISOString() };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function save(rel: string, data: unknown) {
  const file = path.join(ROOT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof data === "string" ? data : JSON.stringify(data, null, 1) + "\n");
  console.log(`  wrote fixtures/${rel}`);
}

function toCsv(rows: Record<string, string>[], columns: readonly string[]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c] ?? "")).join(","))].join("\n") + "\n";
}

// ---------------------------------------------------------------- FantasyCalc

const trimFc = (r: FcRecord): FcRecord => ({
  player: {
    id: r.player.id,
    name: r.player.name,
    sleeperId: r.player.sleeperId ?? null,
    mflId: r.player.mflId ?? null,
    position: r.player.position,
    maybeTeam: r.player.maybeTeam ?? null,
  },
  value: r.value,
  overallRank: r.overallRank,
  positionRank: r.positionRank,
  redraftValue: r.redraftValue,
});

function summarizeFc(d: FcRecord[]) {
  const picks = d.filter((r) => r.player.position === "PICK");
  const te = d.find((r) => r.player.position === "TE");
  return {
    records: d.length,
    players: d.length - picks.length,
    picks: picks.length,
    missingSleeperId: d.filter((r) => r.player.position !== "PICK" && !r.player.sleeperId).length,
    top: d[0] && { name: d[0].player.name, value: d[0].value },
    topTE: te && { name: te.player.name, value: te.value },
    pickNames: picks.map((p) => `${p.player.name} [${p.player.sleeperId}] = ${p.value}`),
  };
}

async function fantasyCalc(): Promise<FcRecord[]> {
  console.log("FantasyCalc");
  const variants: [string, LeagueSettings, "full" | "trim"][] = [
    ["dynasty-1qb-12-ppr0.5", DEFAULT_SETTINGS, "full"],
    ["dynasty-2qb-12-ppr0.5", { ...DEFAULT_SETTINGS, numQbs: 2 }, "trim"],
    ["redraft-1qb-12-ppr0.5", { ...DEFAULT_SETTINGS, format: "redraft" }, "trim"],
    ["dynasty-1qb-12-ppr0.5-te+", { ...DEFAULT_SETTINGS, tep: "te+" }, "trim"],
    ["dynasty-1qb-12-ppr0.5-te++", { ...DEFAULT_SETTINGS, tep: "te++" }, "trim"],
    ["dynasty-1qb-14-ppr0", { ...DEFAULT_SETTINGS, numTeams: 14, ppr: 0 }, "trim"],
    ["dynasty-1qb-8-ppr1", { ...DEFAULT_SETTINGS, numTeams: 8, ppr: 1 }, "trim"],
  ];
  const out: Record<string, unknown> = {};
  let reference: FcRecord[] = [];
  for (const [name, settings, mode] of variants) {
    const url = fantasyCalcUrl(settings);
    try {
      const data = await fetchJson<FcRecord[]>(url);
      out[name] = { url, ...summarizeFc(data) };
      if (mode === "full") reference = data;
      // Trimmed variants keep the top 60 overall, the top 10 TEs, and every pick.
      let tes = 0;
      const kept = mode === "full"
        ? data
        : data.filter((r) =>
            r.overallRank <= 60 || r.player.position === "PICK" || (r.player.position === "TE" && ++tes <= 10));
      await save(`fantasycalc/values-${name}.json`, kept.map(trimFc));
    } catch (e) {
      out[name] = { url, error: String(e) };
    }
    await sleep(500);
  }
  // Undocumented team count: see how the API responds (not saved as a fixture).
  const odd = fantasyCalcUrl({ ...DEFAULT_SETTINGS, numTeams: 16 as LeagueSettings["numTeams"] });
  try {
    out["probe-numTeams-16"] = { url: odd, ...summarizeFc(await fetchJson<FcRecord[]>(odd)) };
  } catch (e) {
    out["probe-numTeams-16"] = { url: odd, error: e instanceof HttpError ? e.status : String(e) };
  }
  probes.fantasycalc = out;
  return reference;
}

// -------------------------------------------------------------- DynastyProcess

async function dynastyProcess(): Promise<Set<string>> {
  console.log("DynastyProcess");
  const [playersCsv, valuesCsv, picksCsv, idsCsv] = await Promise.all([
    fetchText(DP_FILES.players),
    fetchText(DP_FILES.values),
    fetchText(DP_FILES.picks),
    fetchText(DP_FILES.ids, 60_000),
  ]);
  const players = parseCsv(playersCsv);
  const values = parseCsv(valuesCsv);
  const picks = parseCsv(picksCsv);
  const ids = parseCsv(idsCsv);
  const valueCols = Object.keys(values[0]);
  const pickRows = values.filter((r) => r.pos === "PICK");

  await save("dynastyprocess/values-players.csv", playersCsv);
  await save("dynastyprocess/values.picks-only.csv", toCsv(pickRows, valueCols));
  await save("dynastyprocess/values-picks.head.csv", toCsv(picks.slice(0, 5), Object.keys(picks[0])));

  const fpIds = new Set(players.map((r) => r.fp_id));
  const idRows = ids.filter((r) => fpIds.has(r.fantasypros_id));
  await save("dynastyprocess/db_playerids.trimmed.csv", toCsv(idRows, DP_ID_COLUMNS));

  const withSleeper = new Map(ids.filter((r) => r.sleeper_id && r.sleeper_id !== "NA").map((r) => [r.fantasypros_id, r.sleeper_id]));
  const unmatched = players.filter((r) => !withSleeper.has(r.fp_id));
  probes.dynastyprocess = {
    files: DP_FILES,
    playersRows: players.length,
    playersColumns: Object.keys(players[0]),
    valuesRows: values.length,
    valuesPickRows: pickRows.length,
    picksFileColumns: Object.keys(picks[0]),
    idsRows: ids.length,
    idsWithSleeperId: withSleeper.size,
    playersMatchedViaFpId: players.length - unmatched.length,
    playersUnmatchedViaFpId: unmatched.map((r) => `${r.player} (${r.pos}, fp_id ${r.fp_id})`),
    pickLabels: pickRows.map((r) => r.player),
    scrapeDate: players[0]?.scrape_date,
  };
  return new Set(idRows.map((r) => r.sleeper_id).filter((x) => x && x !== "NA"));
}

// --------------------------------------------------------------------- Sleeper

async function sleeper(extraIds: Set<string>) {
  console.log("Sleeper");
  const state = await fetchJson<SleeperState>(sleeperUrls.state());
  await save("sleeper/state.json", state);

  const user = await fetchJson<SleeperUser | null>(sleeperUrls.user(SLEEPER_USER));
  if (!user) throw new Error(`Sleeper user ${SLEEPER_USER} not found`);
  await save("sleeper/user.json", { ...user, username: "sample_user", display_name: "Sample User", avatar: null });

  const trimLeague = (l: SleeperLeague, i: number): SleeperLeague => ({
    league_id: l.league_id,
    name: `Sample League ${i + 1}`,
    season: l.season,
    status: l.status,
    total_rosters: l.total_rosters,
    roster_positions: l.roster_positions,
    previous_league_id: l.previous_league_id,
    draft_id: l.draft_id,
    settings: { type: l.settings.type, draft_rounds: l.settings.draft_rounds, num_teams: l.settings.num_teams },
    scoring_settings: { rec: l.scoring_settings.rec, bonus_rec_te: l.scoring_settings.bonus_rec_te } as SleeperLeague["scoring_settings"],
  });

  const leagues = (await fetchJson<SleeperLeague[]>(sleeperUrls.leagues(user.user_id, state.league_season))) ?? [];
  await save("sleeper/leagues.json", leagues.slice(0, 5).map(trimLeague));

  const league = await fetchJson<SleeperLeague>(sleeperUrls.league(SLEEPER_LEAGUE));
  const [rosters, users, traded, drafts] = await Promise.all([
    fetchJson<SleeperRoster[]>(sleeperUrls.rosters(SLEEPER_LEAGUE)),
    fetchJson<SleeperLeagueUser[]>(sleeperUrls.users(SLEEPER_LEAGUE)),
    fetchJson<SleeperTradedPick[]>(sleeperUrls.tradedPicks(SLEEPER_LEAGUE)),
    fetchJson<SleeperDraft[]>(sleeperUrls.drafts(SLEEPER_LEAGUE)),
  ]);
  await save("sleeper/league.json", trimLeague(league, 0));
  await save("sleeper/rosters.json", rosters.map((r) => ({
    roster_id: r.roster_id, owner_id: r.owner_id, co_owners: r.co_owners ?? null,
    players: r.players, reserve: r.reserve ?? null, taxi: r.taxi ?? null,
  })));
  await save("sleeper/users.json", users.map((u, i) => ({
    user_id: u.user_id, display_name: `Owner ${i + 1}`, metadata: { team_name: `Team ${i + 1}` },
  })));
  await save("sleeper/traded_picks.json", traded);
  await save("sleeper/drafts.json", drafts.map((d) => ({
    draft_id: d.draft_id, season: d.season, status: d.status, type: d.type,
    settings: { rounds: d.settings.rounds, teams: d.settings.teams },
    draft_order: d.draft_order ?? null,
    slot_to_roster_id: d.slot_to_roster_id ?? null,
  })));

  // One league per observed `settings.type`, gathered from league-mates' leagues.
  const byType: Record<string, SleeperLeague> = {};
  for (const u of users.slice(0, 8)) {
    const ls = (await fetchJson<SleeperLeague[]>(sleeperUrls.leagues(u.user_id, state.league_season))) ?? [];
    for (const l of ls) byType[String(l.settings.type)] ??= l;
    await sleep(250);
  }
  await save("sleeper/leagues-by-type.json", Object.values(byType).map(trimLeague));

  const raw = await fetchJson<Record<string, SleeperRawPlayer>>(sleeperUrls.players(), 60_000);
  const trimmed = trimPlayers(raw);
  const keep = new Set([...extraIds, ...rosters.flatMap((r) => r.players ?? [])]);
  await save("sleeper/players.trimmed.json", trimmed.filter((p) => keep.has(p.id)));

  const tradedSeasons: Record<string, number> = {};
  for (const t of traded) tradedSeasons[t.season] = (tradedSeasons[t.season] ?? 0) + 1;
  probes.sleeper = {
    state,
    sampleUserLeagues: leagues.length,
    leagueTypesObserved: Object.keys(byType),
    sampleLeague: {
      id: SLEEPER_LEAGUE,
      type: league.settings.type,
      total_rosters: league.total_rosters,
      superflex: league.roster_positions.includes("SUPER_FLEX"),
      rec: league.scoring_settings.rec,
      bonus_rec_te: league.scoring_settings.bonus_rec_te,
      draft_rounds: league.settings.draft_rounds,
      rosters: rosters.length,
      users: users.length,
      tradedPickSeasons: tradedSeasons,
      drafts: drafts.map((d) => ({ season: d.season, status: d.status, rounds: d.settings.rounds })),
    },
    playersDb: { entries: Object.keys(raw).length, fantasyPositions: trimmed.length, bytesApprox: JSON.stringify(raw).length },
  };
}

// ------------------------------------------------------------- KeepTradeCut

async function ktc() {
  console.log("KeepTradeCut");
  const players = extractKtcPlayers(await fetchText(KTC_URL));
  const trimSet = (v: KtcPlayer["oneQBValues"]) => ({
    value: v.value,
    tep: { value: v.tep?.value },
    tepp: { value: v.tepp?.value },
    teppp: { value: v.teppp?.value },
  });
  // Keep the first 250 players as the page lists them, and every pick.
  let kept = 0;
  const top = players.filter((p) => p.position === "RDP" || ++kept <= 250);
  const trimmed = top.map((p) => ({
    playerName: p.playerName,
    playerID: p.playerID,
    position: p.position,
    team: p.team,
    mflid: p.mflid ?? null,
    oneQBValues: trimSet(p.oneQBValues),
    superflexValues: trimSet(p.superflexValues),
  }));
  // One record per line keeps the file diffable.
  await save("ktc/ktc-players.json", `[\n${trimmed.map((p) => JSON.stringify(p)).join(",\n")}\n]\n`);
  const count: Record<string, number> = {};
  for (const p of players) count[p.position] = (count[p.position] ?? 0) + 1;
  await save("ktc/probe.json", {
    fetchedAt: new Date().toISOString(),
    url: KTC_URL,
    entries: players.length,
    byPosition: count,
    pickLabels: players.filter((p) => p.position === "RDP").map((p) => p.playerName),
    missingMflid: players.filter((p) => p.position !== "RDP" && !p.mflid).length,
  });
}

// ------------------------------------------------------------- Dynasty Dealer

async function dynastyDealer() {
  console.log("Dynasty Dealer");
  const trim = (e: DdEntry) => ({
    sleeper_id: e.sleeper_id,
    name: e.name,
    position: e.position,
    team: e.team,
    base_value: e.base_value,
    current_value: e.current_value,
  });
  const out: Record<string, unknown> = {};
  const variants: [string, LeagueSettings, number][] = [
    ["dynasty", DEFAULT_SETTINGS, 300],
    ["redraft-half", { ...DEFAULT_SETTINGS, format: "redraft" }, 150],
    ["redraft-ppr-sf", { ...DEFAULT_SETTINGS, format: "redraft", ppr: 1, numQbs: 2 }, 60],
  ];
  for (const [name, settings, keepPlayers] of variants) {
    const url = dynastyDealerUrl(settings);
    const res = await fetchJson<{ players: DdEntry[]; scoringSettings?: unknown; format?: unknown; timestamp?: string }>(url);
    let kept = 0;
    // Top players (the list is sorted by value) plus every pick.
    const rows = res.players.filter((e) => e.position === "PICK" || ++kept <= keepPlayers).map(trim);
    await save(`dynastydealer/player-values-${name}.json`, `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
    const count: Record<string, number> = {};
    for (const e of res.players) count[e.position] = (count[e.position] ?? 0) + 1;
    out[name] = {
      url,
      entries: res.players.length,
      byPosition: count,
      echoedSettings: res.scoringSettings ?? res.format,
      timestamp: res.timestamp,
      top: res.players.slice(0, 3).map((e) => `${e.name} ${e.current_value}`),
    };
    await sleep(500);
  }
  probes.dynastydealer = out;
}

// ---------------------------------------------------------------- RosterAudit

async function rosterAudit() {
  console.log("RosterAudit");
  const players: RaPlayer[] = [];
  let meta: Record<string, unknown> = {};
  for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
    const res = await fetchJson<{ players: RaPlayer[]; total_pages: number } & Record<string, unknown>>(
      `${RA_BASE}/rankings?format=sf&per_page=100&page=${page}`,
    );
    players.push(...res.players);
    pages = res.total_pages;
    if (page === 1) meta = Object.fromEntries(Object.entries(res).filter(([k]) => k !== "players"));
    await sleep(300);
  }
  const picks = (await fetchJson<{ picks: RaPick[] }>(`${RA_BASE}/picks`)).picks;
  const trimmed = players.map((p) => ({
    sleeper_id: p.sleeper_id,
    name: p.name,
    position: p.position,
    team: p.team,
    val_sf_market: p.val_sf_market,
    val_1qb_market: p.val_1qb_market,
  }));
  await save("rosteraudit/rankings-sf.json", `[\n${trimmed.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
  await save("rosteraudit/picks.json", picks.map(({ pick_season, pick_round, pick_slot, val_sf, val_1qb, label }) => ({ pick_season, pick_round, pick_slot, val_sf, val_1qb, label })));
  probes.rosteraudit = {
    rankingsMeta: meta,
    players: players.length,
    picks: picks.length,
    pickSeasons: [...new Set(picks.map((p) => p.pick_season))],
    pickSlots: [...new Set(picks.map((p) => String(p.pick_slot)))],
  };
}

async function main() {
  const run = (name: string) => ONLY.size === 0 || ONLY.has(name);
  if (ONLY.has("ktc")) await ktc();
  if (run("dynastydealer")) await dynastyDealer();
  if (run("rosteraudit")) await rosterAudit();
  if (run("fantasycalc") || run("dynastyprocess") || run("sleeper")) {
    const fc = await fantasyCalc();
    const dpSleeperIds = await dynastyProcess();
    const fcSleeperIds = fc.map((r) => r.player.sleeperId).filter((x): x is string => !!x && !x.startsWith("FP_"));
    await sleeper(new Set([...dpSleeperIds, ...fcSleeperIds]));
  }
  // A partial run writes its probes next to the others instead of replacing probes.json.
  await save(ONLY.size ? `probes.${[...ONLY].sort().join("+")}.json` : "probes.json", probes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
