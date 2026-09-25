import { fmtValue } from "@/lib/format";
import { pickLabel } from "@/lib/picks";
import type { ValuedAsset } from "@/lib/trade";

function Badge({ tone, children, title }: { tone: "warn" | "muted"; children: string; title?: string }) {
  const cls =
    tone === "warn"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  return (
    <span title={title} className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {children}
    </span>
  );
}

export function AssetChip({ asset, detail, onRemove }: { asset: ValuedAsset; detail?: string; onRemove: () => void }) {
  const meta = asset.kind === "pick" ? detail ?? "Draft pick" : [asset.position, asset.team].filter(Boolean).join(" · ");
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
        asset.value === null ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{asset.name}</div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
          {meta && <span>{meta}</span>}
          {asset.singleSource && <Badge tone="muted" title="Only one enabled source values this asset">1 source</Badge>}
          {asset.valuedAs && (
            <Badge tone="muted" title={`No source prices this exact slot; valued as ${pickLabel(asset.valuedAs)}`}>
              {`as ${pickLabel(asset.valuedAs).replace(/^\d{4} /, "")}`}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {asset.value === null ? (
          <Badge tone="warn" title="Not in any enabled source — excluded from totals">no value</Badge>
        ) : (
          <span className="text-sm tabular-nums">{fmtValue(asset.value)}</span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${asset.name}`}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          ✕
        </button>
      </div>
    </li>
  );
}
