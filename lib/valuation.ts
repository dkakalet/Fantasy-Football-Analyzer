// Joins every enabled source into one consensus table for a set of league
// settings. `buildValuation` is pure (tested against fixtures); `getValuation`
// does the fetching.
//
// Every number is traceable: raw source value -> × scale factor -> normalized
// value -> median across sources -> consensus value.

import { consensus } from "./consensus";
import { computeScaleFactor, DEFAULT_TOP_N } from "./normalize";
import { fallbackFirstPickSeason, parsePickKey, pickLabel, resolvePick, slotKey, TIERS, tierKey, type PickVia } from "./picks";
import { fetchSleeperPlayers, type SleeperPlayer } from "./sleeper/players";
import { enabledSources, SOURCE_ORDER } from "./sources";
import type { AssetKind, AssetValue, LeagueSettings, SourceAdapter, SourceId, SourceLoad, SupportResult } from "./types";

export type SourceStatus = "ok" | "stale" | "error" | "unsupported";

export interface SourceMeta {
  id: SourceId;
  name: string;
  homepage: string;
  status: SourceStatus;
  supported: boolean;
  /** Settings this source approximates (e.g. "ppr", "teams", "tep"). */
  approximated: string[];
  isReference: boolean;
  /** Scale factor to the reference (1 for the reference itself). */
  factor: number | null;
  /** Players shared with the reference, and how many of them fit the factor. */
  overlap: number;
  factorPlayers: number;
  players: number;
  picks: number;
  /** Share of the source's player records matched to a player in the Sleeper DB. */
  matchRate: number | null;
  matchedBy: Record<string, number>;
  skipped: Record<string, number>;
  /** Pick values for seasons whose draft has already happened (ignored). */
  pastSeasonPicks: number;
  fetchedAt: string | null;
  cache: SourceLoad["from"] | null;
  error?: string;
}

export interface SourceValue {
  source: SourceId;
  raw: number;
  normalized: number;
  sourceName: string;
  /** For picks: how the source value was found, and the source key used. */
  via?: PickVia;
  viaKey?: string;
  /** Approximations behind this number (settings the source can't match, pick fallbacks). */
  flags: string[];
}

export interface ConsensusAsset {
  id: string;
  kind: AssetKind;
  name: string;
  position: string | null;
  team: string | null;
  /** Median of normalized source values; null = no source has it. */
  value: number | null;
  singleSource: boolean;
  sources: SourceValue[];
}

export interface Valuation {
  settings: LeagueSettings;
  generatedAt: string;
  reference: SourceId | null;
  topN: number;
  /** Consensus value of the #1 overall asset (V_ref for the adjusted score). */
  vRef: number | null;
  vRefAsset: string | null;
  pickSeasons: number[];
  pickRounds: number;
  sources: SourceMeta[];
  /** Sorted by consensus value, highest first. */
  assets: ConsensusAsset[];
  warnings: string[];
}

export interface SourceResult {
  adapter: Pick<SourceAdapter, "id" | "name" | "homepage" | "supports">;
  load?: SourceLoad;
  error?: string;
}

export interface BuildInput {
  settings: LeagueSettings;
  results: SourceResult[];
  sleeperPlayers: readonly SleeperPlayer[] | null;
  topN?: number;
  now?: Date;
}

const PICK_FLAG: Record<PickVia, string | null> = {
  exact: null,
  tier: "tier value used for exact slot",
  round: "round-level value (source has no tiers)",
};

export function buildValuation({ settings, results, sleeperPlayers, topN = DEFAULT_TOP_N, now = new Date() }: BuildInput): Valuation {
  const warnings: string[] = [];
  const ordered = [...results].sort((a, b) => SOURCE_ORDER.indexOf(a.adapter.id) - SOURCE_ORDER.indexOf(b.adapter.id));

  interface Active {
    result: SourceResult;
    load: SourceLoad;
    support: SupportResult;
    players: Map<string, AssetValue>;
    picks: Map<string, AssetValue>;
  }
  const active: Active[] = [];
  const supportById = new Map<SourceId, SupportResult>();
  for (const r of ordered) {
    const support = r.adapter.supports(settings);
    supportById.set(r.adapter.id, support);
    if (!support.supported || !r.load) continue;
    const players = new Map<string, AssetValue>();
    const picks = new Map<string, AssetValue>();
    for (const v of r.load.values) {
      const map = v.kind === "player" ? players : picks;
      const prev = map.get(v.assetId);
      if (!prev || v.rawValue > prev.rawValue) map.set(v.assetId, v); // duplicate match: keep the higher value
    }
    active.push({ result: r, load: r.load, support, players, picks });
  }

  const ref = active[0] ?? null;
  if (ref && ref.result.adapter.id !== SOURCE_ORDER[0]) {
    warnings.push(`${SOURCE_ORDER[0]} unavailable; values are on the ${ref.result.adapter.name} scale instead.`);
  }

  // Scale factors against the reference.
  const factors = new Map<SourceId, ReturnType<typeof computeScaleFactor>>();
  if (ref) {
    const refValues = new Map([...ref.players].map(([id, v]) => [id, v.rawValue]));
    for (const a of active) {
      const src = new Map([...a.players].map(([id, v]) => [id, v.rawValue]));
      factors.set(a.result.adapter.id, a === ref ? { ...computeScaleFactor(refValues, src, topN), factor: 1 } : computeScaleFactor(refValues, src, topN));
    }
  }
  const usable = active.filter((a) => factors.get(a.result.adapter.id)?.factor != null);
  for (const a of active) {
    if (!usable.includes(a)) warnings.push(`${a.result.adapter.name}: no players in common with the reference; excluded.`);
  }

  // Which draft seasons are live: those the reference prices (its earliest onward).
  const seasonsOf = (a: Active) => [...a.picks.keys()].map((k) => parsePickKey(k)!.season);
  const refSeasons = ref ? seasonsOf(ref) : [];
  const firstSeason = refSeasons.length ? Math.min(...refSeasons) : fallbackFirstPickSeason(now);
  const pickSeasons = [...new Set(usable.flatMap(seasonsOf).filter((s) => s >= firstSeason))].sort((a, b) => a - b);
  let pickRounds = 0;
  for (const a of usable) for (const k of a.picks.keys()) {
    const p = parsePickKey(k)!;
    if (p.season >= firstSeason) pickRounds = Math.max(pickRounds, p.round);
  }

  // Players.
  const directory = new Map((sleeperPlayers ?? []).map((p) => [p.id, p]));
  const assets: ConsensusAsset[] = [];
  const playerIds = new Set(usable.flatMap((a) => [...a.players.keys()]));
  for (const id of playerIds) {
    const sources: SourceValue[] = [];
    let fallback: AssetValue | undefined;
    for (const a of usable) {
      const v = a.players.get(id);
      if (!v) continue;
      fallback ??= v;
      const factor = factors.get(a.result.adapter.id)!.factor!;
      sources.push({ source: a.result.adapter.id, raw: v.rawValue, normalized: v.rawValue * factor, sourceName: v.sourceName, flags: [...a.support.approximated] });
    }
    const sp = directory.get(id);
    const c = consensus(sources.map((s) => s.normalized));
    assets.push({
      id,
      kind: "player",
      name: sp?.name ?? fallback!.sourceName,
      position: sp?.pos ?? fallback!.position ?? null,
      team: sp ? sp.team : (fallback!.team ?? null),
      value: c.value,
      singleSource: c.singleSource,
      sources,
    });
  }

  // Picks: every tier key for live seasons, plus exact-slot keys where a source prices slots.
  const pickKeys: string[] = [];
  for (const season of pickSeasons)
    for (let round = 1; round <= pickRounds; round++) for (const tier of TIERS) pickKeys.push(tierKey(season, round, tier));
  for (const a of usable)
    for (const k of a.picks.keys()) {
      const p = parsePickKey(k)!;
      if (p.slot !== null && p.season >= firstSeason) pickKeys.push(slotKey(p.season, p.round, p.slot));
    }
  for (const key of new Set(pickKeys)) {
    const sources: SourceValue[] = [];
    for (const a of usable) {
      const hit = resolvePick((k) => a.picks.get(k), key, settings.numTeams);
      if (!hit) continue;
      const factor = factors.get(a.result.adapter.id)!.factor!;
      const flag = PICK_FLAG[hit.via];
      sources.push({
        source: a.result.adapter.id,
        raw: hit.value.rawValue,
        normalized: hit.value.rawValue * factor,
        sourceName: hit.value.sourceName,
        via: hit.via,
        viaKey: hit.key,
        flags: [...a.support.approximated, ...(flag ? [flag] : [])],
      });
    }
    if (sources.length === 0) continue;
    const c = consensus(sources.map((s) => s.normalized));
    assets.push({ id: key, kind: "pick", name: pickLabel(key), position: null, team: null, value: c.value, singleSource: c.singleSource, sources });
  }

  assets.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const top = assets[0] ?? null;

  // Per-source metadata for /api/health and the UI.
  const sleeperIds = sleeperPlayers ? new Set(sleeperPlayers.map((p) => p.id)) : null;
  const sources: SourceMeta[] = ordered.map((r) => {
    const support = supportById.get(r.adapter.id)!;
    const a = active.find((x) => x.result === r);
    const f = factors.get(r.adapter.id);
    const base = {
      id: r.adapter.id,
      name: r.adapter.name,
      homepage: r.adapter.homepage,
      supported: support.supported,
      approximated: support.approximated,
      isReference: a === ref && ref !== null,
      factor: f?.factor ?? null,
      overlap: f?.overlap ?? 0,
      factorPlayers: f?.used ?? 0,
      players: r.load?.stats.players ?? 0,
      picks: r.load?.stats.picks ?? 0,
      matchedBy: r.load?.stats.matchedBy ?? {},
      skipped: r.load?.stats.skipped ?? {},
      fetchedAt: r.load ? new Date(r.load.fetchedAt).toISOString() : null,
      cache: r.load?.from ?? null,
    };
    const matched = a && sleeperIds ? [...a.players.keys()].filter((id) => sleeperIds.has(id)).length : null;
    const matchRate = matched !== null && base.players > 0 ? matched / base.players : null;
    const pastSeasonPicks = a ? [...a.picks.keys()].filter((k) => parsePickKey(k)!.season < firstSeason).length : 0;
    let status: SourceStatus;
    let error = r.error ?? r.load?.error;
    if (!support.supported) status = "unsupported";
    else if (!r.load) status = "error";
    else if (!f || f.factor === null) {
      status = "error";
      error = "no players in common with the reference scale";
    } else status = r.load.from === "stale" ? "stale" : "ok";
    return { ...base, status, matchRate, pastSeasonPicks, ...(error ? { error } : {}) };
  });
  for (const s of sources) if (s.status === "error") warnings.push(`${s.name} failed: ${s.error ?? "unknown error"}`);

  return {
    settings,
    generatedAt: now.toISOString(),
    reference: ref?.result.adapter.id ?? null,
    topN,
    vRef: top?.value ?? null,
    vRefAsset: top?.id ?? null,
    pickSeasons,
    pickRounds,
    sources,
    assets,
    warnings,
  };
}

export async function loadSource(adapter: SourceAdapter, settings: LeagueSettings): Promise<SourceResult> {
  if (!adapter.supports(settings).supported) return { adapter };
  try {
    return { adapter, load: await adapter.load(settings) };
  } catch (e) {
    return { adapter, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getValuation(settings: LeagueSettings, adapters: SourceAdapter[] = enabledSources()): Promise<Valuation> {
  const [results, sleeper] = await Promise.all([
    Promise.all(adapters.map((a) => loadSource(a, settings))),
    fetchSleeperPlayers().catch(() => null),
  ]);
  const valuation = buildValuation({ settings, results, sleeperPlayers: sleeper?.value ?? null });
  if (!sleeper) valuation.warnings.push("Sleeper player database unavailable; match rates and some names are missing.");
  return valuation;
}
