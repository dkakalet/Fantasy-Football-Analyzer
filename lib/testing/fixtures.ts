// Fixture loaders for tests (fixtures/ holds trimmed live responses).
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Cached } from "../cache";
import { parseCsv } from "../csv";
import type { DpIdRow, DpRaw, DpValueRow } from "../sources/dynastyprocess";
import { trimIdRows } from "../sources/dynastyprocess";
import type { FcRecord } from "../sources/fantasycalc";
import type { SleeperPlayer } from "../sleeper/players";

const ROOT = path.join(__dirname, "..", "..", "fixtures");
export const FIXTURE_TIME = Date.parse("2026-09-25T12:00:00Z");

export const readFixture = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
export const jsonFixture = <T>(rel: string): T => JSON.parse(readFixture(rel)) as T;

export const fcFixture = (variant = "dynasty-1qb-12-ppr0.5") =>
  jsonFixture<FcRecord[]>(`fantasycalc/values-${variant}.json`);

export function dpFixture(): DpRaw {
  return {
    players: parseCsv(readFixture("dynastyprocess/values-players.csv")) as unknown as DpValueRow[],
    picks: parseCsv(readFixture("dynastyprocess/values.picks-only.csv")) as unknown as DpValueRow[],
  };
}

export const dpIdsFixture = (): DpIdRow[] => trimIdRows(parseCsv(readFixture("dynastyprocess/db_playerids.trimmed.csv")));

export const sleeperPlayersFixture = () => jsonFixture<SleeperPlayer[]>("sleeper/players.trimmed.json");

export const asCached = <T>(value: T): Cached<T> => ({ value, fetchedAt: FIXTURE_TIME, from: "network" });
