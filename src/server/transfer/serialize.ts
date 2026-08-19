import type { TransferItem, TransferJob } from "@prisma/client";

export function serializeJob(job: TransferJob) {
  return {
    id: job.id,
    sourceProvider: job.sourceProvider,
    sourcePlaylistId: job.sourcePlaylistId,
    sourcePlaylistName: job.sourcePlaylistName,
    targetProvider: job.targetProvider,
    mode: job.mode,
    targetPlaylistId: job.targetPlaylistId,
    targetPlaylistName: job.targetPlaylistName,
    targetPlaylistUrl: job.targetPlaylistUrl,
    status: job.status,
    phase: job.phase,
    totalItems: job.totalItems,
    matchedItems: job.matchedItems,
    reviewItems: job.reviewItems,
    unmatchedItems: job.unmatchedItems,
    processedItems: job.processedItems,
    addedItems: job.addedItems,
    skippedItems: job.skippedItems,
    failedItems: job.failedItems,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeItem(item: TransferItem) {
  return {
    id: item.id,
    position: item.position,
    sourceTrackId: item.sourceTrackId,
    title: item.title,
    artists: parseJson<string[]>(item.artists, []),
    album: item.album,
    durationMs: item.durationMs,
    isrc: item.isrc,
    sourceUrl: item.sourceUrl,
    imageUrl: item.imageUrl,
    targetTrackId: item.targetTrackId,
    targetTitle: item.targetTitle,
    targetArtists: parseJson<string[]>(item.targetArtists, []),
    targetUrl: item.targetUrl,
    confidence: item.confidence,
    reason: item.reason,
    candidates: parseJson<unknown[]>(item.candidates, []),
    status: item.status,
    errorMessage: item.errorMessage,
  };
}
