import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { PROVIDERS, providerConfigured } from "@/server/config";
import { errorResponse } from "@/server/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await prisma.providerAccount.findMany();
    const byProvider = new Map(accounts.map((a) => [a.provider, a]));
    return NextResponse.json({
      providers: PROVIDERS.map((provider) => {
        const account = byProvider.get(provider);
        return {
          provider,
          configured: providerConfigured(provider),
          connected: Boolean(account),
          displayName: account?.displayName ?? null,
          expiresAt: account?.expiresAt?.toISOString() ?? null,
          scopes: account?.scopes ?? null,
          needsReconnect: Boolean(
            account &&
              account.expiresAt &&
              account.expiresAt.getTime() < Date.now() &&
              !account.refreshTokenEnc
          ),
        };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
