import { describe, expect, it } from "vitest";
import {
  AUTO_MATCH_THRESHOLD,
  rankCandidates,
  REVIEW_THRESHOLD,
  scoreCandidate,
} from "@/server/matching/score";
import type { ProviderTrack } from "@/server/providers/types";

const source = {
  title: "Hey Jude",
  artists: ["The Beatles"],
  album: "Hey Jude",
  durationMs: 425000,
  isrc: "GBAYE0601498",
};

function candidate(overrides: Partial<ProviderTrack>): ProviderTrack {
  return {
    provider: "tidal",
    providerTrackId: "t1",
    title: "Hey Jude",
    artists: ["The Beatles"],
    album: "Hey Jude",
    durationMs: 425000,
    ...overrides,
  };
}

describe("scoreCandidate", () => {
  it("gives 100 for exact ISRC match (case-insensitive)", () => {
    const r = scoreCandidate(source, candidate({ isrc: "gbaye0601498" }));
    expect(r.confidence).toBe(100);
    expect(r.reason).toBe("isrc_exact");
  });

  it("auto-matches perfect title/artist/album/duration", () => {
    const r = scoreCandidate({ ...source, isrc: undefined }, candidate({}));
    expect(r.confidence).toBeGreaterThanOrEqual(AUTO_MATCH_THRESHOLD);
  });

  it("auto-matches a YouTube Topic-channel style candidate without album", () => {
    const r = scoreCandidate(
      { ...source, isrc: undefined, album: undefined },
      candidate({
        provider: "youtube",
        title: "Hey Jude",
        artists: ["The Beatles - Topic"],
        album: undefined,
        durationMs: 426000,
      })
    );
    expect(r.confidence).toBeGreaterThanOrEqual(AUTO_MATCH_THRESHOLD);
  });

  it("scores a VEVO 'Artist - Title (Official Video)' candidate at least review-worthy", () => {
    const r = scoreCandidate(
      { ...source, isrc: undefined, album: undefined },
      candidate({
        provider: "youtube",
        title: "The Beatles - Hey Jude (Official Video)",
        artists: ["TheBeatlesVEVO"],
        album: undefined,
        durationMs: 427000,
      })
    );
    expect(r.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
  });

  it("penalizes live versions of studio tracks", () => {
    const studio = scoreCandidate({ ...source, isrc: undefined }, candidate({}));
    const live = scoreCandidate(
      { ...source, isrc: undefined },
      candidate({ title: "Hey Jude (Live)", durationMs: 500000 })
    );
    expect(live.confidence).toBeLessThan(studio.confidence);
    expect(live.confidence).toBeLessThan(AUTO_MATCH_THRESHOLD);
  });

  it("scores unrelated tracks below review threshold", () => {
    const r = scoreCandidate(
      { ...source, isrc: undefined },
      candidate({
        title: "Smells Like Teen Spirit",
        artists: ["Nirvana"],
        album: "Nevermind",
        durationMs: 301000,
      })
    );
    expect(r.confidence).toBeLessThan(REVIEW_THRESHOLD);
  });
});

describe("rankCandidates", () => {
  it("sorts by confidence descending", () => {
    const ranked = rankCandidates({ ...source, isrc: undefined }, [
      candidate({
        providerTrackId: "bad",
        title: "Something Else",
        artists: ["Nobody"],
      }),
      candidate({ providerTrackId: "good" }),
    ]);
    expect(ranked[0].track.providerTrackId).toBe("good");
    expect(ranked[0].confidence).toBeGreaterThan(ranked[1].confidence);
  });
});
