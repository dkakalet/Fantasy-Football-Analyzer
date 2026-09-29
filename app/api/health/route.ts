import type { NextRequest } from "next/server";
import { parseSettings } from "@/lib/settings";
import { fetchSleeperPlayers } from "@/lib/sleeper/players";
import { disabledSourceIds, SOURCE_NAMES } from "@/lib/sources";
import { getValuation, type SourceMeta } from "@/lib/valuation";

export const dynamic = "force-dynamic";

type HealthSource = Pick<SourceMeta, "id" | "name"> & {
  status: SourceMeta["status"] | "disabled";
} & Partial<Omit<SourceMeta, "id" | "name" | "status">> & { recordCount?: number };

/**
 * Fetches every enabled source for the given settings (default: Dynasty, 1QB,
 * 0.5 PPR, 12 teams) and reports status, record count, player match rate
 * against the Sleeper DB, and last fetch time.
 */
export async function GET(request: NextRequest) {
  const settings = parseSettings(request.nextUrl.searchParams);
  const [valuation, sleeper] = await Promise.all([
    getValuation(settings),
    fetchSleeperPlayers().then(
      (r) => ({ status: r.from === "stale" ? "stale" : "ok", recordCount: r.value.length, fetchedAt: new Date(r.fetchedAt).toISOString(), cache: r.from }),
      (e: unknown) => ({ status: "error", error: e instanceof Error ? e.message : String(e) }),
    ),
  ]);

  const sources: HealthSource[] = valuation.sources.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    recordCount: s.players + s.picks,
    players: s.players,
    picks: s.picks,
    matchRate: s.matchRate,
    matchedBy: s.matchedBy,
    isReference: s.isReference,
    normalization: s.normalization,
    approximated: s.approximated,
    pastSeasonPicks: s.pastSeasonPicks,
    skipped: s.skipped,
    fetchedAt: s.fetchedAt,
    cache: s.cache,
    ...(s.error ? { error: s.error } : {}),
  }));
  for (const id of disabledSourceIds()) sources.push({ id, name: SOURCE_NAMES[id], status: "disabled" });

  return Response.json({
    checkedAt: new Date().toISOString(),
    settings,
    reference: valuation.reference,
    sources,
    sleeperPlayers: sleeper,
    warnings: valuation.warnings,
  });
}
