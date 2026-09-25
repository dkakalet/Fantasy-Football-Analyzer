import type { NextRequest } from "next/server";
import { sleeper } from "@/lib/sleeper/client";
import { isSuperflex, LEAGUE_TYPE } from "@/lib/sleeper/league";

export const dynamic = "force-dynamic";

/** Sleeper username -> current season (NFL state) -> that user's NFL leagues. */
export async function GET(request: NextRequest) {
  const username = (request.nextUrl.searchParams.get("username") ?? "").trim();
  if (!/^[A-Za-z0-9_]{1,40}$/.test(username)) {
    return Response.json({ error: "Enter a Sleeper username (letters, numbers, underscores)." }, { status: 400 });
  }
  try {
    const state = (await sleeper.state()).value;
    const season = state.league_season || state.season;
    const user = (await sleeper.user(username)).value;
    if (!user) return Response.json({ error: `No Sleeper user named "${username}".` }, { status: 404 });
    const leagues = (await sleeper.leagues(user.user_id, season)).value ?? [];
    return Response.json({
      user: { id: user.user_id, displayName: user.display_name },
      season,
      leagues: leagues.map((l) => ({
        id: l.league_id,
        name: l.name,
        season: l.season,
        status: l.status,
        totalRosters: l.total_rosters,
        type: LEAGUE_TYPE[l.settings.type ?? -1] ?? "unknown",
        superflex: isSuperflex(l.roster_positions ?? []),
      })),
    });
  } catch (e) {
    return Response.json({ error: `Sleeper request failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
