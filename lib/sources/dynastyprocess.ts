// DynastyProcess open data — github.com/dynastyprocess/data, `files/`.
// Filenames confirmed from a listing of the repo (2026-09-25):
//   values-players.csv  player values (value_1qb / value_2qb), keyed by fp_id
//   values.csv          players + picks; the only file with pick values
//                       (values-picks.csv has ECR columns but no values)
//   db_playerids.csv    ID crosswalk (fantasypros_id, mfl_id -> sleeper_id)

import { cached, TTL, type Cached } from "../cache";
import { parseCsv } from "../csv";
import { fetchText } from "../http";

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
