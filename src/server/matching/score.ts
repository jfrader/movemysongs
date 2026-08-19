import type { ProviderTrack } from "@/server/providers/types";
import {
  normalizeArtist,
  normalizeTitle,
  similarity,
  versionMarkers,
} from "@/server/matching/normalize";

export type MatchReason =
  | "isrc_exact"
  | "cached"
  | "text_match"
  | "manual"
  | "no_candidate";

export type ScoredCandidate = {
  track: ProviderTrack;
  confidence: number;
  reason: MatchReason;
};

export type SourceTrackInfo = {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
};

export const AUTO_MATCH_THRESHOLD = 90;
export const REVIEW_THRESHOLD = 70;

function artistSimilarity(source: SourceTrackInfo, candidate: ProviderTrack): number {
  const sourceArtists = source.artists.map(normalizeArtist).filter(Boolean);
  const candArtists = candidate.artists.map(normalizeArtist).filter(Boolean);
  if (sourceArtists.length === 0 || candArtists.length === 0) return 0;

  const primary = Math.max(
    ...candArtists.map((c) => similarity(sourceArtists[0], c))
  );

  // YouTube uploads often carry the artist inside the video title instead of
  // the channel name; credit a title that contains the artist.
  const candTitle = normalizeTitle(candidate.title);
  const inTitle = candTitle.includes(sourceArtists[0]) ? 0.9 : 0;

  let overlap = 0;
  for (const a of sourceArtists) {
    if (candArtists.some((c) => similarity(a, c) > 0.8) || candTitle.includes(a)) {
      overlap++;
    }
  }
  const setScore = overlap / sourceArtists.length;

  return Math.max(primary, inTitle) * 0.7 + setScore * 0.3;
}

function titleSimilarity(source: SourceTrackInfo, candidate: ProviderTrack): number {
  const s = normalizeTitle(source.title);
  const c = normalizeTitle(candidate.title);
  let sim = similarity(s, c);

  // "Artist - Title (Official Video)" style candidate titles: also try after
  // removing the artist name from the candidate title.
  for (const artist of source.artists.map(normalizeArtist)) {
    if (!artist) continue;
    const idx = c.indexOf(artist);
    if (idx >= 0) {
      const stripped = (c.slice(0, idx) + c.slice(idx + artist.length))
        .replace(/^the\s+/, "")
        .replace(/^[\s-]+|[\s-]+$/g, "")
        .trim();
      if (stripped) sim = Math.max(sim, similarity(s, stripped));
    }
  }
  return sim;
}

export function scoreCandidate(
  source: SourceTrackInfo,
  candidate: ProviderTrack
): ScoredCandidate {
  if (source.isrc && candidate.isrc && source.isrc.toUpperCase() === candidate.isrc.toUpperCase()) {
    return { track: candidate, confidence: 100, reason: "isrc_exact" };
  }

  const titleSim = titleSimilarity(source, candidate);
  const artistSim = artistSimilarity(source, candidate);

  let score = titleSim * 40 + artistSim * 30;

  // Duration: full 15 points within 3s, tapering to 0 at 10s.
  const hasDuration = source.durationMs != null && candidate.durationMs != null;
  if (hasDuration) {
    const diff = Math.abs(source.durationMs! - candidate.durationMs!);
    if (diff <= 3000) score += 15;
    else if (diff <= 5000) score += 10;
    else if (diff <= 10000) score += 5;
    if (diff > 30000) score -= 10; // likely a live/extended version
  } else {
    // Redistribute duration weight so providers without duration can still auto-match.
    score += titleSim * 7.5 + artistSim * 7.5;
  }

  const hasAlbum = Boolean(source.album && candidate.album);
  if (hasAlbum) {
    if (similarity(normalizeTitle(source.album!), normalizeTitle(candidate.album!)) > 0.8) {
      score += 5;
    }
  } else {
    score += titleSim * 5;
  }

  // Penalize identity-changing version mismatches (live vs studio, remix vs original).
  const sourceMarkers = versionMarkers(source.title);
  const candMarkers = versionMarkers(candidate.title);
  for (const m of new Set([...sourceMarkers, ...candMarkers])) {
    if (sourceMarkers.has(m) !== candMarkers.has(m)) score -= 15;
  }

  return {
    track: candidate,
    confidence: Math.max(0, Math.min(100, Math.round(score))),
    reason: "text_match",
  };
}

export function rankCandidates(
  source: SourceTrackInfo,
  candidates: ProviderTrack[]
): ScoredCandidate[] {
  return candidates
    .map((c) => scoreCandidate(source, c))
    .sort((a, b) => b.confidence - a.confidence);
}
