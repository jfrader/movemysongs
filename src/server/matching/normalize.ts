/** Text normalization utilities for cross-provider track matching. */

const FEAT_RE = /\s*[([]?\s*(?:feat|ft|featuring)\.?\s+([^)\]]+)[)\]]?\s*$/i;

// Version noise that does NOT change the recording identity.
const SOFT_NOISE_RE =
  /\b(remaster(?:ed)?(?:\s+\d{4})?|\d{4}\s+remaster(?:ed)?|radio edit|single version|album version|original(?:\s+(?:mix|version))?|mono|stereo|deluxe(?:\s+edition)?|bonus track|explicit|clean|official(?:\s+(?:video|audio|music video))?|lyric video|visualizer|(?:hd|hq|4k)|audio|video)\b/gi;

// Markers that DO change the recording (kept for comparison, penalized on mismatch).
const VERSION_MARKERS = [
  "live",
  "remix",
  "acoustic",
  "instrumental",
  "karaoke",
  "unplugged",
  "demo",
  "cover",
  "sped up",
  "slowed",
] as const;

export function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function baseNormalize(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract featured artists from a title, returning cleaned title + names. */
export function extractFeaturedArtists(title: string): {
  title: string;
  featured: string[];
} {
  const m = title.match(FEAT_RE);
  if (!m) return { title, featured: [] };
  const featured = m[1]
    .split(/,|&| and /i)
    .map((a) => a.trim())
    .filter(Boolean);
  return { title: title.replace(FEAT_RE, "").trim(), featured };
}

function stripEmptyBrackets(s: string): string {
  return s
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s*-\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalization for comparison: removes noise like "(Remastered 2011)" but
 * keeps identity-changing markers like "live"/"remix" so mismatches score low.
 */
export function normalizeTitle(title: string): string {
  const { title: noFeat } = extractFeaturedArtists(title);
  let s = baseNormalize(noFeat);
  s = s.replace(SOFT_NOISE_RE, " ");
  s = stripEmptyBrackets(s);
  s = s.replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}

/** Aggressive normalization for building search queries: drop all bracketed extras. */
export function searchTitle(title: string): string {
  const { title: noFeat } = extractFeaturedArtists(title);
  let s = baseNormalize(noFeat);
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  s = s.replace(/\s+-\s+.*$/, ""); // trailing " - Radio Edit" style suffixes
  s = s.replace(SOFT_NOISE_RE, " ");
  s = s.replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();
  return s || baseNormalize(title);
}

export function normalizeArtist(name: string): string {
  let s = baseNormalize(name);
  s = s.replace(/^the\s+/, "");
  s = s.replace(/\s+-\s+topic$/, ""); // YouTube auto-generated artist channels
  s = s.replace(/vevo$/, "");
  s = s.replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}

/** Identity-changing version markers present in a title (lowercased set). */
export function versionMarkers(title: string): Set<string> {
  const s = baseNormalize(title);
  const found = new Set<string>();
  for (const marker of VERSION_MARKERS) {
    if (new RegExp(`\\b${marker}\\b`, "i").test(s)) found.add(marker);
  }
  return found;
}

export function tokenize(s: string): string[] {
  return s.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Similarity in [0, 1]: blend of token containment/overlap and edit distance.
 * Containment matters because provider titles often add suffixes.
 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const jaccard = common / (ta.size + tb.size - common);
  const containment = common / Math.min(ta.size, tb.size);

  const dist = levenshtein(a, b);
  const editSim = 1 - dist / Math.max(a.length, b.length);

  return Math.max(0, Math.min(1, 0.35 * jaccard + 0.35 * containment + 0.3 * editSim));
}

/** Cache key for provider search results. */
export function searchCacheKey(title: string, artists: string[]): string {
  return `${searchTitle(title)}|${normalizeArtist(artists[0] ?? "")}`;
}
