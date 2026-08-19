import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { matchTrack, saveTrackMap } from "@/server/matching/matcher";
import { setAdapterForTests } from "@/server/providers/registry";
import type { ProviderAdapter, ProviderTrack } from "@/server/providers/types";
import { fakeCtx } from "./helpers";

const sourceTrack = {
  provider: "spotify" as const,
  providerTrackId: "s1",
  title: "Alpha",
  artists: ["One"],
  album: "First",
  durationMs: 200000,
  isrc: "ISRC1",
};

const perfectTidalMatch: ProviderTrack = {
  provider: "tidal",
  providerTrackId: "d1",
  title: "Alpha",
  artists: ["One"],
  album: "First",
  durationMs: 200000,
  isrc: "ISRC1",
  externalUrl: "https://listen.tidal.com/track/d1",
};

function fakeAdapter(overrides: Partial<ProviderAdapter>): ProviderAdapter {
  const fail = (name: string) => async () => {
    throw new Error(`${name} should not be called`);
  };
  return {
    provider: "tidal",
    fetchProfile: fail("fetchProfile") as ProviderAdapter["fetchProfile"],
    listPlaylists: fail("listPlaylists") as ProviderAdapter["listPlaylists"],
    getPlaylistTracks: fail("getPlaylistTracks") as ProviderAdapter["getPlaylistTracks"],
    searchTracks: fail("searchTracks") as ProviderAdapter["searchTracks"],
    getTrack: fail("getTrack") as ProviderAdapter["getTrack"],
    createPlaylist: fail("createPlaylist") as ProviderAdapter["createPlaylist"],
    addTracksToPlaylist: fail("addTracksToPlaylist") as ProviderAdapter["addTracksToPlaylist"],
    playlistUrl: (id) => `https://listen.tidal.com/playlist/${id}`,
    ...overrides,
  };
}

beforeEach(async () => {
  await prisma.trackMap.deleteMany();
  await prisma.searchCache.deleteMany();
});

afterEach(() => {
  setAdapterForTests("tidal", null);
});

describe("matchTrack", () => {
  it("uses a cached TrackMap without touching the provider", async () => {
    await saveTrackMap(
      { provider: "spotify", providerTrackId: "s1" },
      { provider: "tidal", providerTrackId: "d1", title: "Alpha", artists: ["One"] },
      100,
      "isrc_exact"
    );
    setAdapterForTests("tidal", fakeAdapter({}));

    const outcome = await matchTrack(sourceTrack, "tidal", fakeCtx);
    expect(outcome.status).toBe("auto_matched");
    expect(outcome.best?.reason).toBe("cached");
    expect(outcome.best?.track.providerTrackId).toBe("d1");
  });

  it("matches by exact ISRC at confidence 100", async () => {
    setAdapterForTests(
      "tidal",
      fakeAdapter({
        lookupByIsrc: async () => [perfectTidalMatch],
      })
    );
    const outcome = await matchTrack(sourceTrack, "tidal", fakeCtx);
    expect(outcome.status).toBe("auto_matched");
    expect(outcome.best?.confidence).toBe(100);
    expect(outcome.best?.reason).toBe("isrc_exact");
  });

  it("falls back to scored text search when ISRC lookup misses", async () => {
    setAdapterForTests(
      "tidal",
      fakeAdapter({
        lookupByIsrc: async () => [],
        searchTracks: async () => [{ ...perfectTidalMatch, isrc: undefined }],
      })
    );
    const outcome = await matchTrack(sourceTrack, "tidal", fakeCtx);
    expect(outcome.status).toBe("auto_matched");
    expect(outcome.best?.reason).toBe("text_match");
  });

  it("returns unmatched with candidates when nothing scores well", async () => {
    setAdapterForTests(
      "tidal",
      fakeAdapter({
        lookupByIsrc: async () => [],
        searchTracks: async () => [
          {
            provider: "tidal",
            providerTrackId: "bad",
            title: "Totally Different",
            artists: ["Nobody"],
          },
        ],
      })
    );
    const outcome = await matchTrack(sourceTrack, "tidal", fakeCtx);
    expect(outcome.status).toBe("unmatched");
    expect(outcome.best).toBeNull();
    expect(outcome.candidates).toHaveLength(1);
  });

  it("caches search results across calls", async () => {
    let searches = 0;
    setAdapterForTests(
      "tidal",
      fakeAdapter({
        searchTracks: async () => {
          searches++;
          return [{ ...perfectTidalMatch, isrc: undefined }];
        },
      })
    );
    const noIsrc = { ...sourceTrack, isrc: undefined };
    await matchTrack(noIsrc, "tidal", fakeCtx);
    await matchTrack(noIsrc, "tidal", fakeCtx);
    expect(searches).toBe(1);
  });
});
