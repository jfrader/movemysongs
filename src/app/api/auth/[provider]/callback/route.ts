import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl } from "@/server/config";
import { exchangeCode, type OAuthPending } from "@/server/auth/oauth";
import { saveProviderAccount } from "@/server/auth/tokens";
import { decrypt } from "@/server/crypto";
import { getAdapter } from "@/server/providers/registry";
import { parseProvider } from "@/server/api-helpers";

export const runtime = "nodejs";

function redirectHome(params: Record<string, string>): NextResponse {
  const url = new URL("/", appUrl());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url.toString());
  res.cookies.delete("mms_oauth");
  return res;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  let providerName = "unknown";
  try {
    const provider = parseProvider((await params).provider);
    providerName = provider;
    const url = new URL(req.url);

    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      return redirectHome({ error: `${provider}: ${oauthError}` });
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return redirectHome({ error: `${provider}: missing code or state` });
    }

    const cookieStore = await cookies();
    const pendingRaw = cookieStore.get("mms_oauth")?.value;
    if (!pendingRaw) {
      return redirectHome({ error: `${provider}: login session expired, try again` });
    }
    const pending = JSON.parse(decrypt(pendingRaw)) as OAuthPending;
    if (pending.provider !== provider || pending.state !== state) {
      return redirectHome({ error: `${provider}: state mismatch, try again` });
    }

    const tokens = await exchangeCode(provider, code, pending.verifier);
    const profile = await getAdapter(provider).fetchProfile(tokens.access_token);
    await saveProviderAccount(provider, tokens, profile);

    return redirectHome({ connected: provider });
  } catch (err) {
    console.error(`OAuth callback failed for ${providerName}:`, err);
    const message = err instanceof Error ? err.message : "connection failed";
    return redirectHome({ error: `${providerName}: ${message.slice(0, 200)}` });
  }
}
