# Trade Analyzer

Scores fantasy football trades using consensus market values from public sources:
**FantasyCalc** (primary, reference scale) and **DynastyProcess** (dynasty only), with
**KeepTradeCut** as an optional third source that is off by default. You can import a
Sleeper league to fill in the settings, the rosters, and each team's future picks.

Next.js 16 (App Router) + TypeScript + Tailwind. Every third-party call goes through a
server route handler; the browser only talks to this app.

## Setup

Requires Node 20.9+ (developed on Node 22).

```bash
cd trade-analyzer
npm install
npm run dev            # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Vitest unit tests (scoring, normalization, consensus, adapters on fixtures, Sleeper mapping) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` / `npm start` | Production build / server |
| `npm run score -- "Player A" "Player B" vs "Player C"` | CLI trade check on live data (see below) |
| `npm run fixtures` | Re-capture `fixtures/` from the live sources (`-- --only ktc` for KTC) |

### Environment variables

Copy `.env.example` to `.env.local` to change these. Nothing is required.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENABLE_KTC` | `false` | Turns on the KeepTradeCut adapter (scraping; **check KTC's terms first**) |
| `FILE_CACHE` | on | Local JSON cache in `.cache/`. `0` disables it. Always off on Vercel. |

### CLI

```bash
npm run score -- "Ja'Marr Chase" vs "Bijan Robinson" "2027 1st"
npm run score -- "Josh Allen" vs "Jahmyr Gibbs" "2027 Early 1st" --qb 2 --ppr 1 --alpha 1.5
```

Left of `vs` is what Team A gives. Picks can be keys (`2027-R1-EARLY`, `2027-1.04`) or
labels (`2027 1st` defaults to Mid). Options: `--format dynasty|redraft --qb 1|2
--ppr 0|0.5|1 --teams 8|10|12|14 --tep none|te+|te++ --alpha 1.0–2.0`. The output shows
every source's raw value, scale factor, normalized value and flags for each asset.

## How the numbers are made

Every number shown traces to a source value plus the transformations below
(`lib/normalize.ts`, `lib/consensus.ts`, `lib/scoring.ts`, `lib/valuation.ts`). The
per-source breakdown in the UI and the CLI shows each step.

1. **Fetch** each enabled source for the settings (server-side, cached).
2. **Match** players to Sleeper `player_id`s:
   - FantasyCalc: `player.sleeperId`.
   - DynastyProcess: `fp_id` → `db_playerids.csv` → `sleeper_id`, then normalized name + position.
   - KTC: `mflid` → crosswalk `mfl_id` → `sleeper_id`, then name.
3. **Normalize** to FantasyCalc's scale: `factor = Σ ref ÷ Σ source` over the top N = 150
   players (ranked by FantasyCalc value) that both list. Picks use the same factor. If
   FantasyCalc is down, the next source becomes the reference and the UI says so.
4. **Consensus** = median of the normalized values from the sources that list the asset
   (with two sources, that's the mean). One source → that value, flagged *single source*.
   None → **no value**: shown with a warning, left out of totals, never counted as 0.
5. **Score** both ways:
   - **Raw sum:** A and B are the total consensus value each team receives.
   - **Consolidation-adjusted (heuristic):** `adj(v) = V_ref × (v ÷ V_ref)^α`, where V_ref
     is the #1 asset's consensus value and α = 1.35 by default (slider from 1.0 to 2.0;
     1.0 = raw sum).
   - `score_A = 100 × A ÷ (A + B)`.
   - Verdict: within ±2.5 of 50 is "Fair", within ±7.5 is "Slight edge", and beyond that it
     "Favors" one side (constants in `lib/scoring.ts`).
   - Gap: the raw gap is `|A − B|`. The adjusted gap is shown as the consensus value of one
     asset that closes it, `V_ref × (gap ÷ V_ref)^(1/α)`.

### Draft picks

- **Canonical keys:** `{season}-R{round}-{EARLY|MID|LATE}`, or `{season}-{round}.{slot}` when
  the slot is known.
- **Source lookup order** for a pick: the exact slot, then the tier containing that slot, then
  the source's round-level value (flagged). Slot → tier scales with team count: 12 teams split
  1–4 / 5–8 / 9–12, 10 teams 1–3 / 4–7 / 8–10.
- **Seasons** come from the reference source, so stale past-season rows are ignored.
- **Manual entry** is season + round + tier (Mid by default).

### Sleeper import

- **Flow:** username → current season (`/state/nfl`, `league_season`) → the user's leagues →
  load one.
- **Settings auto-filled** (all still editable):
  - `settings.type` 2 = dynasty; 0 redraft, 1 keeper and 3 (seen on guillotine leagues) → redraft.
  - `SUPER_FLEX` or 2+ QB slots → superflex.
  - `scoring_settings.rec` → closest PPR.
  - `total_rosters` → closest supported team count.
  - `bonus_rec_te` → TE premium.
- **Each side** can be set to a league team. Search is then limited to that roster, with an
  "all players" toggle, and the team's picks appear as shortcuts.
- **Pick inventory:** every team owns its own picks for `settings.draft_rounds` rounds × three
  seasons, starting with the first season whose draft isn't `complete`. Ownership then moves per
  `/traded_picks`. Picks get exact slots once Sleeper sets the draft order, and default to Mid
  until then.

### Caching

TTLs live in `lib/cache.ts`: value sources 6 h, Sleeper player DB 24 h (a ~15 MB payload,
trimmed to QB/RB/WR/TE), Sleeper league data 5 min. The cache is in-memory plus `.cache/`
locally. If a refresh fails, the last good copy is served and marked stale in the status pills.

## Data sources: what the live data showed

Captured 2026-09-25; details in `fixtures/README.md` and `fixtures/probes.json`.

- **FantasyCalc** (`GET https://api.fantasycalc.com/values/current`)
  - Params: `isDynasty`, `numQbs`, `numTeams` (8/10/12/14), `ppr` (0/0.5/1), and a
    TE-premium `tep` (`none`/`te+`/`te++`).
  - Every player has a `sleeperId`.
  - Picks cover rounds 1–4 only. Tiers exist for next season; later seasons are round-level only.
  - Redraft returns no picks.
- **DynastyProcess** (`github.com/dynastyprocess/data`, `files/`)
  - Player values come from `values-players.csv`.
  - `values-picks.csv` has no value columns, so pick values come from the `PICK` rows of
    `values.csv`.
  - Its `2026 Pick x.yy` rows are for a draft that has already happened, so they're ignored.
  - It has one scoring baseline, so PPR, team count and TE premium are always marked approx.
    Dynasty only.
- **KeepTradeCut** (optional, `lib/sources/ktc.ts` is the only file that scrapes it)
  - Reads the JSON embedded in `https://keeptradecut.com/dynasty-rankings`.
  - Baseline is 12 teams / 0.5 PPR, with separate 1QB and Superflex lists and TE-premium
    variants. Dynasty only.
  - If the page format changes, the source shows as an error and the others keep working.
- **Sleeper** (`api.sleeper.app/v1`, read-only, no auth, free for non-commercial use)
  - `/traded_picks` also lists already-used picks.
  - No endpoint states the tradable pick window. Live leagues showed three future seasons, so
    that is a constant (`FUTURE_PICK_SEASONS`).

### Known limitations and assumptions

- **Source disagreement** can be large. For example, Anthony Richardson in superflex was about
  540 on FantasyCalc and about 9,700 on DynastyProcess after normalization. With two sources the
  consensus is their mean. Check the breakdown before trusting any single number.
- **KTC's values top out at 9,999**, so one linear factor makes its elite players read low
  (e.g. Josh Allen ≈ 7,150 vs 11,056 on FantasyCalc in superflex). The median limits the effect
  with three sources. A non-linear mapping would be a formula change and is not implemented.
- **TE premium mapping** is our assumption; neither FantasyCalc nor this app defines TE+/TE++
  numerically. Sleeper `bonus_rec_te` below 0.75 → TE+ (KTC `tep`); 0.75 and up → TE++ (KTC `tepp`).
- **Redraft:** only FantasyCalc applies, and it has no pick values, so picks show "no value".
- **Vercel caching:** memory only lasts as long as a warm instance, so cold starts can refetch
  the Sleeper player DB more than once a day. A durable cache (e.g. Vercel KV/Blob) would need a
  new dependency.

## Deploy to Vercel

No code changes are needed.

1. Push the repo to GitHub and **Import Project** in Vercel.
2. Set **Root Directory** to `trade-analyzer`. The framework (Next.js), build command and output
   are detected automatically.
3. Leave `ENABLE_KTC` unset (off) unless you've cleared KTC's terms. No other env vars are needed.
4. Deploy. The file cache switches itself off on Vercel (`VERCEL` is set there).

## Attribution

The footer on every page credits and links each enabled source (FantasyCalc, DynastyProcess,
KeepTradeCut when enabled) and Sleeper. It also says that normalization and the consolidation
adjustment are this app's own.

## Before any public deployment: confirm usage terms

- [ ] **FantasyCalc** ([api-docs](https://fantasycalc.com/api-docs), terms of usage):
  - Only documented endpoints may be called, and results must be cached server-side (this app
    uses 6 h).
  - Every page showing the data needs a prominent, visible attribution linking to fantasycalc.com.
  - **Email them before launching a public site**; they ask that the email be written by a
    person, not AI.
- [ ] **DynastyProcess**: the `dynastyprocess/data` repo is licensed **GPL-3.0**. Check what
  that means for your use, including the excerpts committed under `fixtures/dynastyprocess/`.
- [ ] **KeepTradeCut**: no official API. **Read KTC's terms before enabling `ENABLE_KTC` or
  deploying with it.** `fixtures/ktc/` holds scraped excerpts; consider removing them before
  making the repo public.
- [ ] **Sleeper**: the API is free for non-commercial use and read-only. Stay well under their
  rate guidance; this app makes a handful of cached calls per league load.

## Project layout

```
app/
  page.tsx                         the single page
  api/health                       per-source status, record count, match rate, fetch time
  api/values                       consensus table for ?format&qb&ppr&teams&tep
  api/players                      Sleeper player index for the typeahead
  api/sleeper/leagues              ?username -> leagues this season
  api/sleeper/league/[leagueId]    settings, teams, rosters, pick inventory
components/                        header pills, settings, Sleeper import, trade columns, results
lib/
  sources/                         fantasycalc.ts, dynastyprocess.ts, ktc.ts (common SourceAdapter interface)
  sleeper/                         client, player DB, league mapping, pick inventory
  normalize.ts consensus.ts scoring.ts valuation.ts picks.ts trade.ts cache.ts
fixtures/                          trimmed live responses the types and tests are built from
scripts/                           fetch-fixtures.ts, score.ts
```

Out of scope for v1: balancing suggestions, saved/shared trades, multi-team trades, IDP,
devy, auth, and other platforms. The adapters are built so those can be added later.
