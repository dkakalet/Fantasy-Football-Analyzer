import type { SourceAdapter, SourceId } from "../types";
import { createDynastyProcessSource } from "./dynastyprocess";
import { createFantasyCalcSource } from "./fantasycalc";
import { createKtcSource } from "./ktc";

/** Reference-scale priority: the first healthy source here is the scale everything else is normalized to. */
export const SOURCE_ORDER: readonly SourceId[] = ["fantasycalc", "dynastyprocess", "ktc"];

/** KeepTradeCut is scraped (no official API), so it is off unless ENABLE_KTC=true. */
export function ktcEnabled(): boolean {
  return process.env.ENABLE_KTC === "true";
}

export function enabledSources(): SourceAdapter[] {
  return [createFantasyCalcSource(), createDynastyProcessSource(), ...(ktcEnabled() ? [createKtcSource()] : [])];
}
