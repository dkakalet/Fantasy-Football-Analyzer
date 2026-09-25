import type { NextRequest } from "next/server";
import { parseSettings } from "@/lib/settings";
import { getValuation } from "@/lib/valuation";

export const dynamic = "force-dynamic";

/** Consensus values (players + picks) with the per-source trail, for the given settings. */
export async function GET(request: NextRequest) {
  const valuation = await getValuation(parseSettings(request.nextUrl.searchParams));
  return Response.json(valuation);
}
