export type MusicProvider = "spotify" | "tidal" | "youtube";

export type ProviderStatus = {
  provider: MusicProvider;
  configured: boolean;
  connected: boolean;
  displayName: string | null;
  expiresAt: string | null;
  needsReconnect: boolean;
};

export type Playlist = {
  provider: MusicProvider;
  providerPlaylistId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  trackCount?: number;
  ownerName?: string;
  isPublic?: boolean;
  externalUrl?: string;
};

export type Track = {
  provider: MusicProvider;
  providerTrackId: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
  imageUrl?: string;
  externalUrl?: string;
};

export type Candidate = {
  track: Track;
  confidence: number;
  reason: string;
};

export type JobStatus =
  | "matching"
  | "needs_review"
  | "executing"
  | "completed"
  | "partial"
  | "failed"
  | "canceled";

export type Job = {
  id: string;
  sourceProvider: MusicProvider;
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  targetProvider: MusicProvider;
  mode: "create_new" | "append";
  targetPlaylistId: string | null;
  targetPlaylistName: string | null;
  targetPlaylistUrl: string | null;
  status: JobStatus;
  phase: string | null;
  totalItems: number;
  matchedItems: number;
  reviewItems: number;
  unmatchedItems: number;
  processedItems: number;
  addedItems: number;
  skippedItems: number;
  failedItems: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type ItemStatus =
  | "pending"
  | "auto_matched"
  | "needs_review"
  | "unmatched"
  | "accepted"
  | "skipped"
  | "added"
  | "failed";

export type JobItem = {
  id: string;
  position: number;
  sourceTrackId: string;
  title: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  isrc: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  targetTrackId: string | null;
  targetTitle: string | null;
  targetArtists: string[];
  targetUrl: string | null;
  confidence: number | null;
  reason: string | null;
  candidates: Candidate[];
  status: ItemStatus;
  errorMessage: string | null;
};

export const PROVIDER_LABELS: Record<MusicProvider, string> = {
  spotify: "Spotify",
  tidal: "TIDAL",
  youtube: "YouTube",
};

export const PROVIDER_COLORS: Record<MusicProvider, string> = {
  spotify: "#1DB954",
  tidal: "#33FFEE",
  youtube: "#FF0000",
};
