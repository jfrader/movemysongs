import { NextResponse } from "next/server";
import { getProviderCtx } from "@/server/auth/tokens";
import { getAdapter } from "@/server/providers/registry";
import { errorResponse, parseProvider } from "@/server/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string; id: string }> }
) {
  try {
    const { provider: providerParam, id } = await params;
    const provider = parseProvider(providerParam);
    const ctx = await getProviderCtx(provider);
    const tracks = await getAdapter(provider).getPlaylistTracks(ctx, id);
    return NextResponse.json({ tracks });
  } catch (err) {
    return errorResponse(err);
  }
}
