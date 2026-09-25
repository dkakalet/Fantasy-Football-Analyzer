// Draft pick keys and the per-source label parsers.
//
// Canonical keys (used for trade assets):
//   {season}-R{round}-{EARLY|MID|LATE}   e.g. 2027-R1-MID
//   {season}-{round}.{slot}              e.g. 2027-1.04 (exact slot known)
// Source-only key (a source value that doesn't distinguish tiers):
//   {season}-R{round}                    e.g. 2028-R1

export type Tier = "EARLY" | "MID" | "LATE";
export const TIERS: readonly Tier[] = ["EARLY", "MID", "LATE"];

export interface ParsedPick {
  season: number;
  round: number;
  tier: Tier | null;
  slot: number | null;
}

export const tierKey = (season: number, round: number, tier: Tier) => `${season}-R${round}-${tier}`;
export const slotKey = (season: number, round: number, slot: number) =>
  `${season}-${round}.${String(slot).padStart(2, "0")}`;
export const roundKey = (season: number, round: number) => `${season}-R${round}`;

const TIER_RE = /^(\d{4})-R(\d+)-(EARLY|MID|LATE)$/;
const SLOT_RE = /^(\d{4})-(\d+)\.(\d+)$/;
const ROUND_RE = /^(\d{4})-R(\d+)$/;

export function parsePickKey(key: string): ParsedPick | null {
  let m = TIER_RE.exec(key);
  if (m) return { season: +m[1], round: +m[2], tier: m[3] as Tier, slot: null };
  m = SLOT_RE.exec(key);
  if (m) return { season: +m[1], round: +m[2], tier: null, slot: +m[3] };
  m = ROUND_RE.exec(key);
  if (m) return { season: +m[1], round: +m[2], tier: null, slot: null };
  return null;
}

export const isPickKey = (key: string) => parsePickKey(key) !== null;

/**
 * Tier for an exact slot, scaled to team count: the first round(teams/3) slots
 * are EARLY, the last round(teams/3) are LATE, the rest MID.
 * 12 teams: 1-4 / 5-8 / 9-12. 10 teams: 1-3 / 4-7 / 8-10. 14 teams: 1-5 / 6-9 / 10-14.
 */
export function slotToTier(slot: number, teams: number): Tier {
  const t = Math.round(teams / 3);
  if (slot <= t) return "EARLY";
  if (slot > teams - t) return "LATE";
  return "MID";
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

const TIER_LABEL: Record<Tier, string> = { EARLY: "Early", MID: "Mid", LATE: "Late" };

export function pickLabel(key: string): string {
  const p = parsePickKey(key);
  if (!p) return key;
  if (p.slot !== null) return `${p.season} Pick ${p.round}.${String(p.slot).padStart(2, "0")}`;
  if (p.tier) return `${p.season} ${ordinal(p.round)} (${TIER_LABEL[p.tier]})`;
  return `${p.season} ${ordinal(p.round)}`;
}

/** How a source value was found for a requested pick key. */
export type PickVia = "exact" | "tier" | "round";

/**
 * Find a source's value for a canonical pick key: exact key first, then (for a
 * slot) the tier containing that slot, then the source's round-level value.
 */
export function resolvePick<T>(
  lookup: (key: string) => T | undefined,
  key: string,
  teams: number,
): { value: T; key: string; via: PickVia } | null {
  const p = parsePickKey(key);
  if (!p) return null;
  const exact = lookup(key);
  if (exact !== undefined) return { value: exact, key, via: "exact" };
  if (p.slot !== null) {
    const tk = tierKey(p.season, p.round, slotToTier(p.slot, teams));
    const tier = lookup(tk);
    if (tier !== undefined) return { value: tier, key: tk, via: "tier" };
  }
  const rk = roundKey(p.season, p.round);
  const round = lookup(rk);
  if (round !== undefined) return { value: round, key: rk, via: "round" };
  return null;
}

// ------------------------------------------------------------ source labels

const ORD = "(\\d+)(?:st|nd|rd|th)";

/**
 * FantasyCalc pick names (fixtures/fantasycalc): "2027 1st (Early)", "2027 1st".
 */
export function parseFantasyCalcPick(name: string): string | null {
  const m = new RegExp(`^(\\d{4}) ${ORD}(?: \\((Early|Mid|Late)\\))?$`).exec(name.trim());
  if (!m) return null;
  const [, season, round, tier] = m;
  return tier ? tierKey(+season, +round, tier.toUpperCase() as Tier) : roundKey(+season, +round);
}

/**
 * DynastyProcess pick names (fixtures/dynastyprocess/values.picks-only.csv):
 * "2026 Pick 1.01", "2027 Early 1st", "2027 1st".
 */
export function parseDynastyProcessPick(name: string): string | null {
  const s = name.trim();
  let m = /^(\d{4}) Pick (\d+)\.(\d+)$/.exec(s);
  if (m) return slotKey(+m[1], +m[2], +m[3]);
  m = new RegExp(`^(\\d{4}) (Early|Mid|Late) ${ORD}$`).exec(s);
  if (m) return tierKey(+m[1], +m[3], m[2].toUpperCase() as Tier);
  m = new RegExp(`^(\\d{4}) ${ORD}$`).exec(s);
  if (m) return roundKey(+m[1], +m[2]);
  return null;
}

/**
 * Free-text pick input (CLI, tests): a canonical key, or a label like
 * "2027 1st", "2027 Early 1st", "2027 1st (Early)", "2027 Pick 1.04".
 * A pick with no tier defaults to MID. Returns a canonical key or null.
 */
export function parsePickInput(text: string): string | null {
  const t = text.trim();
  const direct = parsePickKey(t.toUpperCase());
  const key = direct ? t.toUpperCase() : (parseFantasyCalcPick(t) ?? parseDynastyProcessPick(t));
  const p = key ? parsePickKey(key) : null;
  if (!p) return null;
  if (p.slot !== null) return slotKey(p.season, p.round, p.slot);
  return tierKey(p.season, p.round, p.tier ?? "MID");
}
