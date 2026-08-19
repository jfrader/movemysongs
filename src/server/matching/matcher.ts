import { prisma } from "@/server/db";
import type { MusicProvider } from "@/server/config";
import { getAdapter } from "@/server/providers/registry";
import type { ProviderCtx, ProviderTrack } from "@/server/providers/types";
import { searchCacheKey } from "@/server/matching/normalize";
import {
  AUTO_MATCH_THRESHOLD,
  rankCandidates,
  REVIEW_THRESHOLD,
  type ScoredCandidate,
  type SourceTrackInfo,
} from "@/server/matching/score";

const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MatchStatus = "auto_matched" | "needs_review" | "unmatched";

export type MatchOutcome = {
  status: MatchStatus;
  best: ScoredCandidate | null;
  candidates: ScoredCandidate[];
};

export type SourceTrackForMatch = SourceTrackInfo & {
  provider: MusicProvider;
  providerTrackId: string;
};

function outcomeFor(candidates: ScoredCandidate[]): MatchOutcome {
  const best = candidates[0] ?? null;
  const top = candidates.slice(0, 5);
  if (best && best.confidence >= AUTO_MATCH_THRESHOLD) {
    return { status: "auto_matched", best, candidates: top };
  }
  if (best && best.confidence >= REVIEW_THRESHOLD) {
    return { status: "needs_review", best, candidates: top };
  }
  return { status: "unmatched", best: null, candidates: top };
}

async function cachedSearch(
  provider: MusicProvider,
  ctx: ProviderCtx,
  source: SourceTrackForMatch
): Promise<ProviderTrack[]> {
  const queryKey = searchCacheKey(source.title, source.artists);
  const cached = await prisma.searchCache.findUnique({
    where: { provider_queryKey: { provider, queryKey } },
  });
  if (cached && Date.now() - cached.createdAt.getTime() < SEARCH_CACHE_TTL_MS) {
    return JSON.parse(cached.results) as ProviderTrack[];
  }

  const adapter = getAdapter(provider);
  const results = await adapter.searchTracks(ctx, {
    title: source.title,
    artists: source.artists,
    album: source.album,
    durationMs: source.durationMs,
  });

  await prisma.searchCache.upsert({
    where: { provider_queryKey: { provider, queryKey } },
    create: { provider, queryKey, results: JSON.stringify(results) },
    update: { results: JSON.stringify(results), createdAt: new Date() },
  });
  return results;
}

export async function matchTrack(
  source: SourceTrackForMatch,
  targetProvider: MusicProvider,
  ctx: ProviderCtx
): Promise<MatchOutcome> {
  // 1. Previously confirmed mapping.
  const mapped = await prisma.trackMap.findUnique({
    where: {
      sourceProvider_sourceTrackId_targetProvider: {
        sourceProvider: source.provider,
        sourceTrackId: source.providerTrackId,
        targetProvider,
      },
    },
  });
  if (mapped) {
    const track: ProviderTrack = {
      provider: targetProvider,
      providerTrackId: mapped.targetTrackId,
      title: mapped.targetTitle ?? source.title,
      artists: mapped.targetArtists
        ? (JSON.parse(mapped.targetArtists) as string[])
        : source.artists,
      externalUrl: mapped.targetUrl ?? undefined,
    };
    return {
      status: "auto_matched",
      best: { track, confidence: mapped.confidence, reason: "cached" },
      candidates: [{ track, confidence: mapped.confidence, reason: "cached" }],
    };
  }

  const adapter = getAdapter(targetProvider);

  // 2. Exact ISRC lookup.
  if (source.isrc && adapter.lookupByIsrc) {
    const results = await adapter.lookupByIsrc(ctx, source.isrc);
    const exact = results.find(
      (t) => t.isrc && t.isrc.toUpperCase() === source.isrc!.toUpperCase()
    );
    if (exact) {
      const best: ScoredCandidate = { track: exact, confidence: 100, reason: "isrc_exact" };
      return { status: "auto_matched", best, candidates: [best] };
    }
  }

  // 3. Text search + scoring.
  const results = await cachedSearch(targetProvider, ctx, source);
  return outcomeFor(rankCandidates(source, results));
}

/** Persist a confirmed mapping so future transfers reuse it. */
export async function saveTrackMap(
  source: { provider: MusicProvider; providerTrackId: string },
  target: {
    provider: MusicProvider;
    providerTrackId: string;
    title?: string;
    artists?: string[];
    externalUrl?: string;
  },
  confidence: number,
  reason: string
): Promise<void> {
  await prisma.trackMap.upsert({
    where: {
      sourceProvider_sourceTrackId_targetProvider: {
        sourceProvider: source.provider,
        sourceTrackId: source.providerTrackId,
        targetProvider: target.provider,
      },
    },
    create: {
      sourceProvider: source.provider,
      sourceTrackId: source.providerTrackId,
      targetProvider: target.provider,
      targetTrackId: target.providerTrackId,
      targetTitle: target.title ?? null,
      targetArtists: target.artists ? JSON.stringify(target.artists) : null,
      targetUrl: target.externalUrl ?? null,
      confidence,
      reason,
    },
    update: {
      targetTrackId: target.providerTrackId,
      targetTitle: target.title ?? null,
      targetArtists: target.artists ? JSON.stringify(target.artists) : null,
      targetUrl: target.externalUrl ?? null,
      confidence,
      reason,
    },
  });
}
