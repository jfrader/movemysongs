import type { MusicProvider } from "@/server/config";

export interface ProviderPlaylist {
  provider: MusicProvider;
  providerPlaylistId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  trackCount?: number;
  ownerName?: string;
  isPublic?: boolean;
  externalUrl?: string;
}

export interface ProviderTrack {
  provider: MusicProvider;
  providerTrackId: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
  imageUrl?: string;
  externalUrl?: string;
}

export interface SearchTrackInput {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
}

/** Resolved auth context passed to every adapter call. */
export interface ProviderCtx {
  accountId: string;
  accessToken: string;
  providerUserId?: string;
  /** Provider extras, e.g. TIDAL countryCode. */
  meta: Record<string, string>;
}

export interface ProviderProfile {
  providerUserId: string;
  displayName?: string;
  meta?: Record<string, string>;
}

export interface ProviderAdapter {
  provider: MusicProvider;
  fetchProfile(accessToken: string): Promise<ProviderProfile>;
  listPlaylists(ctx: ProviderCtx): Promise<ProviderPlaylist[]>;
  getPlaylistTracks(ctx: ProviderCtx, playlistId: string): Promise<ProviderTrack[]>;
  searchTracks(ctx: ProviderCtx, input: SearchTrackInput): Promise<ProviderTrack[]>;
  /** Exact catalog lookup by ISRC, when the provider supports it. */
  lookupByIsrc?(ctx: ProviderCtx, isrc: string): Promise<ProviderTrack[]>;
  getTrack(ctx: ProviderCtx, trackId: string): Promise<ProviderTrack | null>;
  createPlaylist(
    ctx: ProviderCtx,
    input: { name: string; description?: string; isPublic?: boolean }
  ): Promise<ProviderPlaylist>;
  addTracksToPlaylist(
    ctx: ProviderCtx,
    playlistId: string,
    trackIds: string[]
  ): Promise<void>;
  playlistUrl(playlistId: string): string;
}
