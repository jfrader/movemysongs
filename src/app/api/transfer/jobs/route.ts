import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { errorResponse, ApiError } from "@/server/api-helpers";
import { isMusicProvider } from "@/server/config";
import { startMatchingInBackground } from "@/server/transfer/runner";
import { serializeJob } from "@/server/transfer/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateJobSchema = z.object({
  sourceProvider: z.string().refine(isMusicProvider, "unknown provider"),
  sourcePlaylistId: z.string().min(1),
  sourcePlaylistName: z.string().min(1),
  targetProvider: z.string().refine(isMusicProvider, "unknown provider"),
  mode: z.enum(["create_new", "append"]),
  targetPlaylistId: z.string().optional(),
  targetPlaylistName: z.string().optional(),
});

export async function GET() {
  try {
    const jobs = await prisma.transferJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ jobs: jobs.map(serializeJob) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = CreateJobSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues.map((i) => i.message).join(", "));
    }
    const input = parsed.data;
    if (input.sourceProvider === input.targetProvider) {
      throw new ApiError(400, "Source and target must be different providers");
    }
    if (input.mode === "append" && !input.targetPlaylistId) {
      throw new ApiError(400, "append mode requires targetPlaylistId");
    }

    const job = await prisma.transferJob.create({
      data: {
        sourceProvider: input.sourceProvider,
        sourcePlaylistId: input.sourcePlaylistId,
        sourcePlaylistName: input.sourcePlaylistName,
        targetProvider: input.targetProvider,
        mode: input.mode,
        targetPlaylistId: input.targetPlaylistId ?? null,
        targetPlaylistName:
          input.targetPlaylistName ?? input.sourcePlaylistName,
        status: "matching",
        phase: "queued",
      },
    });
    startMatchingInBackground(job.id);
    return NextResponse.json({ job: serializeJob(job) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
