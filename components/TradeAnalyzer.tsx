"use client";

import { useMemo, useState } from "react";
import { fallbackFirstPickSeason } from "@/lib/picks";
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
import { TradeColumn } from "./TradeColumn";
import type { Health, PlayersResponse } from "./types";
import { useJson } from "./useJson";

type Ref = AssetRef & { detail?: string };
type Sides = Record<Side, Ref[]>;

const DEFAULT_NAMES: Record<Side, string> = { A: "Team A", B: "Team B" };
const DEFAULT_ROUNDS = 4;

const sameTrade = (x: Sides, y: Sides) =>
  (["A", "B"] as const).every((s) => x[s].length === y[s].length && x[s].every((r, i) => r.id === y[s][i].id));

export function TradeAnalyzer() {
  const [settings, setSettings] = useState<LeagueSettings>(DEFAULT_SETTINGS);
  const [sides, setSides] = useState<Sides>({ A: [], B: [] });
  const [analyzed, setAnalyzed] = useState<Sides | null>(null);
  const [alpha, setAlpha] = useState(DEFAULT_ALPHA);
  const names = DEFAULT_NAMES;

  const query = settingsToQuery(settings);
  const values = useJson<Valuation>(`/api/values?${query}`);
  const health = useJson<Health>(`/api/health?${query}`);
  const players = useJson<PlayersResponse>("/api/players");
  const valuation = values.data;

  const assets = useMemo(() => new Map<string, ConsensusAsset>((valuation?.assets ?? []).map((a) => [a.id, a])), [valuation]);

  // Everyone searchable: the Sleeper index plus any valued player it lacks.
  const searchable = useMemo(() => {
    const byId = new Map<string, SearchablePlayer>();
    for (const p of players.data?.players ?? []) byId.set(p.id, { ...p, value: null });
    for (const a of valuation?.assets ?? [])
      if (a.kind === "player") byId.set(a.id, { id: a.id, name: a.name, pos: a.position ?? "", team: a.team, value: a.value });
    return [...byId.values()];
  }, [players.data, valuation]);

  const inTrade = useMemo(() => new Set([...sides.A, ...sides.B].map((r) => r.id)), [sides]);

  const pickSeasons = useMemo(() => {
    if (valuation?.pickSeasons.length) return valuation.pickSeasons;
    const first = fallbackFirstPickSeason(new Date());
    return [first, first + 1, first + 2];
  }, [valuation]);
  const pickRounds = Math.max(valuation?.pickRounds || 0, DEFAULT_ROUNDS);

  const items = (side: Side) => sides[side].map((ref) => ({ ref, valued: valueAsset(ref, assets, settings.numTeams) }));
  const add = (side: Side) => (ref: Ref) => setSides((s) => ({ ...s, [side]: [...s[side], ref] }));
  const remove = (side: Side) => (index: number) => setSides((s) => ({ ...s, [side]: s[side].filter((_, i) => i !== index) }));

  const evaluation = useMemo(
    () =>
      analyzed && valuation?.vRef
        ? evaluateTrade({ aGives: analyzed.A, bGives: analyzed.B, assets, teams: settings.numTeams, vRef: valuation.vRef, alpha })
        : null,
    [analyzed, valuation, assets, settings.numTeams, alpha],
  );

  const canAnalyze = Boolean(valuation?.vRef) && sides.A.length + sides.B.length > 0;

  return (
    <>
      <Header health={health.data} settings={settings} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6">
        <SettingsPanel settings={settings} onChange={setSettings} sources={valuation?.sources ?? []} />

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
          {(["A", "B"] as const).map((side) => (
            <TradeColumn
              key={side}
              title={`${names[side]} gives`}
              items={items(side)}
              players={searchable}
              exclude={inTrade}
              pickSeasons={pickSeasons}
              pickRounds={pickRounds}
              onAdd={add(side)}
              onRemove={remove(side)}
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
