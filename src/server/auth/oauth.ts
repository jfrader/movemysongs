import { createHash, randomBytes } from "crypto";
import { appUrl, providerCredentials, type MusicProvider } from "@/server/config";
import { fetchJson, formBody } from "@/server/http";

export type OAuthDescriptor = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  extraAuthParams?: Record<string, string>;
  clientAuth: "basic" | "body";
  usePkce: boolean;
  /** TIDAL is a public PKCE client: never send a client secret. */
  omitSecret?: boolean;
};

export function oauthDescriptor(provider: MusicProvider): OAuthDescriptor {
  const { clientSecret } = providerCredentials(provider);
  switch (provider) {
    case "spotify":
      return {
        authorizeUrl: "https://accounts.spotify.com/authorize",
        tokenUrl: "https://accounts.spotify.com/api/token",
        scopes: [
          "playlist-read-private",
          "playlist-read-collaborative",
          "playlist-modify-private",
          "playlist-modify-public",
        ],
        // With a client secret use the standard code flow; otherwise PKCE.
        clientAuth: clientSecret ? "basic" : "body",
        usePkce: !clientSecret,
      };
    case "youtube":
      return {
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/youtube"],
        extraAuthParams: { access_type: "offline", prompt: "consent" },
        clientAuth: "body",
        usePkce: false,
      };
    case "tidal":
      return {
        authorizeUrl: "https://login.tidal.com/authorize",
        tokenUrl: "https://auth.tidal.com/v1/oauth2/token",
        scopes: ["user.read", "playlists.read", "playlists.write", "search.read"],
        clientAuth: "body",
        usePkce: true,
        omitSecret: true,
      };
  }
}

export function redirectUri(provider: MusicProvider): string {
  return `${appUrl()}/api/auth/${provider}/callback`;
}

export type OAuthPending = {
  provider: MusicProvider;
  state: string;
  verifier?: string;
};

export function buildAuthorizeUrl(provider: MusicProvider): {
  url: string;
  pending: OAuthPending;
} {
  const { clientId } = providerCredentials(provider);
  if (!clientId) {
    throw new Error(`Missing client id for ${provider}. Fill in your .env file.`);
  }
  const d = oauthDescriptor(provider);
  const state = randomBytes(16).toString("hex");
  const url = new URL(d.authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri(provider));
  url.searchParams.set("scope", d.scopes.join(" "));
  url.searchParams.set("state", state);
  for (const [k, v] of Object.entries(d.extraAuthParams ?? {})) {
    url.searchParams.set(k, v);
  }

  const pending: OAuthPending = { provider, state };
  if (d.usePkce) {
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", challenge);
    pending.verifier = verifier;
  }
  return { url: url.toString(), pending };
}

export type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

async function tokenRequest(
  provider: MusicProvider,
  params: Record<string, string>
): Promise<TokenResponse> {
  const { clientId, clientSecret } = providerCredentials(provider);
  if (!clientId) throw new Error(`Missing client id for ${provider}`);
  const d = oauthDescriptor(provider);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const body: Record<string, string> = { ...params };

  if (d.clientAuth === "basic" && clientSecret) {
    headers.Authorization =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  } else {
    body.client_id = clientId;
    if (clientSecret && !d.omitSecret) body.client_secret = clientSecret;
  }

  return fetchJson<TokenResponse>(d.tokenUrl, {
    method: "POST",
    headers,
    body: formBody(body),
  });
}

export function exchangeCode(
  provider: MusicProvider,
  code: string,
  verifier?: string
): Promise<TokenResponse> {
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(provider),
  };
  if (verifier) params.code_verifier = verifier;
  return tokenRequest(provider, params);
}

export function refreshAccessToken(
  provider: MusicProvider,
  refreshToken: string
): Promise<TokenResponse> {
  return tokenRequest(provider, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}
