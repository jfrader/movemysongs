import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { errorResponse, ApiError, parseProvider } from "@/server/api-helpers";
import { getProviderCtx } from "@/server/auth/tokens";
import { getAdapter } from "@/server/providers/registry";
import { serializeItem } from "@/server/transfer/serialize";
import type { ProviderTrack } from "@/server/providers/types";
import { AUTO_MATCH_THRESHOLD, REVIEW_THRESHOLD } from "@/server/matching/score";

export const runtime = "nodejs";

const PatchSchema = z.object({
  action: z.enum(["accept", "skip", "choose", "manual", "reset"]),
  targetTrackId: z.string().optional(),
});

type Candidate = { track: ProviderTrack; confidence: number; reason: string };

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const parsed = PatchSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError(400, "Invalid body");
    const { action, targetTrackId } = parsed.data;

    const job = await prisma.transferJob.findUnique({ where: { id } });
    if (!job) throw new ApiError(404, "Job not found");
    if (job.status !== "needs_review") {
      throw new ApiError(409, `Job is ${job.status}; matches can only be edited during review`);
    }
    const item = await prisma.transferItem.findUnique({ where: { id: itemId } });
    if (!item || item.jobId !== id) throw new ApiError(404, "Item not found");

    let data: Record<string, unknown>;

    switch (action) {
      case "accept": {
        if (!item.targetTrackId) throw new ApiError(400, "Item has no match to accept");
        data = { status: "accepted" };
        break;
      }
      case "skip": {
        data = { status: "skipped" };
        break;
      }
      case "choose": {
        if (!targetTrackId) throw new ApiError(400, "targetTrackId required");
        const candidates = item.candidates
          ? (JSON.parse(item.candidates) as Candidate[])
          : [];
        const chosen = candidates.find(
          (c) => c.track.providerTrackId === targetTrackId
        );
        if (!chosen) throw new ApiError(400, "Not one of this item's candidates");
        data = {
          status: "accepted",
          targetTrackId: chosen.track.providerTrackId,
          targetTitle: chosen.track.title,
          targetArtists: JSON.stringify(chosen.track.artists),
          targetUrl: chosen.track.externalUrl ?? null,
          confidence: chosen.confidence,
          reason: "manual",
        };
        break;
      }
      case "manual": {
        if (!targetTrackId) throw new ApiError(400, "targetTrackId required");
        const provider = parseProvider(job.targetProvider);
        const ctx = await getProviderCtx(provider);
        const track = await getAdapter(provider).getTrack(ctx, targetTrackId);
        if (!track) throw new ApiError(404, `Track ${targetTrackId} not found on ${provider}`);
        data = {
          status: "accepted",
          targetTrackId: track.providerTrackId,
          targetTitle: track.title,
          targetArtists: JSON.stringify(track.artists),
          targetUrl: track.externalUrl ?? null,
          confidence: 100,
          reason: "manual",
        };
        break;
      }
      case "reset": {
        const conf = item.confidence ?? 0;
        const status =
          item.targetTrackId && conf >= AUTO_MATCH_THRESHOLD
            ? "auto_matched"
            : item.targetTrackId && conf >= REVIEW_THRESHOLD
              ? "needs_review"
              : "unmatched";
        data = { status };
        break;
      }
    }

    const updated = await prisma.transferItem.update({
      where: { id: itemId },
      data,
    });
    return NextResponse.json({ item: serializeItem(updated) });
  } catch (err) {
    return errorResponse(err);
  }
}
