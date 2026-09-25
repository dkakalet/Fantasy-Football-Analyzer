"use client";

import { useState } from "react";
import type { LeagueResponse, LeaguesResponse } from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

const inputClass = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** Username -> leagues this season -> load one league (settings, rosters, pick inventory). */
export function SleeperImport({
  league,
  onLoad,
  onClear,
}: {
  league: LeagueResponse | null;
  onLoad: (league: LeagueResponse) => void;
  onClear: () => void;
}) {
  const [username, setUsername] = useState("");
  const [leagues, setLeagues] = useState<LeaguesResponse | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const findLeagues = () =>
    run(async () => {
      const res = await getJson<LeaguesResponse>(`/api/sleeper/leagues?username=${encodeURIComponent(username.trim())}`);
      setLeagues(res);
      setSelected(res.leagues[0]?.id ?? "");
      if (!res.leagues.length) setError(`${res.user.displayName} has no NFL leagues in ${res.season}.`);
    });

  const loadLeague = () => run(async () => onLoad(await getJson<LeagueResponse>(`/api/sleeper/league/${encodeURIComponent(selected)}`)));

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/50">
      <h3 className="text-sm font-medium">Import from Sleeper</h3>
      {league ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            <strong>{league.league.name}</strong>{" "}
            <span className="text-zinc-500">
              · {league.league.season} · {league.teams.length} teams · settings filled in below (you can still change them)
            </span>
          </span>
          <button type="button" className={buttonClass} onClick={onClear}>
            Remove league
          </button>
        </div>
      ) : (
        <>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (username.trim()) findLeagues();
            }}
          >
            <input
              aria-label="Sleeper username"
              placeholder="Sleeper username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`${inputClass} min-w-0 flex-1`}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit" className={buttonClass} disabled={busy || !username.trim()}>
              Find leagues
            </button>
          </form>
          {leagues && leagues.leagues.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <select aria-label="League" className={`${inputClass} min-w-0 flex-1`} value={selected} onChange={(e) => setSelected(e.target.value)}>
                {leagues.leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.type} · {l.totalRosters} teams{l.superflex ? " · SF" : ""}
                  </option>
                ))}
              </select>
              <button type="button" className={buttonClass} disabled={busy || !selected} onClick={loadLeague}>
                Load league
              </button>
            </div>
          )}
        </>
      )}
      {busy && <p className="text-xs text-zinc-500">Talking to Sleeper…</p>}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
