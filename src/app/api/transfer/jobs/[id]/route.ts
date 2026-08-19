import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { errorResponse, ApiError } from "@/server/api-helpers";
import { serializeItem, serializeJob } from "@/server/transfer/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const withItems = new URL(req.url).searchParams.get("items") === "1";
    const job = await prisma.transferJob.findUnique({ where: { id } });
    if (!job) throw new ApiError(404, "Job not found");

    if (!withItems) return NextResponse.json({ job: serializeJob(job) });

    const items = await prisma.transferItem.findMany({
      where: { jobId: id },
      orderBy: { position: "asc" },
    });
    return NextResponse.json({
      job: serializeJob(job),
      items: items.map(serializeItem),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.transferJob.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
