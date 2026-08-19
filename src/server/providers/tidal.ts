import { fetchJson } from "@/server/http";
import { parseIsoDuration } from "@/server/providers/duration";
import { searchTitle, normalizeArtist } from "@/server/matching/normalize";
import type {
  ProviderAdapter,
  ProviderCtx,
  ProviderPlaylist,
  ProviderProfile,
  ProviderTrack,
  SearchTrackInput,
} from "@/server/providers/types";

// Official TIDAL API v2: JSON:API format, cursor pagination via links.next.
const API = "https://openapi.tidal.com/v2";
const JSONAPI = "application/vnd.api+json";

function headers(token: string, write = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: JSONAPI,
    ...(write ? { "Content-Type": JSONAPI } : {}),
  };
}

function withCountry(url: string, ctx: ProviderCtx): string {
  const country = ctx.meta.countryCode;
  if (!country) return url;
  return `${url}${url.includes("?") ? "&" : "?"}countryCode=${country}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

type Included = Map<string, any>;

function indexIncluded(res: any, into?: Included): Included {
  const map = into ?? new Map<string, any>();
  for (const r of res?.included ?? []) map.set(`${r.type}:${r.id}`, r);
  return map;
}

function relIds(resource: any, rel: string): string[] {
  const data = resource?.relationships?.[rel]?.data;
  if (!data) return [];
  return (Array.isArray(data) ? data : [data]).map((d: any) => d.id);
}

export function mapTidalTrack(resource: any, included: Included): ProviderTrack {
  const attrs = resource.attributes ?? {};
  const artistNames = relIds(resource, "artists")
    .map((id) => included.get(`artists:${id}`)?.attributes?.name)
    .filter(Boolean);
  const albumTitle = relIds(resource, "albums")
    .map((id) => included.get(`albums:${id}`)?.attributes?.title)
    .find(Boolean);
  const title = attrs.version
    ? `${attrs.title} (${attrs.version})`
    : (attrs.title ?? "");
  return {
    provider: "tidal",
    providerTrackId: resource.id,
    title,
    artists: artistNames,
    album: albumTitle ?? undefined,
    durationMs: parseIsoDuration(attrs.duration),
    isrc: attrs.isrc ?? undefined,
    externalUrl: `https://listen.tidal.com/track/${resource.id}`,
  };
}

async function getAllPages(ctx: ProviderCtx, firstUrl: string): Promise<{
  data: any[];
  included: Included;
}> {
  const data: any[] = [];
  const included: Included = new Map();
  let url: string | null = firstUrl;
  while (url) {
    const res: any = await fetchJson(url, { headers: headers(ctx.accessToken) });
    data.push(...(res.data ?? []));
    indexIncluded(res, included);
    const next: string | undefined = res.links?.next;
    url = next ? (next.startsWith("http") ? next : `${API}${next}`) : null;
  }
  return { data, included };
}

/** Batch-fetch full track resources (with artists + albums) by id, keeping order. */
async function fetchTracksByIds(
  ctx: ProviderCtx,
  ids: string[]
): Promise<Map<string, ProviderTrack>> {
  const out = new Map<string, ProviderTrack>();
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const url = withCountry(
      `${API}/tracks?filter[id]=${chunk.join(",")}&include=artists,albums`,
      ctx
    );
    const res: any = await fetchJson(url, { headers: headers(ctx.accessToken) });
    const included = indexIncluded(res);
    for (const r of res.data ?? []) out.set(r.id, mapTidalTrack(r, included));
  }
  return out;
}

function mapPlaylist(p: any): ProviderPlaylist {
  const attrs = p.attributes ?? {};
  return {
    provider: "tidal",
    providerPlaylistId: p.id,
    name: attrs.name ?? "(untitled)",
    description: attrs.description || undefined,
    trackCount: attrs.numberOfItems ?? undefined,
    isPublic: attrs.accessType === "PUBLIC",
    externalUrl:
      attrs.externalLinks?.[0]?.href ?? `https://listen.tidal.com/playlist/${p.id}`,
  };
}

export const tidalAdapter: ProviderAdapter = {
  provider: "tidal",

  async fetchProfile(accessToken: string): Promise<ProviderProfile> {
    const res: any = await fetchJson(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: JSONAPI },
    });
    const attrs = res.data?.attributes ?? {};
    return {
      providerUserId: res.data?.id,
      displayName: attrs.username ?? attrs.email ?? res.data?.id,
      meta: attrs.country ? { countryCode: attrs.country } : {},
    };
  },

  async listPlaylists(ctx) {
    const { data } = await getAllPages(
      ctx,
      `${API}/playlists?filter[owners.id]=me`
    );
    return data.map(mapPlaylist);
  },

  async getPlaylistTracks(ctx, playlistId) {
    const { data } = await getAllPages(
      ctx,
      withCountry(`${API}/playlists/${playlistId}/relationships/items`, ctx)
    );
    const trackIds = data
      .filter((d: any) => d.type === "tracks")
      .map((d: any) => d.id);
    const byId = await fetchTracksByIds(ctx, trackIds);
    return trackIds
      .map((id: string) => byId.get(id))
      .filter((t): t is ProviderTrack => Boolean(t));
  },

  async searchTracks(ctx, input: SearchTrackInput) {
    const q = `${searchTitle(input.title)} ${normalizeArtist(input.artists[0] ?? "")}`.trim();
    const url = withCountry(
      `${API}/searchResults?filter[query]=${encodeURIComponent(q)}&include=tracks`,
      ctx
    );
    const res: any = await fetchJson(url, { headers: headers(ctx.accessToken) });
    const trackIds = (res.included ?? [])
      .filter((r: any) => r.type === "tracks")
      .slice(0, 10)
      .map((r: any) => r.id);
    if (trackIds.length === 0) return [];
    const byId = await fetchTracksByIds(ctx, trackIds);
    return trackIds
      .map((id: string) => byId.get(id))
      .filter((t: ProviderTrack | undefined): t is ProviderTrack => Boolean(t));
  },

  async lookupByIsrc(ctx, isrc) {
    const url = withCountry(
      `${API}/tracks?filter[isrc]=${encodeURIComponent(isrc)}&include=artists,albums`,
      ctx
    );
    const res: any = await fetchJson(url, { headers: headers(ctx.accessToken) });
    const included = indexIncluded(res);
    return (res.data ?? []).map((r: any) => mapTidalTrack(r, included));
  },

  async getTrack(ctx, trackId) {
    const byId = await fetchTracksByIds(ctx, [trackId]);
    return byId.get(trackId) ?? null;
  },

  async createPlaylist(ctx, input) {
    // TIDAL create accepts only name + accessType; description is set via PATCH.
    const res: any = await fetchJson(`${API}/playlists`, {
      method: "POST",
      headers: headers(ctx.accessToken, true),
      body: JSON.stringify({
        data: {
          type: "playlists",
          attributes: {
            name: input.name,
            accessType: input.isPublic ? "PUBLIC" : "UNLISTED",
          },
        },
      }),
    });
    const playlist = mapPlaylist(res.data);
    if (input.description) {
      try {
        await fetchJson(`${API}/playlists/${playlist.providerPlaylistId}`, {
          method: "PATCH",
          headers: headers(ctx.accessToken, true),
          body: JSON.stringify({
            data: {
              type: "playlists",
              id: playlist.providerPlaylistId,
              attributes: { description: input.description },
            },
          }),
        });
      } catch {
        // Description is cosmetic; ignore failures.
      }
    }
    return playlist;
  },

  async addTracksToPlaylist(ctx, playlistId, trackIds) {
    // Max 50 items per request.
    for (let i = 0; i < trackIds.length; i += 50) {
      const chunk = trackIds.slice(i, i + 50);
      await fetchJson(`${API}/playlists/${playlistId}/relationships/items`, {
        method: "POST",
        headers: headers(ctx.accessToken, true),
        body: JSON.stringify({
          data: chunk.map((id) => ({ type: "tracks", id })),
        }),
      });
    }
  },

  playlistUrl(playlistId) {
    return `https://listen.tidal.com/playlist/${playlistId}`;
  },
};
