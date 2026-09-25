// DynastyProcess open data — github.com/dynastyprocess/data, `files/`.
// Filenames confirmed from a listing of the repo (2026-09-25):
//   values-players.csv  player values (value_1qb / value_2qb), keyed by fp_id
//   values.csv          players + picks; the only file with pick values
//                       (values-picks.csv has ECR columns but no values)
//   db_playerids.csv    ID crosswalk (fantasypros_id, mfl_id -> sleeper_id)

import { cached, TTL, type Cached } from "../cache";
import { num, parseCsv } from "../csv";
import { fetchText } from "../http";
import { parseDynastyProcessPick } from "../picks";
import { buildNameIndex, fetchSleeperPlayers, type SleeperPlayer } from "../sleeper/players";
import type { AssetValue, NumQbs, SourceAdapter, SourceLoad } from "../types";

export const DP_BASE = "https://raw.githubusercontent.com/dynastyprocess/data/master/files";
export const DP_FILES = {
  players: `${DP_BASE}/values-players.csv`,
  values: `${DP_BASE}/values.csv`,
  picks: `${DP_BASE}/values-picks.csv`,
  ids: `${DP_BASE}/db_playerids.csv`,
} as const;

/** Row of values-players.csv / values.csv (strings as parsed; "NA" for missing). */
export interface DpValueRow {
  player: string;
  pos: string; // QB | RB | WR | TE | PICK
  team: string;
  value_1qb: string;
  value_2qb: string;
  fp_id: string;
  scrape_date: string;
}

/** Columns of db_playerids.csv that this app keeps. */
export const DP_ID_COLUMNS = [
  "sleeper_id",
  "fantasypros_id",
  "mfl_id",
  "name",
  "merge_name",
  "position",
  "team",
] as const;
export type DpIdRow = Record<(typeof DP_ID_COLUMNS)[number], string>;

export interface DpRaw {
  players: DpValueRow[];
  /** PICK rows from values.csv. */
  picks: DpValueRow[];
}

export function fetchDynastyProcessRaw(): Promise<Cached<DpRaw>> {
  return cached("dynastyprocess:values", TTL.values, async () => {
    const [players, values] = await Promise.all([
      fetchText(DP_FILES.players),
      fetchText(DP_FILES.values),
    ]);
    return {
      players: parseCsv(players) as unknown as DpValueRow[],
      picks: (parseCsv(values) as unknown as DpValueRow[]).filter((r) => r.pos === "PICK"),
    };
  });
}

/** Keep only crosswalk rows that can map to Sleeper, and only the columns we use. */
export function trimIdRows(rows: Record<string, string>[]): DpIdRow[] {
  return rows
    .filter((r) => r.sleeper_id && r.sleeper_id !== "NA")
    .map((r) => Object.fromEntries(DP_ID_COLUMNS.map((c) => [c, r[c] ?? ""])) as DpIdRow);
}

export function fetchDynastyProcessIds(): Promise<Cached<DpIdRow[]>> {
  return cached("dynastyprocess:ids", TTL.values, async () =>
    trimIdRows(parseCsv(await fetchText(DP_FILES.ids, 60_000))),
  );
}

/**
 * Turn DynastyProcess rows into AssetValues for the given QB format.
 * Players: fp_id -> crosswalk sleeper_id first, normalized name + position second.
 */
export function mapDynastyProcess(
  raw: DpRaw,
  ids: readonly DpIdRow[],
  sleeperPlayers: readonly SleeperPlayer[],
  numQbs: NumQbs,
): Pick<SourceLoad, "values" | "stats"> {
  const col = numQbs === 2 ? "value_2qb" : "value_1qb";
  const byFpId = new Map<string, string>();
  for (const r of ids) if (r.fantasypros_id && r.fantasypros_id !== "NA" && !byFpId.has(r.fantasypros_id)) byFpId.set(r.fantasypros_id, r.sleeper_id);
  const byName = buildNameIndex(sleeperPlayers);

  const values: AssetValue[] = [];
  const skipped: Record<string, number> = {};
  const matchedBy: Record<string, number> = { crosswalk: 0, name: 0 };
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

  for (const r of raw.players) {
    const v = num(r[col]);
    if (v === null) {
      skip("no value");
      continue;
    }
    let id = byFpId.get(r.fp_id);
    if (id) matchedBy.crosswalk++;
    else {
      id = byName(r.player, r.pos, r.team);
      if (id) matchedBy.name++;
    }
    if (!id) {
      skip("no Sleeper match");
      continue;
    }
    values.push({ assetId: id, kind: "player", rawValue: v, sourceName: r.player, position: r.pos, team: r.team || null });
  }

  let picks = 0;
  for (const r of raw.picks) {
    const key = parseDynastyProcessPick(r.player);
    const v = num(r[col]);
    if (!key || v === null) {
      skip(key ? "no value" : "unrecognized pick label");
      continue;
    }
    picks++;
    values.push({ assetId: key, kind: "pick", rawValue: v, sourceName: r.player });
  }
  return { values, stats: { players: raw.players.length, picks, skipped, matchedBy } };
}

export interface DynastyProcessDeps {
  loadRaw: () => Promise<Cached<DpRaw>>;
  loadIds: () => Promise<Cached<DpIdRow[]>>;
  loadSleeperPlayers: () => Promise<Cached<SleeperPlayer[]>>;
}

export function createDynastyProcessSource(
  deps: DynastyProcessDeps = {
    loadRaw: fetchDynastyProcessRaw,
    loadIds: fetchDynastyProcessIds,
    loadSleeperPlayers: fetchSleeperPlayers,
  },
): SourceAdapter {
  const source: SourceAdapter = {
    id: "dynastyprocess",
    name: "DynastyProcess",
    homepage: "https://dynastyprocess.com",
    // Dynasty only. One fixed scoring baseline and no team-count or TE-premium
    // variants, so those settings are always approximations.
    supports: (s) =>
      s.format !== "dynasty"
        ? { supported: false, approximated: [] }
        : { supported: true, approximated: ["ppr", "teams", ...(s.tep !== "none" ? ["tep"] : [])] },
    async load(settings) {
      const [raw, ids, sleeperPlayers] = await Promise.all([
        deps.loadRaw(),
        deps.loadIds(),
        // Name fallback is optional: without the Sleeper DB, only crosswalk matches count.
        deps.loadSleeperPlayers().catch(() => null),
      ]);
      return {
        ...mapDynastyProcess(raw.value, ids.value, sleeperPlayers?.value ?? [], settings.numQbs),
        fetchedAt: Math.min(raw.fetchedAt, ids.fetchedAt),
        from: raw.from === "stale" || ids.from === "stale" ? "stale" : raw.from,
        error: raw.error ?? ids.error,
      };
    },
    fetchValues: async (settings) => (await source.load(settings)).values,
  };
  return source;
}
