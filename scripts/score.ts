// Quick trade check from the command line, using live (cached) source data.
//
//   npm run score -- "Player A" "Player B" vs "Player C"
//   npm run score -- "Bijan Robinson" vs "Puka Nacua" "2027 1st" --qb 2 --alpha 1.5
//
// Left of "vs" is what Team A gives; right is what Team B gives. Picks can be
// keys (2027-R1-EARLY, 2027-1.04) or labels ("2027 1st", "2027 Early 1st").
// Options: --format dynasty|redraft --qb 1|2 --ppr 0|0.5|1 --teams 8|10|12|14
//          --tep none|te+|te++ --alpha 1.0-2.0

import { parsePickInput } from "../lib/picks";
import { ALPHA_RANGE, DEFAULT_ALPHA, verdictLabel, type MethodResult } from "../lib/scoring";
import { searchPlayers } from "../lib/search";
import { parseSettings } from "../lib/settings";
import { fetchSleeperPlayers } from "../lib/sleeper/players";
import { evaluateTrade, type AssetRef, type ValuedAsset } from "../lib/trade";
import { getValuation, type Valuation } from "../lib/valuation";

const OPTIONS = { format: "format", qb: "qb", ppr: "ppr", teams: "teams", tep: "tep", alpha: "alpha" } as const;

function parseArgs(argv: string[]) {
  const params = new URLSearchParams();
  const sides: string[][] = [[], []];
  let side = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const opt = a.startsWith("--") ? OPTIONS[a.slice(2) as keyof typeof OPTIONS] : undefined;
    if (opt) params.set(opt, argv[++i] ?? "");
    else if (a.toLowerCase() === "vs") side = 1;
    else sides[side].push(a);
  }
  return { params, sides };
}

const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

function describeAsset(a: ValuedAsset, v: Valuation): string[] {
  const head = `  ${a.name}${a.position ? ` (${a.position}${a.team ? ` ${a.team}` : ""})` : ""}`;
  if (a.value === null) return [`${head}: NO VALUE — not in any enabled source; excluded from totals`];
  const lines = [`${head}: consensus ${fmt(a.value)}${a.singleSource ? "  [single source]" : ""}${a.valuedAs ? `  [valued as ${a.valuedAs}]` : ""}`];
  for (const s of a.sources) {
    const factor = v.sources.find((m) => m.id === s.source)?.factor ?? 1;
    const via = s.viaKey && s.viaKey !== a.id ? ` via ${s.viaKey}` : "";
    const flags = s.flags.length ? `  [approx: ${s.flags.join(", ")}]` : "";
    lines.push(`      ${s.source.padEnd(15)} "${s.sourceName}"${via}: ${fmt(s.raw)} × ${fmt(factor, 3)} = ${fmt(s.normalized)}${flags}`);
  }
  return lines;
}

function describeMethod(label: string, m: MethodResult, gapUnit: string): string[] {
  const out = [
    `${label}`,
    `  Team A receives ${fmt(m.A)} -> score ${fmt(m.scoreA, 1)}`,
    `  Team B receives ${fmt(m.B)} -> score ${fmt(m.scoreB, 1)}`,
    `  Verdict: ${verdictLabel(m.verdict)}`,
  ];
  if (m.payer) out.push(`  Team ${m.payer} would need to add ~${fmt(m.gapAssetValue)} value to even this out${gapUnit}.`);
  return out;
}

async function resolve(tokens: string[], players: Awaited<ReturnType<typeof fetchSleeperPlayers>>["value"], v: Valuation): Promise<AssetRef[]> {
  const values = new Map(v.assets.map((a) => [a.id, a.value]));
  const searchable = players.map((p) => ({ ...p, value: values.get(p.id) ?? null }));
  return tokens.map((t) => {
    const pick = parsePickInput(t);
    if (pick) return { id: pick };
    const [hit, ...rest] = searchPlayers(t, searchable, 5);
    if (!hit) throw new Error(`No player matches "${t}".`);
    if (rest.length && rest[0].value != null && hit.value == null)
      console.warn(`note: "${t}" matched ${hit.name}; also matches ${rest.map((r) => r.name).join(", ")}`);
    return { id: hit.id, name: hit.name };
  });
}

async function main() {
  const { params, sides } = parseArgs(process.argv.slice(2));
  if (!sides[0].length || !sides[1].length) {
    console.error('Usage: npm run score -- "Player A" "Player B" vs "Player C" [--qb 2 --ppr 1 --teams 10 --format redraft --tep te+ --alpha 1.5]');
    process.exit(1);
  }
  const settings = parseSettings(params);
  const alpha = Math.min(ALPHA_RANGE.max, Math.max(ALPHA_RANGE.min, Number(params.get("alpha") ?? DEFAULT_ALPHA) || DEFAULT_ALPHA));
  const [valuation, sleeper] = await Promise.all([getValuation(settings), fetchSleeperPlayers()]);
  if (valuation.vRef === null) throw new Error("No values available from any source.");

  const [aRefs, bRefs] = [await resolve(sides[0], sleeper.value, valuation), await resolve(sides[1], sleeper.value, valuation)];
  const t = evaluateTrade({
    aGives: aRefs,
    bGives: bRefs,
    assets: new Map(valuation.assets.map((a) => [a.id, a])),
    teams: settings.numTeams,
    vRef: valuation.vRef,
    alpha,
  });

  const s = settings;
  const lines = [
    `Settings: ${s.format}, ${s.numQbs === 2 ? "Superflex" : "1QB"}, ${s.ppr} PPR, ${s.numTeams} teams, TE premium ${s.tep}`,
    ...valuation.sources.map(
      (m) => `  ${m.name}: ${m.status}${m.isReference ? " (reference scale)" : m.factor ? `, factor ${fmt(m.factor, 3)} over top ${m.factorPlayers} shared players` : ""}${m.approximated.length ? `, approx: ${m.approximated.join(", ")}` : ""}`,
    ),
    ...valuation.warnings.map((w) => `  warning: ${w}`),
    "",
    "Team A gives:",
    ...t.aGives.flatMap((a) => describeAsset(a, valuation)),
    "Team B gives:",
    ...t.bGives.flatMap((a) => describeAsset(a, valuation)),
    "",
    ...describeMethod("Raw sum", t.analysis.raw, ""),
    "",
    ...describeMethod(
      `Consolidation-adjusted (heuristic): adj(v) = V_ref × (v / V_ref)^α, α = ${alpha}, V_ref = ${fmt(valuation.vRef)} (${valuation.assets[0].name})`,
      t.analysis.adjusted,
      " (one asset of that consensus value)",
    ),
  ];
  if (t.analysis.missing.A || t.analysis.missing.B) lines.push("", "WARNING: some assets have no value and are excluded from totals.");
  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
