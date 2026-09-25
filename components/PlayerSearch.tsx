"use client";

import { useId, useMemo, useState } from "react";
import { fmtValue } from "@/lib/format";
import { searchPlayers, type SearchablePlayer } from "@/lib/search";

export function PlayerSearch({
  players,
  exclude,
  onSelect,
  placeholder = "Search players (name, position, team)",
}: {
  players: readonly SearchablePlayer[];
  exclude: ReadonlySet<string>;
  onSelect: (p: SearchablePlayer) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();

  const results = useMemo(() => searchPlayers(query, players, 20).filter((p) => !exclude.has(p.id)).slice(0, 8), [query, players, exclude]);

  const choose = (p: SearchablePlayer | undefined) => {
    if (!p) return;
    onSelect(p);
    setQuery("");
    setActive(0);
  };

  return (
    <div className="relative">
      <input
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {open && query && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {results.length === 0 && <li className="px-3 py-2 text-zinc-500">No matching players</li>}
          {results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 ${i === active ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
            >
              <span>
                {p.name} <span className="text-xs text-zinc-500">{p.pos}{p.team ? ` · ${p.team}` : ""}</span>
              </span>
              <span className={`text-xs tabular-nums ${p.value == null ? "text-amber-600" : "text-zinc-500"}`}>
                {p.value == null ? "no value" : fmtValue(p.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
