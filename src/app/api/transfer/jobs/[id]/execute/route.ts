import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { errorResponse, ApiError } from "@/server/api-helpers";
import { startExecuteInBackground } from "@/server/transfer/runner";
import { serializeJob } from "@/server/transfer/serialize";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await prisma.transferJob.findUnique({ where: { id } });
    if (!job) throw new ApiError(404, "Job not found");
    if (job.status !== "needs_review") {
      throw new ApiError(409, `Job is ${job.status}, expected needs_review`);
    }
    const updated = await prisma.transferJob.update({
      where: { id },
      data: { status: "executing", phase: "starting", errorMessage: null },
    });
    startExecuteInBackground(id);
    return NextResponse.json({ job: serializeJob(updated) });
  } catch (err) {
    return errorResponse(err);
  }
}
