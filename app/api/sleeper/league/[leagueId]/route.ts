import type { NextRequest } from "next/server";
import { sleeper } from "@/lib/sleeper/client";
import { buildTeams, mapLeagueSettings } from "@/lib/sleeper/league";
import { buildPickInventory } from "@/lib/sleeper/picks";
import { fetchSleeperPlayers } from "@/lib/sleeper/players";

export const dynamic = "force-dynamic";

/** League settings (mapped), teams with rosters, and each team's future pick inventory. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/sleeper/league/[leagueId]">) {
  const { leagueId } = await ctx.params;
  if (!/^\d{1,25}$/.test(leagueId)) return Response.json({ error: "Invalid league ID." }, { status: 400 });
  try {
    const [league, rosters, users, traded, drafts, players] = await Promise.all([
      sleeper.league(leagueId),
      sleeper.rosters(leagueId),
      sleeper.users(leagueId),
      sleeper.tradedPicks(leagueId),
      sleeper.drafts(leagueId),
      fetchSleeperPlayers().catch(() => null),
    ]);
    if (!league.value) return Response.json({ error: "League not found." }, { status: 404 });

    const mapped = mapLeagueSettings(league.value);
    const teams = buildTeams(rosters.value, users.value);
    const inventory = buildPickInventory({
      league: league.value,
      rosterIds: teams.map((t) => t.rosterId),
      tradedPicks: traded.value,
      drafts: drafts.value,
    });
    // Names for rostered QB/RB/WR/TE (the typeahead index only has active players).
    const rostered = new Set(teams.flatMap((t) => t.players));
    const directory = (players?.value ?? []).filter((p) => rostered.has(p.id)).map(({ id, name, pos, team }) => ({ id, name, pos, team }));

    return Response.json({
      league: {
        id: league.value.league_id,
        name: league.value.name,
        season: league.value.season,
        status: league.value.status,
        totalRosters: league.value.total_rosters,
      },
      settings: mapped.settings,
      notes: mapped.notes,
      source: mapped.source,
      teams: teams.map((t) => ({ ...t, picks: inventory.picks.filter((p) => p.ownerRosterId === t.rosterId) })),
      pickSeasons: inventory.seasons,
      rounds: inventory.rounds,
      players: directory,
      fetchedAt: new Date(Math.min(league.fetchedAt, rosters.fetchedAt, traded.fetchedAt)).toISOString(),
    });
  } catch (e) {
    return Response.json({ error: `Sleeper request failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
