import { prisma } from "@/server/db";
import { decrypt, encrypt } from "@/server/crypto";
import type { MusicProvider } from "@/server/config";
import { refreshAccessToken, type TokenResponse } from "@/server/auth/oauth";
import type { ProviderCtx, ProviderProfile } from "@/server/providers/types";

export class NotConnectedError extends Error {
  constructor(public provider: MusicProvider) {
    super(`${provider} is not connected`);
    this.name = "NotConnectedError";
  }
}

const REFRESH_MARGIN_MS = 2 * 60 * 1000;

export async function saveProviderAccount(
  provider: MusicProvider,
  tokens: TokenResponse,
  profile: ProviderProfile
): Promise<void> {
  const data = {
    providerUserId: profile.providerUserId,
    displayName: profile.displayName ?? null,
    accessTokenEnc: encrypt(tokens.access_token),
    refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
    scopes: tokens.scope ?? null,
    meta: profile.meta ? JSON.stringify(profile.meta) : null,
  };
  await prisma.providerAccount.upsert({
    where: { provider },
    create: { provider, ...data },
    update: data,
  });
}

/**
 * Load the connected account for a provider, refreshing the access token
 * if it expires within the next two minutes.
 */
export async function getProviderCtx(provider: MusicProvider): Promise<ProviderCtx> {
  const account = await prisma.providerAccount.findUnique({ where: { provider } });
  if (!account) throw new NotConnectedError(provider);

  let accessToken = decrypt(account.accessTokenEnc);

  const needsRefresh =
    account.expiresAt !== null &&
    account.expiresAt.getTime() < Date.now() + REFRESH_MARGIN_MS;

  if (needsRefresh) {
    if (!account.refreshTokenEnc) throw new NotConnectedError(provider);
    const refreshed = await refreshAccessToken(
      provider,
      decrypt(account.refreshTokenEnc)
    );
    accessToken = refreshed.access_token;
    await prisma.providerAccount.update({
      where: { provider },
      data: {
        accessTokenEnc: encrypt(refreshed.access_token),
        // Some providers rotate refresh tokens; keep the old one otherwise.
        ...(refreshed.refresh_token
          ? { refreshTokenEnc: encrypt(refreshed.refresh_token) }
          : {}),
        expiresAt: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000)
          : account.expiresAt,
      },
    });
  }

  return {
    accountId: account.id,
    accessToken,
    providerUserId: account.providerUserId ?? undefined,
    meta: account.meta ? (JSON.parse(account.meta) as Record<string, string>) : {},
  };
}
