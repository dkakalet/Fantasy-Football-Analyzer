import type { NextRequest } from "next/server";
import type { Cached } from "@/lib/cache";
import { parseSettings } from "@/lib/settings";
import { fetchDynastyProcessIds, fetchDynastyProcessRaw } from "@/lib/sources/dynastyprocess";
import { fetchFantasyCalcRaw } from "@/lib/sources/fantasycalc";
import { fetchSleeperPlayers } from "@/lib/sleeper/players";

export const dynamic = "force-dynamic";

type Status = "ok" | "stale" | "error" | "disabled";

interface Check {
  id: string;
  status: Status;
  recordCount?: number;
  detail?: Record<string, number>;
  fetchedAt?: string;
  cache?: Cached<unknown>["from"];
  error?: string;
}

async function check<T>(
  id: string,
  load: () => Promise<Cached<T>>,
  count: (v: T) => { recordCount: number; detail?: Record<string, number> },
): Promise<Check> {
  try {
    const res = await load();
    return {
      id,
      status: res.from === "stale" ? "stale" : "ok",
      ...count(res.value),
      fetchedAt: new Date(res.fetchedAt).toISOString(),
      cache: res.from,
      ...(res.error ? { error: res.error } : {}),
    };
  } catch (e) {
    return { id, status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(request: NextRequest) {
  const settings = parseSettings(request.nextUrl.searchParams);
  const ktcEnabled = process.env.ENABLE_KTC === "true";

  const [fantasycalc, dynastyprocess, dpIds, sleeperPlayers] = await Promise.all([
    check("fantasycalc", () => fetchFantasyCalcRaw(settings), (v) => {
      const picks = v.filter((r) => r.player.position === "PICK").length;
      return { recordCount: v.length, detail: { players: v.length - picks, picks } };
    }),
    check("dynastyprocess", fetchDynastyProcessRaw, (v) => ({
      recordCount: v.players.length + v.picks.length,
      detail: { players: v.players.length, picks: v.picks.length },
    })),
    check("dynastyprocess-ids", fetchDynastyProcessIds, (v) => ({ recordCount: v.length })),
    check("sleeper-players", fetchSleeperPlayers, (v) => ({ recordCount: v.length })),
  ]);

  return Response.json({
    checkedAt: new Date().toISOString(),
    settings,
    sources: [
      fantasycalc,
      dynastyprocess,
      ktcEnabled
        ? { id: "ktc", status: "error", error: "KTC adapter not implemented yet (milestone 5)" }
        : { id: "ktc", status: "disabled" },
    ],
    support: [dpIds, sleeperPlayers],
  });
}
