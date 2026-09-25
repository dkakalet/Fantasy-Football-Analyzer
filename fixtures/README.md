# Fixtures

Trimmed live responses, captured by `npm run fixtures` (`scripts/fetch-fixtures.ts`;
`-- --only ktc` for KeepTradeCut).
Last capture: **2026-09-25**. `probes.json` summarizes what every live call returned
(record counts, top values, all pick labels, the Sleeper league shape). The types in
`lib/` are built from these files.

## fantasycalc/

`GET https://api.fantasycalc.com/values/current` — params per fantasycalc.com/api-docs:
`isDynasty`, `numQbs` ("1"/"2"), `numTeams` (8/10/12/14), `ppr` (0/0.5/1), `tep`
(`none`/`te+`/`te++`).

| File | Settings | Trim |
| --- | --- | --- |
| `values-dynasty-1qb-12-ppr0.5.json` | default | all 419 records, fields this app reads |
| `values-dynasty-2qb-12-ppr0.5.json` | superflex | top 60 overall + top 10 TE + all picks |
| `values-redraft-1qb-12-ppr0.5.json` | redraft | same |
| `values-dynasty-1qb-12-ppr0.5-te+.json` / `-te++.json` | TE premium | same |
| `values-dynasty-1qb-14-ppr0.json`, `values-dynasty-1qb-8-ppr1.json` | team/PPR variants | same |

Findings:
- Every player has `player.sleeperId`.
- Picks are `position: "PICK"`, rounds 1–4 only. Next season has tiers — `2027 1st (Early|Mid|Late)` — plus a generic
  `2027 1st`. Later seasons (`2028 1st`, `2029 1st`) are generic only. `sleeperId` for picks is
  `FP_<season>_<early|mid|late>_<round-1>` or `FP_<season>_<round>`.
- `tep` works: top TE (Trey McBride) 6095 → 7003 (`te+`) → 7863 (`te++`).
- Redraft returns players only (198 records, no picks).
- 8/14 teams and ppr 0/1 are accepted. An undocumented `numTeams=16` also returns 200, but the
  app only sends documented values.

## dynastyprocess/

From `https://raw.githubusercontent.com/dynastyprocess/data/master/files/`.

| File | Source file | Trim |
| --- | --- | --- |
| `values-players.csv` | `values-players.csv` | none (346 players) |
| `values.picks-only.csv` | `values.csv` | only `pos == "PICK"` rows (85) |
| `values-picks.head.csv` | `values-picks.csv` | first 5 rows — kept to document that this file has ECR but **no value columns** |
| `db_playerids.trimmed.csv` | `db_playerids.csv` | rows whose `fantasypros_id` is in `values-players.csv`; ID/name columns only |

Findings:
- Players have `fp_id` (FantasyPros), not a Sleeper ID. `fp_id` → crosswalk `fantasypros_id` →
  `sleeper_id` matched 344 of 346. The other two need the name fallback.
- Pick labels: `2026 Pick 1.01`…`5.12` (exact slots for the 2026 draft, which is already
  complete), `2027 Early|Mid|Late 1st`…`5th`, generic `2027 1st`…`5th`, and generic
  `2028 1st`…`5th`.

## sleeper/

From `https://api.sleeper.app/v1`. A public account's leagues were used. **Names are
anonymized** (users → `Owner N` / `Team N`, leagues → `Sample League N`); IDs are kept.

| File | Endpoint |
| --- | --- |
| `state.json` | `/state/nfl` |
| `user.json` | `/user/<username>` |
| `leagues.json` | `/user/<user_id>/leagues/nfl/<season>` (first 5, trimmed) |
| `league.json` | `/league/<id>` (trimmed to settings this app reads) |
| `rosters.json`, `users.json`, `traded_picks.json`, `drafts.json` | `/league/<id>/…` |
| `leagues-by-type.json` | one league per observed `settings.type` (0, 1, 2, 3) |
| `players.trimmed.json` | `/players/nfl` (~15 MB) → QB/RB/WR/TE subset for players in the other fixtures |

Findings:
- `settings.type`: 0 redraft, 1 keeper, 2 dynasty, 3 (seen on a guillotine-style league).
- `traded_picks` includes already-used picks (2026, draft `complete`). Future seasons seen
  across 26 leagues: 2027, 2028, 2029.

## ktc/

From `https://keeptradecut.com/dynasty-rankings`, the JSON embedded in
`<script type="application/json" id="ktc-players">`. **Scraped data — see the KTC terms note in the
main README before publishing this repo.**

| File | Trim |
| --- | --- |
| `ktc-players.json` | first 250 players as the page lists them + all 36 picks; name, IDs, position, team, and `value` / `tep` / `tepp` / `teppp` for the 1QB and Superflex lists |
| `probe.json` | entry counts by position, pick labels |

Findings:
- 500 entries: 464 players and 36 picks (`position: "RDP"`).
- Picks are `2027 Early 1st` … `2029 Late 4th`, the same label format as DynastyProcess.
- Every player has an `mflid`, which matches the DynastyProcess crosswalk's `mfl_id`.
