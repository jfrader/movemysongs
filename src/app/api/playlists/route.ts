import { NextResponse } from "next/server";
import { getProviderCtx } from "@/server/auth/tokens";
import { getAdapter } from "@/server/providers/registry";
import { errorResponse, parseProvider, ApiError } from "@/server/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const providerParam = url.searchParams.get("provider");
    if (!providerParam) throw new ApiError(400, "provider query param required");
    const provider = parseProvider(providerParam);
    const ctx = await getProviderCtx(provider);
    const playlists = await getAdapter(provider).listPlaylists(ctx);
    return NextResponse.json({ playlists });
  } catch (err) {
    return errorResponse(err);
  }
}
