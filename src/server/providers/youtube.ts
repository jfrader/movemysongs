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

import { parseIsoDuration } from "@/server/providers/duration";

const API = "https://www.googleapis.com/youtube/v3";

function authHeaders(ctx: ProviderCtx): Record<string, string> {
  return { Authorization: `Bearer ${ctx.accessToken}` };
}

/**
 * Derive {title, artists} from a YouTube video title + channel name.
 * Handles "Artist - Title", "Artist – Title" and topic/VEVO channels.
 */
export function parseYouTubeVideo(
  videoTitle: string,
  channelTitle: string | undefined
): { title: string; artists: string[] } {
  const channel = (channelTitle ?? "").replace(/\s*-\s*Topic$/i, "").trim();
  const dash = videoTitle.match(/^(.{1,80}?)\s*[-–—]\s+(.+)$/);
  if (dash) {
    const [, left, right] = dash;
    return { title: right.trim(), artists: [left.trim()] };
  }
  return { title: videoTitle.trim(), artists: channel ? [channel] : [] };
}

function mapPlaylist(p: { id: string; snippet?: { title?: string; description?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> }; contentDetails?: { itemCount?: number }; status?: { privacyStatus?: string } }): ProviderPlaylist {
  const thumbs = p.snippet?.thumbnails ?? {};
  const image =
    thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? undefined;
  return {
    provider: "youtube",
    providerPlaylistId: p.id,
    name: p.snippet?.title ?? "(untitled)",
    description: p.snippet?.description || undefined,
    imageUrl: image,
    trackCount: p.contentDetails?.itemCount ?? undefined,
    ownerName: p.snippet?.channelTitle ?? undefined,
    isPublic: p.status?.privacyStatus === "public",
    externalUrl: `https://www.youtube.com/playlist?list=${p.id}`,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapYouTubeVideo(v: any): ProviderTrack {
  const parsed = parseYouTubeVideo(v.snippet?.title ?? "", v.snippet?.channelTitle);
  const thumbs = v.snippet?.thumbnails ?? {};
  return {
    provider: "youtube",
    providerTrackId: v.id,
    title: parsed.title,
    artists: parsed.artists,
    durationMs: parseIsoDuration(v.contentDetails?.duration),
    imageUrl: thumbs.medium?.url ?? thumbs.default?.url ?? undefined,
    externalUrl: `https://www.youtube.com/watch?v=${v.id}`,
  };
}

async function paginate(baseUrl: string, ctx: ProviderCtx): Promise<any[]> {
  const items: any[] = [];
  let pageToken: string | undefined;
  do {
    const url = pageToken ? `${baseUrl}&pageToken=${pageToken}` : baseUrl;
    const page: any = await fetchJson(url, { headers: authHeaders(ctx) });
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}

/** Fetch full video resources (durations) for a list of video ids. */
async function fetchVideos(ctx: ProviderCtx, videoIds: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const res: any = await fetchJson(
      `${API}/videos?part=snippet,contentDetails&maxResults=50&id=${chunk.join(",")}`,
      { headers: authHeaders(ctx) }
    );
    out.push(...(res.items ?? []));
  }
  return out;
}

export const youtubeAdapter: ProviderAdapter = {
  provider: "youtube",

  async fetchProfile(accessToken: string): Promise<ProviderProfile> {
    const res: any = await fetchJson(`${API}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const channel = res.items?.[0];
    if (!channel) {
      throw new Error(
        "No YouTube channel found for this Google account. Create one on youtube.com first."
      );
    }
    return { providerUserId: channel.id, displayName: channel.snippet?.title };
  },

  async listPlaylists(ctx) {
    const items = await paginate(
      `${API}/playlists?part=snippet,contentDetails,status&mine=true&maxResults=50`,
      ctx
    );
    return items.map(mapPlaylist);
  },

  async getPlaylistTracks(ctx, playlistId) {
    const items = await paginate(
      `${API}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}`,
      ctx
    );
    const videoIds = items
      .map((i: any) => i.contentDetails?.videoId)
      .filter(Boolean);
    const videos = await fetchVideos(ctx, videoIds);
    const byId = new Map(videos.map((v: any) => [v.id, v]));
    return videoIds
      .filter((id: string) => byId.has(id)) // skip deleted/private videos
      .map((id: string) => mapYouTubeVideo(byId.get(id)));
  },

  async searchTracks(ctx, input: SearchTrackInput) {
    const q = `${normalizeArtist(input.artists[0] ?? "")} ${searchTitle(input.title)}`.trim();
    const res: any = await fetchJson(
      `${API}/search?part=snippet&type=video&videoCategoryId=10&maxResults=6&q=${encodeURIComponent(q)}`,
      { headers: authHeaders(ctx) }
    );
    const ids = (res.items ?? [])
      .map((i: any) => i.id?.videoId)
      .filter(Boolean);
    if (ids.length === 0) return [];
    const videos = await fetchVideos(ctx, ids);
    return videos.map(mapYouTubeVideo);
  },

  async getTrack(ctx, trackId) {
    const videos = await fetchVideos(ctx, [trackId]);
    return videos.length ? mapYouTubeVideo(videos[0]) : null;
  },

  async createPlaylist(ctx, input) {
    const p: any = await fetchJson(`${API}/playlists?part=snippet,status`, {
      method: "POST",
      headers: { ...authHeaders(ctx), "Content-Type": "application/json" },
      body: JSON.stringify({
        snippet: {
          title: input.name,
          description: input.description ?? "Transferred with MoveMySongs",
        },
        status: { privacyStatus: input.isPublic ? "public" : "private" },
      }),
    });
    return mapPlaylist(p);
  },

  async addTracksToPlaylist(ctx, playlistId, trackIds) {
    // YouTube only supports inserting one playlist item per request (50 quota units each).
    for (const videoId of trackIds) {
      await fetchJson(`${API}/playlistItems?part=snippet`, {
        method: "POST",
        headers: { ...authHeaders(ctx), "Content-Type": "application/json" },
        body: JSON.stringify({
          snippet: {
            playlistId,
            resourceId: { kind: "youtube#video", videoId },
          },
        }),
      });
    }
  },

  playlistUrl(playlistId) {
    return `https://www.youtube.com/playlist?list=${playlistId}`;
  },
};
