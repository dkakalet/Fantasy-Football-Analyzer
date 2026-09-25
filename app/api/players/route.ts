import { fetchSleeperPlayers } from "@/lib/sleeper/players";

export const dynamic = "force-dynamic";

/** Active QB/RB/WR/TE from the Sleeper player DB (cached 24h), for the typeahead. */
export async function GET() {
  try {
    const res = await fetchSleeperPlayers();
    return Response.json({
      fetchedAt: new Date(res.fetchedAt).toISOString(),
      players: res.value.filter((p) => p.active).map(({ id, name, pos, team }) => ({ id, name, pos, team })),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), players: [] }, { status: 502 });
  }
}
