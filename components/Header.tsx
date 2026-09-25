import { settingsSummary, timeAgo } from "@/lib/format";
import type { LeagueSettings } from "@/lib/types";
import type { Health, HealthSource, HealthStatus } from "./types";

const DOT: Record<HealthStatus | "loading", string> = {
  ok: "bg-emerald-500",
  stale: "bg-amber-500",
  error: "bg-red-500",
  unsupported: "bg-zinc-400",
  disabled: "bg-zinc-300 dark:bg-zinc-600",
  loading: "bg-zinc-300 animate-pulse",
};

function pillTitle(s: HealthSource): string {
  const lines = [`${s.name}: ${s.status}`];
  if (s.recordCount != null) lines.push(`${s.recordCount} records (${s.players ?? 0} players, ${s.picks ?? 0} picks)`);
  if (s.matchRate != null) lines.push(`Sleeper match rate ${(s.matchRate * 100).toFixed(1)}%`);
  if (s.fetchedAt) lines.push(`Fetched ${timeAgo(s.fetchedAt)}`);
  if (s.status === "unsupported") lines.push("Not available for these settings");
  if (s.error) lines.push(`Error: ${s.error}`);
  return lines.join("\n");
}

function Pill({ status, label, detail, title }: { status: HealthStatus | "loading"; label: string; detail?: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
    >
      <span className={`h-2 w-2 rounded-full ${DOT[status]}`} aria-hidden />
      {label}
      {detail && <span className="text-zinc-400">{detail}</span>}
      <span className="sr-only">({status})</span>
    </span>
  );
}

export function Header({ health, settings }: { health: Health | null; settings: LeagueSettings }) {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Trade Analyzer</h1>
          <p className="text-xs text-zinc-500">{settingsSummary(settings)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Data source status">
          {health ? (
            <>
              {health.sources.map((s) => (
                <Pill
                  key={s.id}
                  status={s.status}
                  label={s.name}
                  detail={
                    s.status === "disabled" ? "off" : s.status === "unsupported" ? "n/a" : s.matchRate != null ? `${(Math.floor(s.matchRate * 1000) / 10).toString()}%` : undefined
                  }
                  title={pillTitle(s)}
                />
              ))}
              <Pill
                status={health.sleeperPlayers.status === "ok" ? "ok" : health.sleeperPlayers.status === "stale" ? "stale" : "error"}
                label="Sleeper"
                title={`Sleeper player DB: ${health.sleeperPlayers.recordCount ?? 0} players, fetched ${timeAgo(health.sleeperPlayers.fetchedAt)}${health.sleeperPlayers.error ? `\nError: ${health.sleeperPlayers.error}` : ""}`}
              />
            </>
          ) : (
            <Pill status="loading" label="Checking sources…" title="Checking data sources" />
          )}
        </div>
      </div>
    </header>
  );
}
