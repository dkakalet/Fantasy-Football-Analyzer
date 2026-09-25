// Consensus value per asset = median of the normalized values from the enabled
// sources that have it. With two sources that's the mean. One source: that
// value, flagged `singleSource`. No sources: null ("no value") — never 0.

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Consensus {
  value: number | null;
  singleSource: boolean;
  sourceCount: number;
}

export function consensus(normalizedValues: readonly number[]): Consensus {
  return {
    value: median(normalizedValues),
    singleSource: normalizedValues.length === 1,
    sourceCount: normalizedValues.length,
  };
}
