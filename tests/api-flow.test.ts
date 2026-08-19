import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { encrypt } from "@/server/crypto";
import { setAdapterForTests } from "@/server/providers/registry";
import type { ProviderAdapter, ProviderTrack } from "@/server/providers/types";

import * as jobsRoute from "@/app/api/transfer/jobs/route";
import * as jobRoute from "@/app/api/transfer/jobs/[id]/route";
import * as executeRoute from "@/app/api/transfer/jobs/[id]/execute/route";
import * as itemRoute from "@/app/api/transfer/jobs/[id]/items/[itemId]/route";
import * as providersRoute from "@/app/api/providers/route";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    title: "Obscure B-Side",
    artists: ["Two"],
    durationMs: 180000,
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

const tidalManual: ProviderTrack = {
  provider: "tidal",
  providerTrackId: "m2",
  title: "Obscure B-Side (Reissue)",
  artists: ["Two"],
  durationMs: 180000,
};

function makeAdapters() {
  const addCalls: Array<{ playlistId: string; trackIds: string[] }> = [];
  const source: ProviderAdapter = {
    provider: "spotify",
    fetchProfile: async () => ({ providerUserId: "u" }),
    listPlaylists: async () => [
      {
        provider: "spotify",
        providerPlaylistId: "src-pl",
        name: "My Mix",
        trackCount: 2,
      },
    ],
    getPlaylistTracks: async () => sourceTracks,
    searchTracks: async () => [],
    getTrack: async () => null,
    createPlaylist: async () => {
      throw new Error("nope");
    },
    addTracksToPlaylist: async () => {
      throw new Error("nope");
    },
    playlistUrl: (id) => `https://open.spotify.com/playlist/${id}`,
  };
  const target: ProviderAdapter = {
    provider: "tidal",
    fetchProfile: async () => ({ providerUserId: "u" }),
    listPlaylists: async () => [],
    getPlaylistTracks: async () => [],
    lookupByIsrc: async (_ctx, isrc) => (isrc === "ISRC1" ? [tidalAlpha] : []),
    searchTracks: async () => [],
    getTrack: async (_ctx, trackId) => (trackId === "m2" ? tidalManual : null),
    createPlaylist: async (_ctx, input) => ({
      provider: "tidal",
      providerPlaylistId: "new-pl",
      name: input.name,
      externalUrl: "https://listen.tidal.com/playlist/new-pl",
    }),
    addTracksToPlaylist: async (_ctx, playlistId, trackIds) => {
      addCalls.push({ playlistId, trackIds });
    },
    playlistUrl: (id) => `https://listen.tidal.com/playlist/${id}`,
  };
  return { source, target, addCalls };
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

const p = <T extends object>(value: T) => Promise.resolve(value);

async function pollJobUntil(
  jobId: string,
  done: (status: string) => boolean
): Promise<Record<string, unknown>> {
  for (let i = 0; i < 100; i++) {
    const res = await jobRoute.GET(
      new Request(`http://x/api/transfer/jobs/${jobId}?items=1`),
      { params: p({ id: jobId }) }
    );
    const body = await json(res);
    const job = body.job as { status: string };
    if (done(job.status)) return body;
    await sleep(50);
  }
  throw new Error("job never reached expected status");
}

beforeEach(async () => {
  await prisma.transferItem.deleteMany();
  await prisma.transferJob.deleteMany();
  await prisma.trackMap.deleteMany();
  await prisma.searchCache.deleteMany();
  await prisma.providerAccount.deleteMany();
  for (const provider of ["spotify", "tidal"]) {
    await prisma.providerAccount.create({
      data: {
        provider,
        providerUserId: "u",
        displayName: "Test",
        accessTokenEnc: encrypt("tok"),
        expiresAt: null,
      },
    });
  }
});

afterEach(() => {
  setAdapterForTests("spotify", null);
  setAdapterForTests("tidal", null);
});

describe("API flow", () => {
  it("reports provider connection status", async () => {
    const res = await providersRoute.GET();
    const body = await json(res);
    const providers = body.providers as Array<{
      provider: string;
      connected: boolean;
    }>;
    expect(providers).toHaveLength(3);
    expect(providers.find((x) => x.provider === "spotify")?.connected).toBe(true);
    expect(providers.find((x) => x.provider === "youtube")?.connected).toBe(false);
  });

  it("runs a full transfer: create -> review -> manual fix -> execute -> report", async () => {
    const { source, target, addCalls } = makeAdapters();
    setAdapterForTests("spotify", source);
    setAdapterForTests("tidal", target);

    // 1. Create the job.
    const createRes = await jobsRoute.POST(
      new Request("http://x/api/transfer/jobs", {
        method: "POST",
        body: JSON.stringify({
          sourceProvider: "spotify",
          sourcePlaylistId: "src-pl",
          sourcePlaylistName: "My Mix",
          targetProvider: "tidal",
          mode: "create_new",
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const { job } = (await json(createRes)) as unknown as { job: { id: string } };

    // 2. Matching runs in the background; poll until review.
    const review = await pollJobUntil(job.id, (s) => s === "needs_review");
    const items = review.items as Array<{
      id: string;
      status: string;
      targetTrackId: string | null;
    }>;
    expect(items).toHaveLength(2);
    expect(items[0].status).toBe("auto_matched");
    expect(items[1].status).toBe("unmatched");

    // 3. Manually fix the unmatched track.
    const patchRes = await itemRoute.PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({ action: "manual", targetTrackId: "m2" }),
      }),
      { params: p({ id: job.id, itemId: items[1].id }) }
    );
    expect(patchRes.status).toBe(200);
    const patched = (await json(patchRes)) as unknown as {
      item: { status: string; targetTrackId: string };
    };
    expect(patched.item.status).toBe("accepted");
    expect(patched.item.targetTrackId).toBe("m2");

    // 4. Execute.
    const execRes = await executeRoute.POST(
      new Request("http://x", { method: "POST" }),
      { params: p({ id: job.id }) }
    );
    expect(execRes.status).toBe(200);

    // 5. Wait for completion and verify the report.
    const final = await pollJobUntil(
      job.id,
      (s) => s === "completed" || s === "partial" || s === "failed"
    );
    const finalJob = final.job as {
      status: string;
      addedItems: number;
      targetPlaylistUrl: string;
    };
    expect(finalJob.status).toBe("completed");
    expect(finalJob.addedItems).toBe(2);
    expect(finalJob.targetPlaylistUrl).toBe(
      "https://listen.tidal.com/playlist/new-pl"
    );
    expect(addCalls).toEqual([{ playlistId: "new-pl", trackIds: ["d1", "m2"] }]);
  });

  it("rejects invalid job payloads", async () => {
    const res = await jobsRoute.POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          sourceProvider: "spotify",
          sourcePlaylistId: "a",
          sourcePlaylistName: "b",
          targetProvider: "spotify",
          mode: "create_new",
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects append jobs without a target playlist", async () => {
    const res = await jobsRoute.POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          sourceProvider: "spotify",
          sourcePlaylistId: "a",
          sourcePlaylistName: "b",
          targetProvider: "tidal",
          mode: "append",
        }),
      })
    );
    expect(res.status).toBe(400);
  });
});
