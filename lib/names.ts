const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/**
 * Normalize a player name for fallback matching across sources:
 * lowercase, strip accents and punctuation, drop generational suffixes.
 * "Ja'Marr Chase" -> "jamarr chase", "Marvin Harrison Jr." -> "marvin harrison".
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !SUFFIXES.has(w))
    .join(" ");
}
