"use client";

import { fmtValue } from "@/lib/format";
import { ALPHA_RANGE, DEFAULT_ALPHA, VERDICT_BANDS, verdictLabel, type MethodResult, type Side } from "@/lib/scoring";
import type { TradeEvaluation, ValuedAsset } from "@/lib/trade";
import type { Valuation } from "@/lib/valuation";

const SWATCH: Record<Side, string> = { A: "bg-team-a", B: "bg-team-b" };

function ScoreBar({ m, names }: { m: MethodResult; names: Record<Side, string> }) {
  const a = Math.max(0, Math.min(100, m.scoreA));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${SWATCH.A}`} aria-hidden />
          {names.A} <strong className="tabular-nums">{fmtValue(m.scoreA, 1)}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <strong className="tabular-nums">{fmtValue(m.scoreB, 1)}</strong> {names.B}
          <span className={`h-2.5 w-2.5 rounded-sm ${SWATCH.B}`} aria-hidden />
        </span>
      </div>
      <div className="relative flex h-3 gap-[2px]" role="img" aria-label={`${names.A} ${fmtValue(m.scoreA, 1)}, ${names.B} ${fmtValue(m.scoreB, 1)}`}>
        {a > 0 && <div className={`${SWATCH.A} rounded-l-[4px] ${a >= 100 ? "rounded-r-[4px]" : ""}`} style={{ width: `${a}%` }} title={`${names.A}: ${fmtValue(m.scoreA, 1)}`} />}
        {a < 100 && <div className={`${SWATCH.B} flex-1 rounded-r-[4px] ${a <= 0 ? "rounded-l-[4px]" : ""}`} title={`${names.B}: ${fmtValue(m.scoreB, 1)}`} />}
        <div className="absolute -top-1 left-1/2 h-5 w-px bg-zinc-500/70" aria-hidden title="Even (50/50)" />
      </div>
    </div>
  );
}

function MethodPanel({
  title,
  subtitle,
  m,
  names,
  gapNote,
  children,
}: {
  title: string;
  subtitle: string;
  m: MethodResult;
  names: Record<Side, string>;
  gapNote?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>
      <ScoreBar m={m} names={names} />
      <dl className="grid grid-cols-2 gap-x-3 text-xs text-zinc-500">
        <dt>{names.A} receives</dt>
        <dd className="text-right tabular-nums">{fmtValue(m.A)}</dd>
        <dt>{names.B} receives</dt>
        <dd className="text-right tabular-nums">{fmtValue(m.B)}</dd>
      </dl>
      <p className="text-base font-semibold">{verdictLabel(m.verdict, names)}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {m.payer
          ? `${names[m.payer]} would need to add ~${fmtValue(m.gapAssetValue)} value${gapNote ?? ""} to even this out.`
          : "Dead even."}
      </p>
      {children}
    </div>
  );
}

function SourceCell({ asset, source }: { asset: ValuedAsset; source: string }) {
  const s = asset.sources.find((x) => x.source === source);
  if (!s) return <td className="px-2 py-1.5 text-zinc-400">—</td>;
  return (
    <td className="px-2 py-1.5 align-top">
      <div className="tabular-nums">
        {fmtValue(s.raw)} <span className="text-zinc-400">→</span> {fmtValue(s.normalized)}
      </div>
      <div className="text-[10px] text-zinc-500" title={`Source name: ${s.sourceName}`}>
        {s.viaKey && s.viaKey !== asset.id && s.viaKey !== asset.valuedAs ? `${s.sourceName} · ` : ""}
        {s.flags.length ? `approx: ${s.flags.join(", ")}` : "exact"}
      </div>
    </td>
  );
}

function BreakdownTable({ evaluation, valuation, names }: { evaluation: TradeEvaluation; valuation: Valuation; names: Record<Side, string> }) {
  const sources = valuation.sources.filter((s) => s.status === "ok" || s.status === "stale");
  const rows: [string, ValuedAsset][] = [
    ...evaluation.aGives.map((a): [string, ValuedAsset] => [`${names.A} gives`, a]),
    ...evaluation.bGives.map((a): [string, ValuedAsset] => [`${names.B} gives`, a]),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="text-zinc-500">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="px-2 py-1.5 font-medium">Asset</th>
            {sources.map((s) => (
              <th key={s.id} className="px-2 py-1.5 font-medium">
                {s.name}
                <div className="font-normal">raw → ×{fmtValue(s.factor, 3)}{s.isReference ? " (reference)" : ""}</div>
              </th>
            ))}
            <th className="px-2 py-1.5 font-medium">Consensus</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([side, a], i) => (
            <tr key={`${a.id}#${i}`} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="px-2 py-1.5 align-top">
                <div className="font-medium">{a.name}</div>
                <div className="text-[10px] text-zinc-500">{side}</div>
              </td>
              {sources.map((s) => (
                <SourceCell key={s.id} asset={a} source={s.id} />
              ))}
              <td className="px-2 py-1.5 align-top tabular-nums">
                {a.value === null ? (
                  <span className="text-amber-600">no value</span>
                ) : (
                  <>
                    {fmtValue(a.value)}
                    <div className="text-[10px] text-zinc-500">
                      {a.singleSource ? "single source" : `median of ${a.sources.length}`}
                      {a.valuedAs ? ` · valued as ${a.valuedAs}` : ""}
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultsCard({
  evaluation,
  valuation,
  names,
  alpha,
  onAlphaChange,
  stale,
}: {
  evaluation: TradeEvaluation;
  valuation: Valuation;
  names: Record<Side, string>;
  alpha: number;
  onAlphaChange: (a: number) => void;
  /** The trade was edited after the last Analyze. */
  stale: boolean;
}) {
  const { raw, adjusted, missing } = evaluation.analysis;
  const vRefName = valuation.assets.find((a) => a.id === valuation.vRefAsset)?.name ?? valuation.vRefAsset;
  const reference = valuation.sources.find((s) => s.isReference);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Results</h2>
        {stale && <span className="text-xs text-amber-600">Trade edited — press Analyze to update</span>}
      </div>

      {(missing.A > 0 || missing.B > 0) && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠ {missing.A + missing.B} asset{missing.A + missing.B === 1 ? " has" : "s have"} no value in any enabled source and{" "}
          {missing.A + missing.B === 1 ? "is" : "are"} excluded from the totals below.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <MethodPanel title="Raw sum" subtitle="Sum of consensus values each team receives" m={raw} names={names} />
        <MethodPanel
          title="Consolidation-adjusted"
          subtitle="Heuristic: stars count for more than the sum of depth pieces"
          m={adjusted}
          names={names}
          gapNote=" (one asset of that consensus value)"
        >
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            <span className="flex justify-between">
              <span>α = {alpha.toFixed(2)} {alpha === 1 ? "(same as raw sum)" : ""}</span>
              {alpha !== DEFAULT_ALPHA && (
                <button type="button" className="underline" onClick={() => onAlphaChange(DEFAULT_ALPHA)}>
                  reset to {DEFAULT_ALPHA}
                </button>
              )}
            </span>
            <input
              type="range"
              min={ALPHA_RANGE.min}
              max={ALPHA_RANGE.max}
              step={ALPHA_RANGE.step}
              value={alpha}
              onChange={(e) => onAlphaChange(Number(e.target.value))}
              aria-label="Consolidation exponent alpha"
            />
          </label>
        </MethodPanel>
      </div>

      <details className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium">Per-source breakdown</summary>
        <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
          <BreakdownTable evaluation={evaluation} valuation={valuation} names={names} />
        </div>
      </details>

      <details className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium">How these numbers are computed</summary>
        <ul className="flex list-disc flex-col gap-1.5 border-t border-zinc-200 py-3 pr-4 pl-8 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <li>
            Scale: {reference?.name ?? "the first available source"} is the reference. Each other source is multiplied by Σ reference ÷ Σ source over
            the top {valuation.topN} players both list
            {valuation.sources
              .filter((s) => !s.isReference && s.factor)
              .map((s) => ` (${s.name}: ×${fmtValue(s.factor, 3)} from ${s.factorPlayers} players)`)
              .join("")}
            .
          </li>
          <li>Consensus value = median of the normalized values from the enabled sources that list the asset (two sources: their mean).</li>
          <li>
            Picks use a source&apos;s exact slot if it has one, otherwise its tier (slots scaled to {valuation.settings.numTeams} teams), otherwise its
            round-level value. Flags in the breakdown show which.
          </li>
          <li>
            Adjusted value: adj(v) = V_ref × (v ÷ V_ref)^α, with V_ref = {fmtValue(valuation.vRef)} ({vRefName}, the #1 asset under these settings) and α ={" "}
            {alpha.toFixed(2)}. This is this app&apos;s own transparent heuristic, not any site&apos;s formula.
          </li>
          <li>
            Score = 100 × A ÷ (A + B). Fair within ±{VERDICT_BANDS.fair} of 50; a slight edge within ±{VERDICT_BANDS.slight}; beyond that it favors one
            side.
          </li>
          <li>Assets no enabled source values show as &ldquo;no value&rdquo; and are left out of totals, never counted as 0.</li>
        </ul>
      </details>
    </section>
  );
}
