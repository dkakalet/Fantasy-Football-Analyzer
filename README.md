# Trade Analyzer

Scores fantasy football trades using consensus market values from public sources:
**FantasyCalc** (primary, reference scale), **DynastyProcess** (dynasty only) and
**Dynasty Dealer**. **RosterAudit** and **KeepTradeCut** are optional extra sources that are
off by default. You can import a
Sleeper league to fill in the settings, the rosters, and each team's future picks.

Next.js 16 (App Router) + TypeScript + Tailwind. Every third-party call goes through a
server route handler; the browser only talks to this app.

## Setup

Requires Node 20.9+ (developed on Node 22).

```bash
git clone https://github.com/dkakalet/Fantasy-Football-Analyzer.git
cd Fantasy-Football-Analyzer
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
| `ENABLE_ROSTERAUDIT` | `false` | Turns on RosterAudit (personal use; its terms forbid competing services) |
| `DISABLE_SOURCES` | (empty) | Comma-separated default sources to turn off, e.g. `dynastydealer` |
| `NORMALIZATION` | `rank` | `linear` restores the original single-factor normalization (see below) |
| `FILE_CACHE` | on | Local JSON cache in `.cache/`. `0` disables it. Always off on Vercel. |

### CLI

```bash
npm run score -- "Ja'Marr Chase" vs "Bijan Robinson" "2027 1st"
npm run score -- "Josh Allen" vs "Jahmyr Gibbs" "2027 Early 1st" --qb 2 --ppr 1 --alpha 1.5
```

Left of `vs` is what Team A gives. Picks can be keys (`2027-R1-EARLY`, `2027-1.04`) or
labels (`2027 1st` defaults to Mid). Options: `--format dynasty|redraft --qb 1|2
--ppr 0|0.5|1 --teams 8|10|12|14 --tep none|te+|te++ --alpha 1.0–2.0`. The output shows
every source's raw value, normalized value (with its equivalent rank) and flags for each asset.

## How the numbers are made

Every number shown traces to a source value plus the transformations below
(`lib/normalize.ts`, `lib/consensus.ts`, `lib/scoring.ts`, `lib/valuation.ts`). The
per-source breakdown in the UI and the CLI shows each step.

1. **Fetch** each enabled source for the settings (server-side, cached).
2. **Match** players to Sleeper `player_id`s:
   - FantasyCalc: `player.sleeperId`.
   - DynastyProcess: `fp_id` → `db_playerids.csv` → `sleeper_id`, then normalized name + position.
   - Dynasty Dealer and RosterAudit: `sleeper_id` in the response.
   - KTC: `mflid` → crosswalk `mfl_id` → `sleeper_id`, then name.
3. **Normalize** to FantasyCalc's scale by **rank matching** (`lib/normalize.ts`):
   - Take the players both sources list (typically 320–390).
   - Sort each source's values for those players on its own. The source's k-th highest value
     maps to FantasyCalc's k-th highest value.
   - Values in between are interpolated linearly. Values beyond either end are scaled
     proportionally from the nearest end. Tied source values share the average.
   - Picks go through the same mapping. A pick a source values like its #40 shared player
     gets FantasyCalc's #40 value.
   - Each source keeps its own ordering, and its view of where picks sit among players. Only
     the shape of its value curve is replaced.
   - The breakdown shows the equivalent rank (e.g. `≈#4.6 of 320`) next to each normalized
     value.
   - A source needs at least 20 shared players to be calibrated. If FantasyCalc is down, the
     next source becomes the reference and the UI says so.
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

Captured 2026-09-25 (Dynasty Dealer and RosterAudit on 2026-09-29); details in
`fixtures/README.md` and the `fixtures/probes*.json` files.

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
- **Dynasty Dealer** (`GET https://www.dynastydealer.com/api/player-values`; keyless)
  - Values come from real Sleeper trades. The top 1,000 assets carry a `sleeper_id`, and
    `current_value` (the trade-derived `base_value` plus a few percent of community votes)
    is the value used.
  - **Dynasty mode is one blended market.** `sf=true` and `tep=true` are echoed back but don't
    change any value, so QB format, PPR, team count and TE premium are all marked approx.
  - Picks: tiers for 2027–2029, rounds 1–4. `perSlot=true` adds exact slots (1.01 to 4.12) for
    the next draft.
  - Redraft mode (`format=redraft&scoring=std|half|ppr[&sf=true]`) honours scoring and
    superflex. It is players only.
  - Zero-value deep-bench entries are skipped and don't count against the match rate.
- **RosterAudit** (optional, `ENABLE_ROSTERAUDIT=true`; `https://rosteraudit.com/wp-json/ra/v1`, keyless for these endpoints)
  - Values come from an Elo engine over real Sleeper trades, keyed by `sleeper_id`.
  - `/rankings` returns about 430 entries over five pages. This app reads the raw
    `val_sf_market` / `val_1qb_market`, because the preset-adjusted `value` bakes TE premium
    into Superflex. `format_key` and `league_size` are accepted but change nothing.
  - Its pick rows are ignored. `/picks` gives 2027–2029, rounds 1–5, early/mid/late, with
    separate Superflex and 1QB values.
  - Dynasty only. PPR, team count and TE premium are marked approx.
- **KeepTradeCut** (optional, `lib/sources/ktc.ts` is the only file that scrapes it)
  - Reads the JSON embedded in `https://keeptradecut.com/dynasty-rankings`.
  - Baseline is 12 teams / 0.5 PPR, with separate 1QB and Superflex lists and TE-premium
    variants. Dynasty only.
  - If the page format changes, the source shows as an error and the others keep working.
- **Sleeper** (`api.sleeper.app/v1`, read-only, no auth, free for non-commercial use)
  - `/traded_picks` also lists already-used picks.
  - No endpoint states the tradable pick window. Live leagues showed three future seasons, so
    that is a constant (`FUTURE_PICK_SEASONS`).

### What changed in normalization (2026-09-29)

**Before:** one linear factor per source, `Σ FantasyCalc ÷ Σ source` over the top 150 shared
players. **After:** rank matching (above). `NORMALIZATION=linear` switches back.

Why: a single factor can only fix a source's overall size, not the shape of its curve. On
live data, the median gap between each source's normalized value and FantasyCalc's, by
FantasyCalc rank tier (1QB, Sept 29):

| Source | Method | #1–12 | #13–36 | #37–100 | #101–200 | Median error, top 200 |
| --- | --- | --- | --- | --- | --- | --- |
| DynastyProcess | linear | +14% | +36% | −5% | **−76%** | 55% |
| | rank | −6% | +2% | +1% | −5% | 18% |
| Dynasty Dealer | linear | **−35%** | −15% | +12% | +35% | 30% |
| | rank | −8% | −15% | −8% | −6% | 14% |
| RosterAudit | linear | +16% | +14% | +4% | **−64%** | 23% |
| | rank | 0% | 0% | 0% | −1% | 6% |
| KeepTradeCut | linear | **−36%** | −14% | +12% | +54% | 34% |
| | rank | 0% | 0% | +2% | −1% | 7% |

A two-parameter power curve (`a·v^b`) was also tested. It beat linear but missed badly at the
top (−25% to −38% on DynastyProcess and RosterAudit for #1–12).

Effect on consensus values (default sources FantasyCalc + DynastyProcess + Dynasty Dealer, 1QB):

| Asset | Before | After | Why |
| --- | --- | --- | --- |
| Jahmyr Gibbs | 9,720 | 10,671 | Dynasty Dealer's elite players no longer read at ~5,500 |
| Bijan Robinson | 10,093 | 9,941 | |
| Travis Kelce (DynastyProcess's value) | 360 | 1,326 | linear crushed DynastyProcess's depth |
| 2027 1st (Early) | 4,317 | 4,695 | |
| 2027 3rd (Mid) | 978 | 389 | Dynasty Dealer's flat curve was inflating late picks |
| 2027 4th (Mid) | 743 | 183 | same |
| 2028 1st (Mid) | 2,087 | 2,174 | |

Most trades of starters and early picks barely move (Chase for Bijan + a 2027 1st: 59.9 →
59.6). Trades built on late-round picks now lean further against the side receiving them
(Bowers for Rice + a 2nd + a 3rd: 47.7 "Fair" → 44.7 "Slight edge").

### Sources evaluated but not added (2026-09-29)

| Source | Why not |
| --- | --- |
| Dynasty Trade Values (`dynastytradevalues.com/wp-json/dtc/v1/public`) | Keyless, but its values are derived from ADP, not trades. No Sleeper IDs (name matching only), and three Superflex QBs are capped at 10,000. |
| Fantasy Football Calculator ADP API | Official and free, but it gives draft position, not trade value. In-season samples are tiny (29 PPR and 16 dynasty players), and there are no Sleeper IDs. |
| MyFantasyLeague `export?TYPE=adp/aav` | Official, but draft/auction data. `PERIOD=RECENT` is empty in-season, and keeper data mixes startup and rookie-only drafts. |
| Fantasy Nerds | Needs a paid API key; rankings only, no trade values. |
| FantasyPros | API is partner-only; its consensus rankings already feed DynastyProcess. |
| Dynasty Daddy | No public API; its data is scraped from KTC. |
| ESPN / Yahoo | Undocumented or authenticated platform APIs, not value sources. |
| DraftSharks, DLF, Dynasty Trade Calculator, and others | Paid, with no API. |
| Parse.bot "APIs" for KTC / FantasyCalc / RosterAudit | Third-party scraper wrappers, not official. |

### Known limitations and assumptions

- **Source disagreement** can be large. For example, Anthony Richardson in superflex was about
  540 on FantasyCalc and about 9,700 on DynastyProcess after normalization. With three or more
  sources the median sets the extremes aside. Check the breakdown before
  trusting any single number.
- **Rank matching trusts each source's ordering.** Dynasty Dealer's dynasty list is one blended
  1QB/Superflex market, so in 1QB leagues its QBs rank too high: it has Josh Allen at #1
  overall, which maps to about 11,000 against 5,900 on FantasyCalc. That's why it's flagged
  approx for QB format. With three or more sources the median sets it aside.
- **Late-round picks depend on how deep each source's list goes.** DynastyProcess and Dynasty
  Dealer value 3rds and 4ths like their #300+ players, which maps to FantasyCalc's small deep
  values. FantasyCalc itself values them higher.
- **TE premium mapping** is our assumption; neither FantasyCalc nor this app defines TE+/TE++
  numerically. Sleeper `bonus_rec_te` below 0.75 → TE+ (KTC `tep`); 0.75 and up → TE++ (KTC `tepp`).
- **Redraft:** FantasyCalc and Dynasty Dealer apply (DynastyProcess, RosterAudit and KTC are
  dynasty only). Neither has redraft pick values, so picks show "no value".
- **Vercel caching:** memory only lasts as long as a warm instance, so cold starts can refetch
  the Sleeper player DB more than once a day. A durable cache (e.g. Vercel KV/Blob) would need a
  new dependency.

## Deploy to Vercel

No code changes are needed.

1. **Import Project** in Vercel and pick `dkakalet/Fantasy-Football-Analyzer`.
2. Keep the default Root Directory (the repo root). The framework (Next.js), build command and
   output are detected automatically.
3. Leave `ENABLE_KTC` unset (off) unless you've cleared KTC's terms. No other env vars are needed.
   Use `DISABLE_SOURCES` to turn a default source off. Leave `ENABLE_ROSTERAUDIT` off for a
   public site.
4. Deploy. The file cache switches itself off on Vercel (`VERCEL` is set there).

## Attribution

The footer on every page reads "Values by …" and links each enabled source (FantasyCalc,
DynastyProcess, Dynasty Dealer, RosterAudit.com, KeepTradeCut when enabled), plus Sleeper. It also says that normalization and the consolidation
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
- [ ] **Dynasty Dealer**: free for any use with a visible link to dynastydealer.com (this is
  from the API author's published announcement; the site's own terms page renders client-side
  and couldn't be read here). Confirm on the site.
- [ ] **RosterAudit** ([developers](https://rosteraudit.com/developers/), [terms](https://rosteraudit.com/terms/)):
  - Personal tools are allowed.
  - Show "Values by RosterAudit.com" with a link.
  - **You may not build a service that directly competes with RosterAudit**, which runs its own
    trade calculator, or redistribute the data commercially without written permission.
  - A public trade analyzer may count as competing, so it is **off by default**. Only turn on
    `ENABLE_ROSTERAUDIT` for a private deployment, or after RosterAudit says yes.
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
  sources/                         fantasycalc.ts, dynastyprocess.ts, dynastydealer.ts, rosteraudit.ts,
                                   ktc.ts (common SourceAdapter interface; registry in index.ts)
  sleeper/                         client, player DB, league mapping, pick inventory
  normalize.ts consensus.ts scoring.ts valuation.ts picks.ts trade.ts cache.ts
fixtures/                          trimmed live responses the types and tests are built from
scripts/                           fetch-fixtures.ts, score.ts
```

Out of scope for v1: balancing suggestions, saved/shared trades, multi-team trades, IDP,
devy, auth, and other platforms. The adapters are built so those can be added later.
