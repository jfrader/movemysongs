import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { encrypt } from "@/server/crypto";
import { runExecute, runMatching } from "@/server/transfer/runner";
import { setAdapterForTests } from "@/server/providers/registry";
import type { ProviderAdapter, ProviderTrack } from "@/server/providers/types";

const sourceTracks: ProviderTrack[] = [
  {
    provider: "spotify",
    providerTrackId: "s1",
    title: "Alpha",
    artists: ["One"],
    album: "First",
    durationMs: 200000,
    isrc: "ISRC1",
  },
  {
    provider: "spotify",
    providerTrackId: "s2",
    title: "Beta",
    artists: ["Two"],
    album: "Second",
    durationMs: 180000,
  },
  {
    provider: "spotify",
    providerTrackId: "s3",
    title: "Gamma",
    artists: ["Three"],
    album: "Third",
    durationMs: 240000,
  },
];

const tidalAlpha: ProviderTrack = {
  provider: "tidal",
  providerTrackId: "d1",
  title: "Alpha",
  artists: ["One"],
  album: "First",
  durationMs: 200000,
  isrc: "ISRC1",
};

const tidalBeta: ProviderTrack = {
  provider: "tidal",
  providerTrackId: "d2",
  title: "Beta",
  artists: ["Two"],
  album: "Second",
  durationMs: 180000,
};

type AddCall = { playlistId: string; trackIds: string[] };

function buildAdapters() {
  const addCalls: AddCall[] = [];
  const created: string[] = [];

  const source: ProviderAdapter = {
    provider: "spotify",
    fetchProfile: async () => ({ providerUserId: "u" }),
    listPlaylists: async () => [],
    getPlaylistTracks: async () => sourceTracks,
    searchTracks: async () => [],
    getTrack: async () => null,
    createPlaylist: async () => {
      throw new Error("source should not create playlists");
    },
    addTracksToPlaylist: async () => {
      throw new Error("source should not add tracks");
    },
    playlistUrl: (id) => `https://open.spotify.com/playlist/${id}`,
  };

  const target: ProviderAdapter = {
    provider: "tidal",
    fetchProfile: async () => ({ providerUserId: "u" }),
    listPlaylists: async () => [],
    getPlaylistTracks: async (_ctx, playlistId) =>
      playlistId === "existing-pl" ? [tidalAlpha] : [],
    lookupByIsrc: async (_ctx, isrc) => (isrc === "ISRC1" ? [tidalAlpha] : []),
    searchTracks: async (_ctx, input) =>
      input.title.toLowerCase().includes("beta") ? [tidalBeta] : [],
    getTrack: async () => null,
    createPlaylist: async (_ctx, input) => {
      created.push(input.name);
      return {
        provider: "tidal",
        providerPlaylistId: "new-pl",
        name: input.name,
        externalUrl: "https://listen.tidal.com/playlist/new-pl",
      };
    },
    addTracksToPlaylist: async (_ctx, playlistId, trackIds) => {
      addCalls.push({ playlistId, trackIds });
    },
    playlistUrl: (id) => `https://listen.tidal.com/playlist/${id}`,
  };

  return { source, target, addCalls, created };
}

async function seedAccounts() {
  for (const provider of ["spotify", "tidal"]) {
    await prisma.providerAccount.create({
      data: {
        provider,
        providerUserId: "u",
        displayName: "Test",
        accessTokenEnc: encrypt("access-token"),
        refreshTokenEnc: null,
        expiresAt: null,
      },
    });
  }
}

beforeEach(async () => {
  await prisma.transferItem.deleteMany();
  await prisma.transferJob.deleteMany();
  await prisma.trackMap.deleteMany();
  await prisma.searchCache.deleteMany();
  await prisma.providerAccount.deleteMany();
  await seedAccounts();
});

afterEach(() => {
  setAdapterForTests("spotify", null);
  setAdapterForTests("tidal", null);
});

describe("transfer runner", () => {
  it("matches, executes and reports a create_new transfer end to end", async () => {
    const { source, target, addCalls, created } = buildAdapters();
    setAdapterForTests("spotify", source);
    setAdapterForTests("tidal", target);

    const job = await prisma.transferJob.create({
      data: {
        sourceProvider: "spotify",
        sourcePlaylistId: "src-pl",
        sourcePlaylistName: "My Mix",
        targetProvider: "tidal",
        mode: "create_new",
        targetPlaylistName: "My Mix",
        status: "matching",
      },
    });

    await runMatching(job.id);

    let updated = await prisma.transferJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.status).toBe("needs_review");
    expect(updated.totalItems).toBe(3);
    expect(updated.matchedItems).toBe(2);
    expect(updated.unmatchedItems).toBe(1);

    const items = await prisma.transferItem.findMany({
      where: { jobId: job.id },
      orderBy: { position: "asc" },
    });
    expect(items.map((i) => i.status)).toEqual([
      "auto_matched",
      "auto_matched",
      "unmatched",
    ]);
    expect(items[0].reason).toBe("isrc_exact");
    expect(items[0].targetTrackId).toBe("d1");
    expect(items[1].targetTrackId).toBe("d2");

    await prisma.transferJob.update({
      where: { id: job.id },
      data: { status: "executing" },
    });
    await runExecute(job.id);

    updated = await prisma.transferJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("completed");
    expect(updated.addedItems).toBe(2);
    expect(updated.skippedItems).toBe(1);
    expect(updated.failedItems).toBe(0);
    expect(updated.targetPlaylistId).toBe("new-pl");
    expect(updated.targetPlaylistUrl).toBe(
      "https://listen.tidal.com/playlist/new-pl"
    );

    expect(created).toEqual(["My Mix"]);
    expect(addCalls).toEqual([{ playlistId: "new-pl", trackIds: ["d1", "d2"] }]);

    // Confirmed mappings are remembered for future transfers.
    const maps = await prisma.trackMap.findMany();
    expect(maps).toHaveLength(2);

    const finalItems = await prisma.transferItem.findMany({
      where: { jobId: job.id },
      orderBy: { position: "asc" },
    });
    expect(finalItems.map((i) => i.status)).toEqual(["added", "added", "skipped"]);
  });

  it("skips tracks already present in append mode", async () => {
    const { source, target, addCalls } = buildAdapters();
    setAdapterForTests("spotify", source);
    setAdapterForTests("tidal", target);

    const job = await prisma.transferJob.create({
      data: {
        sourceProvider: "spotify",
        sourcePlaylistId: "src-pl",
        sourcePlaylistName: "My Mix",
        targetProvider: "tidal",
        mode: "append",
        targetPlaylistId: "existing-pl",
        status: "matching",
      },
    });

    await runMatching(job.id);
    await prisma.transferJob.update({
      where: { id: job.id },
      data: { status: "executing" },
    });
    await runExecute(job.id);

    const updated = await prisma.transferJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.status).toBe("completed");
    // Alpha is already in the target playlist -> only Beta is added.
    expect(updated.addedItems).toBe(1);
    expect(updated.skippedItems).toBe(2);
    expect(addCalls).toEqual([{ playlistId: "existing-pl", trackIds: ["d2"] }]);
  });

  it("marks the job failed when the source playlist cannot be fetched", async () => {
    const { target } = buildAdapters();
    setAdapterForTests("tidal", target);
    setAdapterForTests("spotify", {
      ...buildAdapters().source,
      getPlaylistTracks: async () => {
        throw new Error("boom");
      },
    });

    const job = await prisma.transferJob.create({
      data: {
        sourceProvider: "spotify",
        sourcePlaylistId: "src-pl",
        sourcePlaylistName: "My Mix",
        targetProvider: "tidal",
        mode: "create_new",
        status: "matching",
      },
    });

    await expect(runMatching(job.id)).rejects.toThrow("boom");
  });
});
