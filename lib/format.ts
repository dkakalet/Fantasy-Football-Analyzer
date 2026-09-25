import type { LeagueSettings } from "./types";

export const fmtValue = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const TEP_LABEL: Record<LeagueSettings["tep"], string> = { none: "No TE premium", "te+": "TE+", "te++": "TE++" };

export function settingsSummary(s: LeagueSettings): string {
  return [
    s.format === "dynasty" ? "Dynasty" : "Redraft",
    s.numQbs === 2 ? "Superflex" : "1QB",
    `${s.ppr} PPR`,
    `${s.numTeams} teams`,
    ...(s.tep !== "none" ? [TEP_LABEL[s.tep]] : []),
  ].join(" · ");
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
}
