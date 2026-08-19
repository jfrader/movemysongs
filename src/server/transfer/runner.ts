import { prisma } from "@/server/db";
import { isMusicProvider, type MusicProvider } from "@/server/config";
import { getProviderCtx } from "@/server/auth/tokens";
import { getAdapter } from "@/server/providers/registry";
import { matchTrack, saveTrackMap } from "@/server/matching/matcher";
import type { ProviderTrack } from "@/server/providers/types";

// Survive dev-mode module reloads: track in-flight jobs globally.
const globalRunner = globalThis as unknown as { __mmsRunning?: Set<string> };
const running = (globalRunner.__mmsRunning ??= new Set<string>());

function asProvider(value: string): MusicProvider {
  if (!isMusicProvider(value)) throw new Error(`Unknown provider: ${value}`);
  return value;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota|dailyLimit|rateLimitExceeded/i.test(msg) && /403/.test(msg);
}

async function jobCanceled(jobId: string): Promise<boolean> {
  const job = await prisma.transferJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  return !job || job.status === "canceled";
}

export function startMatchingInBackground(jobId: string): void {
  void runMatching(jobId).catch(async (err) => {
    console.error(`[transfer ${jobId}] matching crashed:`, err);
    await prisma.transferJob
      .update({
        where: { id: jobId },
        data: {
          status: "failed",
          phase: null,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
  });
}

export function startExecuteInBackground(jobId: string): void {
  void runExecute(jobId).catch(async (err) => {
    console.error(`[transfer ${jobId}] execute crashed:`, err);
    await prisma.transferJob
      .update({
        where: { id: jobId },
        data: {
          status: "failed",
          phase: null,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
  });
}

export async function runMatching(jobId: string): Promise<void> {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    const job = await prisma.transferJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "matching") return;

    const sourceProvider = asProvider(job.sourceProvider);
    const targetProvider = asProvider(job.targetProvider);

    // Phase 1: fetch the source playlist.
    await prisma.transferJob.update({
      where: { id: jobId },
      data: { phase: "fetching_source", startedAt: new Date() },
    });
    const sourceCtx = await getProviderCtx(sourceProvider);
    const tracks = await getAdapter(sourceProvider).getPlaylistTracks(
      sourceCtx,
      job.sourcePlaylistId
    );

    await prisma.transferItem.deleteMany({ where: { jobId } });
    await prisma.transferItem.createMany({
      data: tracks.map((t, i) => ({
        jobId,
        position: i,
        sourceTrackId: t.providerTrackId,
        title: t.title,
        artists: JSON.stringify(t.artists),
        album: t.album ?? null,
        durationMs: t.durationMs ?? null,
        isrc: t.isrc ?? null,
        sourceUrl: t.externalUrl ?? null,
        imageUrl: t.imageUrl ?? null,
        status: "pending",
      })),
    });
    await prisma.transferJob.update({
      where: { id: jobId },
      data: { totalItems: tracks.length, phase: "matching", processedItems: 0 },
    });

    // Phase 2: match each track against the target catalog.
    const targetCtx = await getProviderCtx(targetProvider);
    const items = await prisma.transferItem.findMany({
      where: { jobId },
      orderBy: { position: "asc" },
    });

    let quotaExhausted = false;
    let processed = 0;
    const counts = { auto_matched: 0, needs_review: 0, unmatched: 0 };

    for (const item of items) {
      if (await jobCanceled(jobId)) return;

      if (quotaExhausted) {
        await prisma.transferItem.update({
          where: { id: item.id },
          data: {
            status: "unmatched",
            errorMessage: "Skipped: provider API quota exhausted",
          },
        });
        counts.unmatched++;
        processed++;
        continue;
      }

      try {
        const outcome = await matchTrack(
          {
            provider: sourceProvider,
            providerTrackId: item.sourceTrackId,
            title: item.title,
            artists: JSON.parse(item.artists) as string[],
            album: item.album ?? undefined,
            durationMs: item.durationMs ?? undefined,
            isrc: item.isrc ?? undefined,
          },
          targetProvider,
          targetCtx
        );
        counts[outcome.status]++;
        await prisma.transferItem.update({
          where: { id: item.id },
          data: {
            status: outcome.status,
            targetTrackId: outcome.best?.track.providerTrackId ?? null,
            targetTitle: outcome.best?.track.title ?? null,
            targetArtists: outcome.best
              ? JSON.stringify(outcome.best.track.artists)
              : null,
            targetUrl: outcome.best?.track.externalUrl ?? null,
            confidence: outcome.best?.confidence ?? null,
            reason: outcome.best?.reason ?? null,
            candidates: JSON.stringify(
              outcome.candidates.map((c) => ({
                track: c.track,
                confidence: c.confidence,
                reason: c.reason,
              }))
            ),
          },
        });
      } catch (err) {
        if (isQuotaError(err)) quotaExhausted = true;
        counts.unmatched++;
        await prisma.transferItem.update({
          where: { id: item.id },
          data: {
            status: "unmatched",
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        });
      }

      processed++;
      await prisma.transferJob.update({
        where: { id: jobId },
        data: {
          processedItems: processed,
          matchedItems: counts.auto_matched,
          reviewItems: counts.needs_review,
          unmatchedItems: counts.unmatched,
        },
      });
    }

    await prisma.transferJob.update({
      where: { id: jobId },
      data: {
        status: "needs_review",
        phase: null,
        errorMessage: quotaExhausted
          ? "Target provider API quota was exhausted during matching; some tracks were not matched. Quota resets daily."
          : null,
      },
    });
  } finally {
    running.delete(jobId);
  }
}

export async function runExecute(jobId: string): Promise<void> {
  const runKey = `exec:${jobId}`;
  if (running.has(runKey)) return;
  running.add(runKey);
  try {
    const job = await prisma.transferJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "executing") return;

    const targetProvider = asProvider(job.targetProvider);
    const adapter = getAdapter(targetProvider);
    const ctx = await getProviderCtx(targetProvider);

    // Create the target playlist if needed.
    let targetPlaylistId = job.targetPlaylistId;
    if (job.mode === "create_new" && !targetPlaylistId) {
      await prisma.transferJob.update({
        where: { id: jobId },
        data: { phase: "creating_playlist" },
      });
      const playlist = await adapter.createPlaylist(ctx, {
        name: job.targetPlaylistName ?? job.sourcePlaylistName,
        description: `Transferred from ${job.sourceProvider} with MoveMySongs`,
      });
      targetPlaylistId = playlist.providerPlaylistId;
      await prisma.transferJob.update({
        where: { id: jobId },
        data: {
          targetPlaylistId,
          targetPlaylistUrl:
            playlist.externalUrl ?? adapter.playlistUrl(targetPlaylistId),
        },
      });
    }
    if (!targetPlaylistId) throw new Error("No target playlist selected");
    if (!job.targetPlaylistUrl) {
      await prisma.transferJob.update({
        where: { id: jobId },
        data: { targetPlaylistUrl: adapter.playlistUrl(targetPlaylistId) },
      });
    }

    // For append mode, skip tracks already in the target playlist.
    let existingIds = new Set<string>();
    if (job.mode === "append") {
      await prisma.transferJob.update({
        where: { id: jobId },
        data: { phase: "reading_target" },
      });
      const existing = await adapter.getPlaylistTracks(ctx, targetPlaylistId);
      existingIds = new Set(existing.map((t: ProviderTrack) => t.providerTrackId));
    }

    const items = await prisma.transferItem.findMany({
      where: { jobId, status: { in: ["auto_matched", "accepted"] } },
      orderBy: { position: "asc" },
    });
    // Anything not accepted by review time is skipped.
    await prisma.transferItem.updateMany({
      where: { jobId, status: { in: ["needs_review", "unmatched"] } },
      data: { status: "skipped" },
    });
    const skippedByUser = await prisma.transferItem.count({
      where: { jobId, status: "skipped" },
    });

    await prisma.transferJob.update({
      where: { id: jobId },
      data: { phase: "adding_tracks", processedItems: 0, addedItems: 0, failedItems: 0 },
    });

    let added = 0;
    let failed = 0;
    let skipped = skippedByUser;
    let processed = 0;

    const toAdd = items.filter((item) => {
      if (item.targetTrackId && existingIds.has(item.targetTrackId)) {
        skipped++;
        return false;
      }
      return Boolean(item.targetTrackId);
    });
    await prisma.transferItem.updateMany({
      where: {
        id: { in: items.filter((i) => !toAdd.includes(i)).map((i) => i.id) },
      },
      data: { status: "skipped", errorMessage: "Already in target playlist" },
    });

    const BATCH = 50;
    for (let i = 0; i < toAdd.length; i += BATCH) {
      if (await jobCanceled(jobId)) return;
      const batch = toAdd.slice(i, i + BATCH);
      const ids = batch.map((b) => b.targetTrackId!) as string[];
      try {
        await adapter.addTracksToPlaylist(ctx, targetPlaylistId, ids);
        added += batch.length;
        await prisma.transferItem.updateMany({
          where: { id: { in: batch.map((b) => b.id) } },
          data: { status: "added" },
        });
      } catch {
        // Batch failed: retry one-by-one to isolate the bad track(s).
        for (const item of batch) {
          try {
            await adapter.addTracksToPlaylist(ctx, targetPlaylistId, [
              item.targetTrackId!,
            ]);
            added++;
            await prisma.transferItem.update({
              where: { id: item.id },
              data: { status: "added" },
            });
          } catch (err) {
            failed++;
            await prisma.transferItem.update({
              where: { id: item.id },
              data: {
                status: "failed",
                errorMessage: err instanceof Error ? err.message : String(err),
              },
            });
          }
        }
      }
      processed = Math.min(i + BATCH, toAdd.length);
      await prisma.transferJob.update({
        where: { id: jobId },
        data: {
          processedItems: processed,
          addedItems: added,
          failedItems: failed,
          skippedItems: skipped,
        },
      });
    }

    // Remember confirmed mappings for future transfers.
    const addedItems = await prisma.transferItem.findMany({
      where: { jobId, status: "added" },
    });
    for (const item of addedItems) {
      await saveTrackMap(
        {
          provider: asProvider(job.sourceProvider),
          providerTrackId: item.sourceTrackId,
        },
        {
          provider: targetProvider,
          providerTrackId: item.targetTrackId!,
          title: item.targetTitle ?? undefined,
          artists: item.targetArtists
            ? (JSON.parse(item.targetArtists) as string[])
            : undefined,
          externalUrl: item.targetUrl ?? undefined,
        },
        item.confidence ?? 100,
        item.reason ?? "manual"
      );
    }

    await prisma.transferJob.update({
      where: { id: jobId },
      data: {
        status: failed > 0 ? "partial" : "completed",
        phase: null,
        addedItems: added,
        failedItems: failed,
        skippedItems: skipped,
        processedItems: toAdd.length,
        completedAt: new Date(),
      },
    });
  } finally {
    running.delete(runKey);
  }
}
