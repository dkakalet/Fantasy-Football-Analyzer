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
