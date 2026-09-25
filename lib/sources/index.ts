import type { SourceAdapter, SourceId } from "../types";
import { createDynastyProcessSource } from "./dynastyprocess";
import { createFantasyCalcSource } from "./fantasycalc";

/** Reference-scale priority: the first healthy source here is the scale everything else is normalized to. */
export const SOURCE_ORDER: readonly SourceId[] = ["fantasycalc", "dynastyprocess", "ktc"];

export function ktcEnabled(): boolean {
  return process.env.ENABLE_KTC === "true";
}

/** Sources enabled by configuration. KTC is added in milestone 5 behind ENABLE_KTC. */
export function enabledSources(): SourceAdapter[] {
  return [createFantasyCalcSource(), createDynastyProcessSource()];
}
