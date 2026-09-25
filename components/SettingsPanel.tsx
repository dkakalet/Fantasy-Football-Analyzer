import type { ReactNode } from "react";
import { settingsSummary, TEP_LABEL } from "@/lib/format";
import { ALLOWED_PPR, ALLOWED_TEAMS, TEP_VALUES } from "@/lib/settings";
import type { LeagueSettings } from "@/lib/types";
import type { SourceMeta } from "@/lib/valuation";

const APPROX_LABEL: Record<string, string> = { ppr: "PPR", teams: "team count", tep: "TE premium" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
      {label}
      {children}
    </label>
  );
}

const selectClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function SettingsPanel({
  settings,
  onChange,
  sources,
  notes,
  children,
}: {
  settings: LeagueSettings;
  onChange: (s: LeagueSettings) => void;
  sources: SourceMeta[];
  /** Notes about imported league settings (e.g. "16 teams → using 14"). */
  notes?: string[];
  /** The Sleeper import box. */
  children?: ReactNode;
}) {
  const set = <K extends keyof LeagueSettings>(key: K, value: LeagueSettings[K]) => onChange({ ...settings, [key]: value });

  return (
    <details className="group rounded-lg border border-zinc-200 dark:border-zinc-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm">
        <span className="font-medium">League settings</span>
        <span className="truncate text-xs text-zinc-500">
          {settingsSummary(settings)} <span className="inline-block transition group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Format">
            <select className={selectClass} value={settings.format} onChange={(e) => set("format", e.target.value as LeagueSettings["format"])}>
              <option value="dynasty">Dynasty</option>
              <option value="redraft">Redraft</option>
            </select>
          </Field>
          <Field label="QB">
            <select className={selectClass} value={settings.numQbs} onChange={(e) => set("numQbs", Number(e.target.value) as LeagueSettings["numQbs"])}>
              <option value={1}>1QB</option>
              <option value={2}>Superflex</option>
            </select>
          </Field>
          <Field label="PPR">
            <select className={selectClass} value={settings.ppr} onChange={(e) => set("ppr", Number(e.target.value) as LeagueSettings["ppr"])}>
              {ALLOWED_PPR.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Teams">
            <select className={selectClass} value={settings.numTeams} onChange={(e) => set("numTeams", Number(e.target.value) as LeagueSettings["numTeams"])}>
              {ALLOWED_TEAMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="TE premium">
            <select className={selectClass} value={settings.tep} onChange={(e) => set("tep", e.target.value as LeagueSettings["tep"])}>
              {TEP_VALUES.map((t) => (
                <option key={t} value={t}>
                  {TEP_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {(notes?.length || sources.some((s) => s.approximated.length || !s.supported)) && (
          <ul className="flex flex-col gap-1 text-xs text-zinc-500">
            {notes?.map((n) => <li key={n}>{n}</li>)}
            {sources.map((s) =>
              !s.supported ? (
                <li key={s.id}>{s.name}: not available for {settings.format} (dynasty only) — excluded.</li>
              ) : s.approximated.length ? (
                <li key={s.id}>
                  {s.name}: approx. for {s.approximated.map((a) => APPROX_LABEL[a] ?? a).join(", ")} (uses its closest supported setting).
                </li>
              ) : null,
            )}
          </ul>
        )}

        {children}
      </div>
    </details>
  );
}
