import { fetchJson } from "@/server/http";
import { searchTitle, normalizeArtist } from "@/server/matching/normalize";
import type {
  ProviderAdapter,
  ProviderCtx,
  ProviderPlaylist,
  ProviderProfile,
  ProviderTrack,
  SearchTrackInput,
} from "@/server/providers/types";

const API = "https://api.spotify.com/v1";

function authHeaders(ctx: ProviderCtx): Record<string, string> {
  return { Authorization: `Bearer ${ctx.accessToken}` };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapSpotifyTrack(t: any): ProviderTrack | null {
  if (!t || t.type === "episode" || t.is_local || !t.id) return null;
  return {
    provider: "spotify",
    providerTrackId: t.id,
    title: t.name,
    artists: (t.artists ?? []).map((a: any) => a.name).filter(Boolean),
    album: t.album?.name ?? undefined,
    durationMs: t.duration_ms ?? undefined,
    isrc: t.external_ids?.isrc ?? undefined,
    imageUrl: t.album?.images?.[0]?.url ?? undefined,
    externalUrl: t.external_urls?.spotify ?? undefined,
  };
}

function mapPlaylist(p: any): ProviderPlaylist {
  return {
    provider: "spotify",
    providerPlaylistId: p.id,
    name: p.name,
    description: p.description || undefined,
    imageUrl: p.images?.[0]?.url ?? undefined,
    trackCount: p.tracks?.total ?? undefined,
    ownerName: p.owner?.display_name ?? undefined,
    isPublic: p.public ?? undefined,
    externalUrl: p.external_urls?.spotify ?? undefined,
  };
}

async function paginate(url: string, ctx: ProviderCtx): Promise<any[]> {
  const items: any[] = [];
  let next: string | null = url;
  while (next) {
    const page: any = await fetchJson(next, { headers: authHeaders(ctx) });
    items.push(...(page.items ?? []));
    next = page.next ?? null;
  }
  return items;
}

export const spotifyAdapter: ProviderAdapter = {
  provider: "spotify",

  async fetchProfile(accessToken: string): Promise<ProviderProfile> {
    const me: any = await fetchJson(`${API}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { providerUserId: me.id, displayName: me.display_name ?? me.id };
  },

  async listPlaylists(ctx) {
    const items = await paginate(`${API}/me/playlists?limit=50`, ctx);
    return items.filter(Boolean).map(mapPlaylist);
  },

  async getPlaylistTracks(ctx, playlistId) {
    const items = await paginate(
      `${API}/playlists/${playlistId}/items?limit=50`,
      ctx
    );
    return items
      .map((item: any) => mapSpotifyTrack(item?.track))
      .filter((t): t is ProviderTrack => t !== null);
  },

  async searchTracks(ctx, input: SearchTrackInput) {
    const title = searchTitle(input.title);
    const artist = normalizeArtist(input.artists[0] ?? "");
    const fielded = artist ? `track:${title} artist:${artist}` : `track:${title}`;

    for (const q of [fielded, `${title} ${artist}`.trim()]) {
      const res: any = await fetchJson(
        `${API}/search?type=track&limit=10&q=${encodeURIComponent(q)}`,
        { headers: authHeaders(ctx) }
      );
      const tracks = (res.tracks?.items ?? [])
        .map(mapSpotifyTrack)
        .filter((t: ProviderTrack | null): t is ProviderTrack => t !== null);
      if (tracks.length > 0) return tracks;
    }
    return [];
  },

  async lookupByIsrc(ctx, isrc) {
    const res: any = await fetchJson(
      `${API}/search?type=track&limit=5&q=${encodeURIComponent(`isrc:${isrc}`)}`,
      { headers: authHeaders(ctx) }
    );
    return (res.tracks?.items ?? [])
      .map(mapSpotifyTrack)
      .filter((t: ProviderTrack | null): t is ProviderTrack => t !== null);
  },

  async getTrack(ctx, trackId) {
    try {
      const t = await fetchJson(`${API}/tracks/${trackId}`, {
        headers: authHeaders(ctx),
      });
      return mapSpotifyTrack(t);
    } catch {
      return null;
    }
  },

  async createPlaylist(ctx, input) {
    const p: any = await fetchJson(
      `${API}/me/playlists`,
      {
        method: "POST",
        headers: { ...authHeaders(ctx), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          description: input.description ?? "Transferred with MoveMySongs",
          public: input.isPublic ?? false,
        }),
      }
    );
    return mapPlaylist(p);
  },

  async addTracksToPlaylist(ctx, playlistId, trackIds) {
    for (let i = 0; i < trackIds.length; i += 100) {
      const chunk = trackIds.slice(i, i + 100);
      await fetchJson(`${API}/playlists/${playlistId}/items`, {
        method: "POST",
        headers: { ...authHeaders(ctx), "Content-Type": "application/json" },
        body: JSON.stringify({ uris: chunk.map((id) => `spotify:track:${id}`) }),
      });
    }
  },

  playlistUrl(playlistId) {
    return `https://open.spotify.com/playlist/${playlistId}`;
  },
};
