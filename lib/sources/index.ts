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

/**
 * Opt-in sources, off unless their flag is "true":
 * - KeepTradeCut is scraped (no official API): ENABLE_KTC.
 * - RosterAudit's terms forbid services that compete with it (it runs its own trade
 *   calculator), so it stays off for a public deployment: ENABLE_ROSTERAUDIT.
 */
const OPT_IN: Partial<Record<SourceId, string>> = { ktc: "ENABLE_KTC", rosteraudit: "ENABLE_ROSTERAUDIT" };

export function ktcEnabled(): boolean {
  return process.env.ENABLE_KTC === "true";
}

/** DISABLE_SOURCES=dynastydealer,dynastyprocess turns off sources that are on by default. */
function disabledByEnv(): Set<string> {
  return new Set((process.env.DISABLE_SOURCES ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function sourceEnabled(id: SourceId): boolean {
  if (disabledByEnv().has(id)) return false;
  const flag = OPT_IN[id];
  return flag ? process.env[flag] === "true" : true;
}

export function enabledSources(): SourceAdapter[] {
  return SOURCE_ORDER.filter(sourceEnabled).map((id) => FACTORIES[id]());
}

export function disabledSourceIds(): SourceId[] {
  return SOURCE_ORDER.filter((id) => !sourceEnabled(id));
}
