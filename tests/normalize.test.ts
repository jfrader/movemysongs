import { describe, expect, it } from "vitest";
import {
  extractFeaturedArtists,
  normalizeArtist,
  normalizeTitle,
  searchTitle,
  similarity,
  versionMarkers,
} from "@/server/matching/normalize";

describe("normalizeTitle", () => {
  it("removes remaster noise", () => {
    expect(normalizeTitle("Song Title (Remastered 2011)")).toBe("song title");
    expect(normalizeTitle("Hey Jude - Remastered 2015")).toBe("hey jude");
  });

  it("keeps identity-changing markers", () => {
    expect(normalizeTitle("Song (Live)")).toContain("live");
    expect(normalizeTitle("Song (Club Remix)")).toContain("remix");
  });

  it("strips featured artists", () => {
    expect(normalizeTitle("Love Me (feat. Drake)")).toBe("love me");
  });

  it("strips diacritics and normalizes ampersand", () => {
    expect(normalizeTitle("Beyoncé & Jay")).toBe("beyonce and jay");
  });
});

describe("searchTitle", () => {
  it("drops all bracketed extras", () => {
    expect(searchTitle("Bohemian Rhapsody (Live at Wembley)")).toBe(
      "bohemian rhapsody"
    );
  });

  it("drops trailing dash suffixes", () => {
    expect(searchTitle("One More Time - Radio Edit")).toBe("one more time");
  });

  it("falls back to base title if everything is stripped", () => {
    expect(searchTitle("(Live)")).toBe("(live)");
  });
});

describe("extractFeaturedArtists", () => {
  it("extracts from parentheses", () => {
    const r = extractFeaturedArtists("Love Me (feat. Drake)");
    expect(r.title).toBe("Love Me");
    expect(r.featured).toEqual(["Drake"]);
  });

  it("extracts multiple artists", () => {
    const r = extractFeaturedArtists("Track ft. A & B");
    expect(r.featured).toEqual(["A", "B"]);
  });

  it("returns as-is with no feat", () => {
    const r = extractFeaturedArtists("Plain Song");
    expect(r.title).toBe("Plain Song");
    expect(r.featured).toEqual([]);
  });
});

describe("normalizeArtist", () => {
  it("drops leading The", () => {
    expect(normalizeArtist("The Beatles")).toBe("beatles");
  });

  it("drops YouTube Topic suffix", () => {
    expect(normalizeArtist("Queen - Topic")).toBe("queen");
  });

  it("drops VEVO suffix", () => {
    expect(normalizeArtist("TaylorSwiftVEVO")).toBe("taylorswift");
  });
});

describe("similarity", () => {
  it("is 1 for identical strings", () => {
    expect(similarity("hey jude", "hey jude")).toBe(1);
  });

  it("is high for near-identical strings", () => {
    expect(similarity("hey jude", "hey jude remaster")).toBeGreaterThan(0.6);
  });

  it("is low for unrelated strings", () => {
    expect(similarity("hey jude", "smells like teen spirit")).toBeLessThan(0.3);
  });

  it("handles empty input", () => {
    expect(similarity("", "abc")).toBe(0);
  });
});

describe("versionMarkers", () => {
  it("detects live and remix", () => {
    expect(versionMarkers("Song (Live)")).toEqual(new Set(["live"]));
    expect(versionMarkers("Song (Club Remix)")).toEqual(new Set(["remix"]));
    expect(versionMarkers("Song")).toEqual(new Set());
  });
});
