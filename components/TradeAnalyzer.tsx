"use client";

import { useMemo, useState } from "react";
import { fallbackFirstPickSeason, pickLabel } from "@/lib/picks";
import { DEFAULT_ALPHA, type Side } from "@/lib/scoring";
import type { SearchablePlayer } from "@/lib/search";
import { DEFAULT_SETTINGS, settingsToQuery } from "@/lib/settings";
import { evaluateTrade, valueAsset, type AssetRef } from "@/lib/trade";
import type { LeagueSettings } from "@/lib/types";
import type { ConsensusAsset, Valuation } from "@/lib/valuation";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { ResultsCard } from "./ResultsCard";
import { SettingsPanel } from "./SettingsPanel";
import { SleeperImport } from "./SleeperImport";
import { TradeColumn } from "./TradeColumn";
import type { Health, LeagueResponse, PlayersResponse } from "./types";
import { useJson } from "./useJson";

/** A trade asset; `invId` marks a pick taken from a team's Sleeper inventory. */
type Ref = AssetRef & { detail?: string; invId?: string };
type Sides = Record<Side, Ref[]>;

const SIDES = ["A", "B"] as const;
const DEFAULT_NAMES: Record<Side, string> = { A: "Team A", B: "Team B" };
const DEFAULT_ROUNDS = 4;

const sameTrade = (x: Sides, y: Sides) => SIDES.every((s) => x[s].length === y[s].length && x[s].every((r, i) => r.id === y[s][i].id));

export function TradeAnalyzer() {
  const [settings, setSettings] = useState<LeagueSettings>(DEFAULT_SETTINGS);
  const [sides, setSides] = useState<Sides>({ A: [], B: [] });
  const [analyzed, setAnalyzed] = useState<Sides | null>(null);
  const [alpha, setAlpha] = useState(DEFAULT_ALPHA);
  const [league, setLeague] = useState<LeagueResponse | null>(null);
  const [teamFor, setTeamFor] = useState<Record<Side, number | null>>({ A: null, B: null });
  const [searchAll, setSearchAll] = useState<Record<Side, boolean>>({ A: false, B: false });

  const query = settingsToQuery(settings);
  const values = useJson<Valuation>(`/api/values?${query}`);
  const health = useJson<Health>(`/api/health?${query}`);
  const players = useJson<PlayersResponse>("/api/players");
  const valuation = values.data;

  const assets = useMemo(() => new Map<string, ConsensusAsset>((valuation?.assets ?? []).map((a) => [a.id, a])), [valuation]);
  const teams = useMemo(() => new Map((league?.teams ?? []).map((t) => [t.rosterId, t])), [league]);
  const teamOf = (side: Side) => (teamFor[side] !== null ? teams.get(teamFor[side]!) ?? null : null);
  const names: Record<Side, string> = { A: teamOf("A")?.name ?? DEFAULT_NAMES.A, B: teamOf("B")?.name ?? DEFAULT_NAMES.B };

  // Everyone searchable: the Sleeper index, rostered players in the imported league, and any valued player.
  const searchable = useMemo(() => {
    const byId = new Map<string, SearchablePlayer>();
    for (const p of [...(players.data?.players ?? []), ...(league?.players ?? [])]) byId.set(p.id, { ...p, value: null });
    for (const a of valuation?.assets ?? [])
      if (a.kind === "player") byId.set(a.id, { id: a.id, name: a.name, pos: a.position ?? "", team: a.team, value: a.value });
    return [...byId.values()];
  }, [players.data, league, valuation]);

  const searchFor = (side: Side) => {
    const team = teamOf(side);
    if (!team || searchAll[side]) return searchable;
    const roster = new Set(team.players);
    return searchable.filter((p) => roster.has(p.id));
  };

  const inTrade = useMemo(() => new Set([...sides.A, ...sides.B].map((r) => r.id)), [sides]);
  const usedPicks = useMemo(() => new Set([...sides.A, ...sides.B].map((r) => r.invId).filter(Boolean)), [sides]);

  const pickSeasons = useMemo(() => {
    const fromValues = valuation?.pickSeasons.length ? valuation.pickSeasons : [0, 1, 2].map((i) => fallbackFirstPickSeason(new Date()) + i);
    return [...new Set([...fromValues, ...(league?.pickSeasons ?? [])])].sort((a, b) => a - b);
  }, [valuation, league]);
  const pickRounds = Math.max(valuation?.pickRounds || 0, league?.rounds ?? 0, DEFAULT_ROUNDS);

  const items = (side: Side) => sides[side].map((ref) => ({ ref, valued: valueAsset(ref, assets, settings.numTeams) }));
  const add = (side: Side) => (ref: Ref) => setSides((s) => ({ ...s, [side]: [...s[side], ref] }));
  const remove = (side: Side) => (index: number) => setSides((s) => ({ ...s, [side]: s[side].filter((_, i) => i !== index) }));

  const loadLeague = (l: LeagueResponse) => {
    setLeague(l);
    setSettings(l.settings);
    setTeamFor({ A: null, B: null });
    setSearchAll({ A: false, B: false });
  };
  const clearLeague = () => {
    setLeague(null);
    setTeamFor({ A: null, B: null });
  };

  const teamControls = (side: Side) => {
    if (!league) return undefined;
    const other = teamFor[side === "A" ? "B" : "A"];
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <select
          aria-label={`Team for side ${side}`}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={teamFor[side] ?? ""}
          onChange={(e) => setTeamFor((t) => ({ ...t, [side]: e.target.value === "" ? null : Number(e.target.value) }))}
        >
          <option value="">— Pick a team —</option>
          {league.teams
            .filter((t) => t.rosterId !== other)
            .map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.name}
              </option>
            ))}
        </select>
        {teamFor[side] !== null && (
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={searchAll[side]} onChange={(e) => setSearchAll((s) => ({ ...s, [side]: e.target.checked }))} />
            Search all players
          </label>
        )}
      </div>
    );
  };

  const pickShortcuts = (side: Side) => {
    const team = teamOf(side);
    if (!team) return undefined;
    if (team.picks.length === 0) return <p className="text-xs text-zinc-500">{team.name} owns no future picks.</p>;
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-zinc-500">{team.name}&apos;s picks</span>
        <div className="flex flex-wrap gap-1.5">
          {team.picks.map((p) => {
            const from = p.originalRosterId !== team.rosterId ? teams.get(p.originalRosterId)?.name ?? `Team ${p.originalRosterId}` : null;
            const detail = `${p.slot === null ? "Tier unknown (Mid)" : "Exact slot"}${from ? ` · from ${from}` : " · own pick"}`;
            // Tier is unknown until the draft order is set, so don't show the default "(Mid)".
            const label = p.slot === null ? pickLabel(p.key).replace(" (Mid)", "") : pickLabel(p.key);
            return (
              <button
                key={p.id}
                type="button"
                disabled={usedPicks.has(p.id)}
                title={detail}
                onClick={() => add(side)({ id: p.key, detail, invId: p.id })}
                className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {label}
                {from ? ` (${from})` : ""}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const evaluation = useMemo(
    () =>
      analyzed && valuation?.vRef
        ? evaluateTrade({ aGives: analyzed.A, bGives: analyzed.B, assets, teams: settings.numTeams, vRef: valuation.vRef, alpha })
        : null,
    [analyzed, valuation, assets, settings.numTeams, alpha],
  );

  const canAnalyze = Boolean(valuation?.vRef) && sides.A.length + sides.B.length > 0;
  const leagueNotes = league ? [`Imported from Sleeper: ${league.league.name}.`, ...league.notes] : undefined;

  return (
    <>
      <Header health={health.data} settings={settings} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6">
        <SettingsPanel settings={settings} onChange={setSettings} sources={valuation?.sources ?? []} notes={leagueNotes}>
          <SleeperImport league={league} onLoad={loadLeague} onClear={clearLeague} />
        </SettingsPanel>

        {values.error && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            Couldn&apos;t load values: {values.error}
          </p>
        )}
        {valuation?.warnings.map((w) => (
          <p key={w} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {w}
          </p>
        ))}
        {values.loading && <p className="text-xs text-zinc-500">{valuation ? "Updating values for these settings…" : "Loading values…"}</p>}

        <div className="grid gap-4 md:grid-cols-2">
          {SIDES.map((side) => (
            <TradeColumn
              key={side}
              title={`${names[side]} gives`}
              items={items(side)}
              players={searchFor(side)}
              exclude={inTrade}
              pickSeasons={pickSeasons}
              pickRounds={pickRounds}
              onAdd={add(side)}
              onRemove={remove(side)}
              teamControls={teamControls(side)}
              pickShortcuts={pickShortcuts(side)}
              searchPlaceholder={teamOf(side) && !searchAll[side] ? `Search ${teamOf(side)!.name}'s roster` : undefined}
              rosterMode={Boolean(teamOf(side)) && !searchAll[side]}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={!canAnalyze}
            onClick={() => setAnalyzed(sides)}
            className="rounded-md bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Analyze
          </button>
          {sides.A.length + sides.B.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSides({ A: [], B: [] });
                setAnalyzed(null);
              }}
              className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Clear trade
            </button>
          )}
        </div>

        {evaluation && valuation && (
          <ResultsCard
            evaluation={evaluation}
            valuation={valuation}
            names={names}
            alpha={alpha}
            onAlphaChange={setAlpha}
            stale={!sameTrade(analyzed!, sides)}
          />
        )}
      </main>
      <Footer sources={health.data?.sources ?? null} />
    </>
  );
}
