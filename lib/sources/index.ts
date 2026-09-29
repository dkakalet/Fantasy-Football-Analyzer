import type { SourceAdapter, SourceId } from "../types";
import { createDynastyDealerSource } from "./dynastydealer";
import { createDynastyProcessSource } from "./dynastyprocess";
import { createFantasyCalcSource } from "./fantasycalc";
import { createKtcSource } from "./ktc";
import { createRosterAuditSource } from "./rosteraudit";

/** Reference-scale priority: the first healthy source here is the scale everything else is normalized to. */
export const SOURCE_ORDER: readonly SourceId[] = ["fantasycalc", "dynastyprocess", "dynastydealer", "rosteraudit", "ktc"];

const FACTORIES: Record<SourceId, () => SourceAdapter> = {
  fantasycalc: createFantasyCalcSource,
  dynastyprocess: createDynastyProcessSource,
  dynastydealer: createDynastyDealerSource,
  rosteraudit: createRosterAuditSource,
  ktc: createKtcSource,
};

export const SOURCE_NAMES: Record<SourceId, string> = {
  fantasycalc: "FantasyCalc",
  dynastyprocess: "DynastyProcess",
  dynastydealer: "Dynasty Dealer",
  rosteraudit: "RosterAudit",
  ktc: "KeepTradeCut",
};

/** KeepTradeCut is scraped (no official API), so it is off unless ENABLE_KTC=true. */
export function ktcEnabled(): boolean {
  return process.env.ENABLE_KTC === "true";
}

/** DISABLE_SOURCES=rosteraudit,dynastydealer turns off sources that are on by default. */
function disabledByEnv(): Set<string> {
  return new Set((process.env.DISABLE_SOURCES ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function sourceEnabled(id: SourceId): boolean {
  if (disabledByEnv().has(id)) return false;
  return id === "ktc" ? ktcEnabled() : true;
}

export function enabledSources(): SourceAdapter[] {
  return SOURCE_ORDER.filter(sourceEnabled).map((id) => FACTORIES[id]());
}

export function disabledSourceIds(): SourceId[] {
  return SOURCE_ORDER.filter((id) => !sourceEnabled(id));
}
