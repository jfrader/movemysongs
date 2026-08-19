import { afterEach, describe, expect, it, vi } from "vitest";
import { spotifyAdapter, mapSpotifyTrack } from "@/server/providers/spotify";
import { youtubeAdapter, parseYouTubeVideo } from "@/server/providers/youtube";
import { tidalAdapter } from "@/server/providers/tidal";
import { fakeCtx, installFetchMock } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("spotify adapter", () => {
  const rawTrack = {
    id: "sp1",
    type: "track",
    name: "Hey Jude",
    duration_ms: 425000,
    artists: [{ name: "The Beatles" }],
    album: { name: "Hey Jude", images: [{ url: "http://img" }] },
    external_ids: { isrc: "GBAYE0601498" },
    external_urls: { spotify: "https://open.spotify.com/track/sp1" },
  };

  it("maps track objects and skips local/episode items", () => {
    const t = mapSpotifyTrack(rawTrack);
    expect(t).toMatchObject({
      provider: "spotify",
      providerTrackId: "sp1",
      title: "Hey Jude",
      artists: ["The Beatles"],
      isrc: "GBAYE0601498",
      durationMs: 425000,
    });
    expect(mapSpotifyTrack({ ...rawTrack, is_local: true })).toBeNull();
    expect(mapSpotifyTrack({ ...rawTrack, type: "episode" })).toBeNull();
    expect(mapSpotifyTrack(null)).toBeNull();
  });

  it("paginates playlist items", async () => {
    const mock = installFetchMock();
    mock.on(/\/playlists\/pl1\/items/, (url) =>
      url.searchParams.get("offset") === "1"
        ? { items: [{ track: { ...rawTrack, id: "sp2" } }], next: null }
        : {
            items: [{ track: rawTrack }],
            next: "https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=1",
          }
    );
    const tracks = await spotifyAdapter.getPlaylistTracks(fakeCtx, "pl1");
    expect(tracks.map((t) => t.providerTrackId)).toEqual(["sp1", "sp2"]);
  });

  it("falls back to a plain query when fielded search is empty", async () => {
    const mock = installFetchMock();
    mock.on(/\/search/, (url) =>
      url.searchParams.get("q")?.startsWith("track:")
        ? { tracks: { items: [] } }
        : { tracks: { items: [rawTrack] } }
    );
    const results = await spotifyAdapter.searchTracks(fakeCtx, {
      title: "Hey Jude",
      artists: ["The Beatles"],
    });
    expect(results).toHaveLength(1);
    expect(mock.calls).toHaveLength(2);
  });

  it("creates playlists via /me/playlists and chunks adds at 100", async () => {
    const mock = installFetchMock();
    mock.on(/\/me\/playlists$/, () => ({
      id: "newpl",
      name: "Mix",
      external_urls: { spotify: "https://open.spotify.com/playlist/newpl" },
    }));
    mock.on(/\/playlists\/newpl\/items/, () => ({ snapshot_id: "x" }));

    const playlist = await spotifyAdapter.createPlaylist(fakeCtx, { name: "Mix" });
    expect(playlist.providerPlaylistId).toBe("newpl");

    const ids = Array.from({ length: 150 }, (_, i) => `t${i}`);
    await spotifyAdapter.addTracksToPlaylist(fakeCtx, "newpl", ids);
    const addCalls = mock.calls.filter((c) => c.url.includes("/items"));
    expect(addCalls).toHaveLength(2);
    const firstBody = JSON.parse(String(addCalls[0].init?.body)) as {
      uris: string[];
    };
    expect(firstBody.uris).toHaveLength(100);
    expect(firstBody.uris[0]).toBe("spotify:track:t0");
  });
});

describe("youtube adapter", () => {
  it("parses 'Artist - Title' video titles", () => {
    expect(parseYouTubeVideo("The Beatles - Hey Jude", "SomeChannel")).toEqual({
      title: "Hey Jude",
      artists: ["The Beatles"],
    });
  });

  it("uses topic channel as artist when no dash", () => {
    expect(parseYouTubeVideo("Hey Jude", "The Beatles - Topic")).toEqual({
      title: "Hey Jude",
      artists: ["The Beatles"],
    });
  });

  it("fetches playlist items with durations and skips deleted videos", async () => {
    const mock = installFetchMock();
    mock.on(/\/playlistItems/, () => ({
      items: [
        { contentDetails: { videoId: "v1" } },
        { contentDetails: { videoId: "gone" } },
      ],
    }));
    mock.on(/\/videos/, () => ({
      items: [
        {
          id: "v1",
          snippet: { title: "Artist - Song", channelTitle: "ArtistVEVO" },
          contentDetails: { duration: "PT3M20S" },
        },
      ],
    }));
    const tracks = await youtubeAdapter.getPlaylistTracks(fakeCtx, "PL1");
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      providerTrackId: "v1",
      title: "Song",
      artists: ["Artist"],
      durationMs: 200000,
    });
  });

  it("searches then resolves durations", async () => {
    const mock = installFetchMock();
    mock.on(/\/search/, () => ({
      items: [{ id: { videoId: "v9" }, snippet: { title: "x" } }],
    }));
    mock.on(/\/videos/, () => ({
      items: [
        {
          id: "v9",
          snippet: { title: "Song", channelTitle: "Artist - Topic" },
          contentDetails: { duration: "PT2M" },
        },
      ],
    }));
    const results = await youtubeAdapter.searchTracks(fakeCtx, {
      title: "Song",
      artists: ["Artist"],
    });
    expect(results[0]).toMatchObject({
      providerTrackId: "v9",
      artists: ["Artist"],
      durationMs: 120000,
    });
  });
});

describe("tidal adapter", () => {
  const tidalCtx = { ...fakeCtx, meta: { countryCode: "AR" } };

  const trackResource = {
    type: "tracks",
    id: "251",
    attributes: {
      title: "Alpha",
      isrc: "ISRC251",
      duration: "PT3M5S",
      version: null,
    },
    relationships: {
      artists: { data: [{ type: "artists", id: "a1" }] },
      albums: { data: [{ type: "albums", id: "al1" }] },
    },
  };
  const included = [
    { type: "artists", id: "a1", attributes: { name: "One" } },
    { type: "albums", id: "al1", attributes: { title: "First" } },
  ];

  it("reads playlist items across cursor pages and resolves artists", async () => {
    const mock = installFetchMock();
    mock.on(/\/playlists\/pl9\/relationships\/items/, (url) =>
      url.searchParams.has("page[cursor]")
        ? { data: [{ type: "tracks", id: "252" }], links: {} }
        : {
            data: [{ type: "tracks", id: "251" }],
            links: {
              next: "/playlists/pl9/relationships/items?page%5Bcursor%5D=abc",
            },
          }
    );
    mock.on(/\/tracks\?/, () => ({
      data: [
        trackResource,
        { ...trackResource, id: "252", attributes: { ...trackResource.attributes, title: "Beta", version: "Remix" } },
      ],
      included,
    }));

    const tracks = await tidalAdapter.getPlaylistTracks(tidalCtx, "pl9");
    expect(tracks.map((t) => t.title)).toEqual(["Alpha", "Beta (Remix)"]);
    expect(tracks[0]).toMatchObject({
      artists: ["One"],
      album: "First",
      durationMs: 185000,
      isrc: "ISRC251",
    });
  });

  it("searches via searchResults and hydrates tracks", async () => {
    const mock = installFetchMock();
    mock.on(/\/searchResults/, () => ({
      data: [{ type: "searchResults", id: "q" }],
      included: [{ type: "tracks", id: "251" }],
    }));
    mock.on(/\/tracks\?/, () => ({ data: [trackResource], included }));
    const results = await tidalAdapter.searchTracks(tidalCtx, {
      title: "Alpha",
      artists: ["One"],
    });
    expect(results).toHaveLength(1);
    expect(results[0].artists).toEqual(["One"]);
  });

  it("looks up by ISRC with countryCode", async () => {
    const mock = installFetchMock();
    mock.on(/\/tracks\?/, () => ({ data: [trackResource], included }));
    const results = await tidalAdapter.lookupByIsrc!(tidalCtx, "ISRC251");
    expect(results[0].isrc).toBe("ISRC251");
    expect(mock.calls[0].url).toContain("countryCode=AR");
  });

  it("creates playlists with JSON:API body and chunks adds at 50", async () => {
    const mock = installFetchMock();
    mock.on(/\/playlists\/newpl\/relationships\/items/, () => ({}));
    mock.on(/\/playlists$/, () => ({
      data: { type: "playlists", id: "newpl", attributes: { name: "Mix" } },
    }));

    const playlist = await tidalAdapter.createPlaylist(tidalCtx, { name: "Mix" });
    expect(playlist.providerPlaylistId).toBe("newpl");
    const createBody = JSON.parse(String(mock.calls[0].init?.body)) as {
      data: { type: string; attributes: { name: string; accessType: string } };
    };
    expect(createBody.data.attributes).toEqual({
      name: "Mix",
      accessType: "UNLISTED",
    });

    const ids = Array.from({ length: 60 }, (_, i) => `${i}`);
    await tidalAdapter.addTracksToPlaylist(tidalCtx, "newpl", ids);
    const addCalls = mock.calls.filter((c) =>
      c.url.includes("/relationships/items")
    );
    expect(addCalls).toHaveLength(2);
    const firstAdd = JSON.parse(String(addCalls[0].init?.body)) as {
      data: Array<{ type: string; id: string }>;
    };
    expect(firstAdd.data).toHaveLength(50);
    expect(firstAdd.data[0]).toEqual({ type: "tracks", id: "0" });
  });
});
