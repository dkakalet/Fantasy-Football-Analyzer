# Trade Analyzer

Scores fantasy football trades using consensus market values from FantasyCalc and
DynastyProcess (KeepTradeCut optional, off by default). Next.js App Router +
TypeScript + Tailwind; every third-party call goes through a server route handler.

> Work in progress. Milestone 1 is done: scaffold, live fixtures, `/api/health`.
> Full setup, data-source notes, attribution, and deploy steps land in milestone 5.

## Develop

```
cd trade-analyzer
npm install
npm run dev          # http://localhost:3000, health at /api/health
npm test             # Vitest
npm run typecheck
npm run lint
npm run fixtures     # re-capture fixtures/ from the live sources
```

`/api/health` accepts the same settings query as the rest of the app:
`?format=dynasty|redraft&qb=1|2&ppr=0|0.5|1&teams=8|10|12|14&tep=none|te%2B|te%2B%2B`.

## Caching

`lib/cache.ts` holds TTLs in one place: value sources 6h, Sleeper player DB 24h, Sleeper
league data 5 min. In-memory, plus a JSON file cache in `.cache/` locally (off on Vercel, or
with `FILE_CACHE=0`). If a refresh fails, the last good value is served and marked stale.
