import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { errorResponse, ApiError } from "@/server/api-helpers";
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
    if (!["matching", "needs_review", "executing"].includes(job.status)) {
      throw new ApiError(409, `Job is already ${job.status}`);
    }
    const updated = await prisma.transferJob.update({
      where: { id },
      data: { status: "canceled", phase: null },
    });
    return NextResponse.json({ job: serializeJob(updated) });
  } catch (err) {
    return errorResponse(err);
  }
}
