"use client";

import { useState } from "react";
import { ordinal, tierKey, TIERS, type Tier } from "@/lib/picks";

const TIER_LABEL: Record<Tier, string> = { EARLY: "Early", MID: "Mid", LATE: "Late" };
const selectClass = "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

/** Manual pick entry: season, round, tier. Tier defaults to Mid when unknown. */
export function AddPick({ seasons, rounds, onAdd }: { seasons: number[]; rounds: number; onAdd: (key: string) => void }) {
  const [season, setSeason] = useState<number | null>(null);
  const [round, setRound] = useState(1);
  const [tier, setTier] = useState<Tier>("MID");
  const selectedSeason = season !== null && seasons.includes(season) ? season : seasons[0];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Pick season" className={selectClass} value={selectedSeason} onChange={(e) => setSeason(Number(e.target.value))}>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select aria-label="Pick round" className={selectClass} value={Math.min(round, rounds)} onChange={(e) => setRound(Number(e.target.value))}>
        {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
          <option key={r} value={r}>
            {ordinal(r)}
          </option>
        ))}
      </select>
      <select aria-label="Pick tier" className={selectClass} value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
        {TIERS.map((t) => (
          <option key={t} value={t}>
            {TIER_LABEL[t]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onAdd(tierKey(selectedSeason, Math.min(round, rounds), tier))}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Add pick
      </button>
    </div>
  );
}
