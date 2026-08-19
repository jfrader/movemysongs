import type { MusicProvider } from "@/server/config";
import type { ProviderAdapter } from "@/server/providers/types";
import { spotifyAdapter } from "@/server/providers/spotify";
import { youtubeAdapter } from "@/server/providers/youtube";
import { tidalAdapter } from "@/server/providers/tidal";

const adapters: Record<MusicProvider, ProviderAdapter> = {
  spotify: spotifyAdapter,
  youtube: youtubeAdapter,
  tidal: tidalAdapter,
};

const overrides = new Map<MusicProvider, ProviderAdapter>();

export function getAdapter(provider: MusicProvider): ProviderAdapter {
  return overrides.get(provider) ?? adapters[provider];
}

/** Test hook: swap an adapter for a fake. */
export function setAdapterForTests(
  provider: MusicProvider,
  adapter: ProviderAdapter | null
): void {
  if (adapter) overrides.set(provider, adapter);
  else overrides.delete(provider);
}
