// Shared types. Kept free of runtime code so both server and client can import them.

export type Format = "dynasty" | "redraft";
export type NumQbs = 1 | 2;
export type Ppr = 0 | 0.5 | 1;
export type NumTeams = 8 | 10 | 12 | 14;
/** FantasyCalc's documented `tep` values. */
export type TePremium = "none" | "te+" | "te++";

export interface LeagueSettings {
  format: Format;
  numQbs: NumQbs;
  ppr: Ppr;
  numTeams: NumTeams;
  tep: TePremium;
}

export type SourceId = "fantasycalc" | "dynastyprocess" | "ktc";

export type AssetKind = "player" | "pick";

export type AssetValue = {
  /** Canonical ID: Sleeper player_id for players; pick key for picks. */
  assetId: string;
  kind: AssetKind;
  /** Source's native scale. */
  rawValue: number;
  /** Name as the source spells it (for debugging matches). */
  sourceName: string;
  /** Optional player metadata from the source, used when Sleeper lacks the player. */
  position?: string;
  team?: string | null;
};

export interface SupportResult {
  supported: boolean;
  /** Settings the source can't match exactly and approximates (e.g. "ppr", "teams"). */
  approximated: string[];
}

export interface ValueSource {
  id: SourceId;
  supports(settings: LeagueSettings): SupportResult;
  fetchValues(settings: LeagueSettings): Promise<AssetValue[]>; // players + picks
}

/** What an adapter fetched, plus bookkeeping for /api/health. */
export interface SourceLoad {
  values: AssetValue[];
  /** Epoch ms of the underlying network fetch. */
  fetchedAt: number;
  from: "memory" | "file" | "network" | "stale";
  /** Set when a refresh failed and cached data was served. */
  error?: string;
  stats: {
    /** Player records in the source payload. */
    players: number;
    /** Pick records mapped to a pick key. */
    picks: number;
    /** Records not turned into values, by reason. */
    skipped: Record<string, number>;
    /** How players were matched to Sleeper IDs, by method. */
    matchedBy: Record<string, number>;
  };
}

/** A ValueSource plus the metadata and bookkeeping the app needs. */
export interface SourceAdapter extends ValueSource {
  name: string;
  homepage: string;
  load(settings: LeagueSettings): Promise<SourceLoad>;
}
