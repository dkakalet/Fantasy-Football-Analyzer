import type { HealthSource } from "./types";

const LINKS: Record<string, { label: string; href: string }> = {
  fantasycalc: { label: "FantasyCalc", href: "https://fantasycalc.com" },
  dynastyprocess: { label: "DynastyProcess", href: "https://dynastyprocess.com" },
  ktc: { label: "KeepTradeCut", href: "https://keeptradecut.com" },
};

const DEFAULT_ENABLED = ["fantasycalc", "dynastyprocess"];

/** Credits every enabled value source (FantasyCalc requires a visible link on each page showing its data). */
export function Footer({ sources }: { sources: HealthSource[] | null }) {
  const enabled = sources ? sources.filter((s) => s.status !== "disabled").map((s) => s.id) : DEFAULT_ENABLED;
  const links = enabled.map((id) => LINKS[id]).filter(Boolean);
  return (
    <footer className="mt-auto border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-4 text-xs text-zinc-500">
        <p>
          Trade values from{" "}
          {links.map((l, i) => (
            <span key={l.href}>
              {i > 0 && (i === links.length - 1 ? " and " : ", ")}
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">
                {l.label}
              </a>
            </span>
          ))}
          . Player, league and roster data from{" "}
          <a href="https://sleeper.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">
            Sleeper
          </a>
          .
        </p>
        <p>Values are normalized and combined by this app; the consolidation adjustment is its own heuristic. Not affiliated with any data source.</p>
      </div>
    </footer>
  );
}
