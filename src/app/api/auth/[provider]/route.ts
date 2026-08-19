import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/server/auth/oauth";
import { encrypt } from "@/server/crypto";
import { errorResponse, parseProvider } from "@/server/api-helpers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const provider = parseProvider((await params).provider);
    const { url, pending } = buildAuthorizeUrl(provider);
    const res = NextResponse.redirect(url);
    res.cookies.set("mms_oauth", encrypt(JSON.stringify(pending)), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
