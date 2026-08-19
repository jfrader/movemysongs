import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { errorResponse, parseProvider } from "@/server/api-helpers";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const provider = parseProvider((await params).provider);
    await prisma.providerAccount.deleteMany({ where: { provider } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
