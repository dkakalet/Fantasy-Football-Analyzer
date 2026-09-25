// Server-side TTL cache: in-memory, plus an optional JSON file layer in `.cache/`
// for local dev so restarts of `npm run dev` don't refetch large payloads.
//
// The file layer is off on Vercel (read-only filesystem; `VERCEL` is set there)
// and can be disabled locally with FILE_CACHE=0. Every file operation is
// best-effort: failures fall back to memory/network silently.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const HOUR = 60 * 60 * 1000;

export const TTL = {
  /** Value sources (FantasyCalc, DynastyProcess, KTC). */
  values: 6 * HOUR,
  /** Sleeper player database — large payload, fetch at most once per day. */
  sleeperPlayers: 24 * HOUR,
  /** Sleeper league / roster / user data. */
  sleeperLeague: 5 * 60 * 1000,
} as const;

export interface Cached<T> {
  value: T;
  /** Epoch ms when the value was fetched from the network. */
  fetchedAt: number;
  from: "memory" | "file" | "network" | "stale";
  /** Set when a refresh failed and an expired value was served instead. */
  error?: string;
}

interface Entry {
  value: unknown;
  fetchedAt: number;
}

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<Cached<unknown>>>();

const CACHE_DIR = path.join(process.cwd(), ".cache");

function fileCacheEnabled(): boolean {
  return !process.env.VERCEL && process.env.FILE_CACHE !== "0";
}

function filePath(key: string): string {
  return path.join(CACHE_DIR, key.replace(/[^a-zA-Z0-9._-]+/g, "_") + ".json");
}

async function readFileEntry(key: string): Promise<Entry | null> {
  if (!fileCacheEnabled()) return null;
  try {
    const parsed = JSON.parse(await readFile(filePath(key), "utf8")) as Entry;
    return typeof parsed.fetchedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeFileEntry(key: string, entry: Entry): Promise<void> {
  if (!fileCacheEnabled()) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(filePath(key), JSON.stringify(entry));
  } catch {
    // Best-effort only.
  }
}

/**
 * Return the cached value for `key` if younger than `ttlMs`, else call `loader`.
 * Concurrent callers share one in-flight load. If the loader fails and an
 * expired value exists, that value is returned with `from: "stale"`.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<Cached<T>> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && now - mem.fetchedAt < ttlMs) {
    return { value: mem.value as T, fetchedAt: mem.fetchedAt, from: "memory" };
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<Cached<T>>;

  const load = (async (): Promise<Cached<T>> => {
    const file = await readFileEntry(key);
    if (file && now - file.fetchedAt < ttlMs) {
      memory.set(key, file);
      return { value: file.value as T, fetchedAt: file.fetchedAt, from: "file" };
    }
    try {
      const value = await loader();
      const entry = { value, fetchedAt: Date.now() };
      memory.set(key, entry);
      await writeFileEntry(key, entry);
      return { ...entry, from: "network" };
    } catch (err) {
      const stale = mem ?? file;
      if (stale) {
        return {
          value: stale.value as T,
          fetchedAt: stale.fetchedAt,
          from: "stale",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      throw err;
    }
  })();

  inflight.set(key, load);
  try {
    return await load;
  } finally {
    inflight.delete(key);
  }
}

/** Test helper. */
export function clearMemoryCache(): void {
  memory.clear();
  inflight.clear();
}
