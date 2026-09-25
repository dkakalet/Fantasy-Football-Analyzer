"use client";

import type { ReactNode } from "react";
import { fmtValue } from "@/lib/format";
import type { SearchablePlayer } from "@/lib/search";
import type { AssetRef, ValuedAsset } from "@/lib/trade";
import { AddPick } from "./AddPick";
import { AssetChip } from "./AssetChip";
import { PlayerSearch } from "./PlayerSearch";

export interface TradeItem {
  ref: AssetRef & { detail?: string };
  valued: ValuedAsset;
}

export function TradeColumn({
  title,
  items,
  players,
  exclude,
  pickSeasons,
  pickRounds,
  onAdd,
  onRemove,
  teamControls,
  pickShortcuts,
  searchPlaceholder,
}: {
  title: string;
  items: TradeItem[];
  /** Players this side can search (a team's roster, or everyone). */
  players: readonly SearchablePlayer[];
  /** Players already in the trade on either side. */
  exclude: ReadonlySet<string>;
  pickSeasons: number[];
  pickRounds: number;
  onAdd: (ref: AssetRef & { detail?: string }) => void;
  onRemove: (index: number) => void;
  /** Team selector and roster toggle (Sleeper import). */
  teamControls?: ReactNode;
  /** A team's own pick inventory (Sleeper import). */
  pickShortcuts?: ReactNode;
  searchPlaceholder?: string;
}) {
  const valued = items.filter((i) => i.valued.value !== null);
  const total = valued.reduce((s, i) => s + i.valued.value!, 0);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">{title}</h2>
      {teamControls}
      <PlayerSearch players={players} exclude={exclude} onSelect={(p) => onAdd({ id: p.id, name: p.name, position: p.pos || null, team: p.team })} placeholder={searchPlaceholder} />
      <AddPick seasons={pickSeasons} rounds={pickRounds} onAdd={(key) => onAdd({ id: key })} />
      {pickShortcuts}
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <AssetChip key={`${item.ref.id}#${i}`} asset={item.valued} detail={item.ref.detail} onRemove={() => onRemove(i)} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
          Add players or picks
        </p>
      )}
      <p className="text-xs text-zinc-500">
        {items.length} asset{items.length === 1 ? "" : "s"} · consensus total <span className="tabular-nums">{fmtValue(total)}</span>
        {valued.length < items.length && <span className="text-amber-600"> · {items.length - valued.length} without value (excluded)</span>}
      </p>
    </section>
  );
}
