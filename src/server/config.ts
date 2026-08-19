export type MusicProvider = "spotify" | "tidal" | "youtube";

export const PROVIDERS: MusicProvider[] = ["spotify", "tidal", "youtube"];

export function isMusicProvider(value: string): value is MusicProvider {
  return (PROVIDERS as string[]).includes(value);
}

export const appUrl = () =>
  (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

export function providerCredentials(provider: MusicProvider): {
  clientId: string | undefined;
  clientSecret: string | undefined;
} {
  switch (provider) {
    case "spotify":
      return {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      };
    case "youtube":
      return {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      };
    case "tidal":
      return {
        clientId: process.env.TIDAL_CLIENT_ID,
        clientSecret: process.env.TIDAL_CLIENT_SECRET,
      };
  }
}

export function providerConfigured(provider: MusicProvider): boolean {
  return Boolean(providerCredentials(provider).clientId);
}

export const PROVIDER_LABELS: Record<MusicProvider, string> = {
  spotify: "Spotify",
  tidal: "TIDAL",
  youtube: "YouTube",
};
