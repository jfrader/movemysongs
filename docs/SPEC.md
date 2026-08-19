# MoveMySongs — Build Spec & Progress

Personal, single-user playlist transfer app: Spotify ⇄ TIDAL ⇄ YouTube, running
locally with your own API credentials. Simplified from the original
`playlist-sync-nextjs-plan.md`: no multi-user auth, no Postgres/Redis/BullMQ/Docker —
SQLite + in-process background jobs instead.

## Architecture decisions

- **Stack**: Next.js 16 (App Router) + TypeScript + Tailwind 4, Prisma 6 + SQLite, Zod, Vitest.
- **No app login**: single user, runs on `http://127.0.0.1:3000` (Spotify requires the
  `127.0.0.1` loopback literal — `localhost` is rejected for new Spotify apps).
- **Tokens**: encrypted at rest (AES-256-GCM) in SQLite, never sent to the browser.
- **Jobs**: in-process background runner (module singleton), client polls job status.
- **Matching**: TrackMap cache → ISRC exact → cached text search + confidence scoring
  (bands: ≥90 auto, 70–89 review, <70 unmatched).
- **Provider API facts** (verified against official docs Aug 2026):
  - Spotify: `POST /me/playlists` to create; playlist items via `/playlists/{id}/items`
    (max 50 read / 100 add per request); `isrc:` search filter supported.
  - TIDAL: `openapi.tidal.com/v2` JSON:API, PKCE public client (no secret in token
    exchange), scopes `user.read playlists.read playlists.write search.read`, cursor
    pagination via `links.next`, artists require a second `/tracks?include=artists`
    batch call, add-items max 50/request, create has no description field (PATCH after).
  - YouTube: `search.list` capped at **100 calls/day** (own quota bucket);
    `playlistItems.insert` costs 50 units of the 10k/day pool (~200 adds/day).

## Progress

### Done

- [x] Scaffold: create-next-app (Next 16, React 19, Tailwind 4, ESLint), Prisma 6 pinned
- [x] Prisma schema + initial migration (`ProviderAccount`, `TrackMap`, `SearchCache`, `TransferJob`, `TransferItem`)
- [x] `src/server/config.ts` — provider registry, env credential lookup
- [x] `src/server/crypto.ts` — AES-256-GCM token encryption
- [x] `src/server/http.ts` — fetch with retry/backoff, Retry-After, 401 refresh hook
- [x] `src/server/auth/oauth.ts` — generic OAuth2 (+PKCE) engine, per-provider descriptors
- [x] `src/server/auth/tokens.ts` — encrypted token store + proactive refresh
- [x] Matching engine: `normalize.ts` (title/artist normalization, version markers),
      `score.ts` (weighted confidence scoring), `matcher.ts` (TrackMap → ISRC → search)
- [x] Spotify adapter (2026 endpoints: `/me/playlists`, `/playlists/{id}/items`)
- [x] YouTube adapter (title parsing "Artist - Title", ISO8601 durations, quota-aware)
- [x] TIDAL adapter (JSON:API, cursor pagination, artist batch resolution)
- [x] Transfer runner: matching phase (fetch source → match all → needs_review) and
      execute phase (create/append → batched adds with per-item failure isolation →
      TrackMap persistence → completed/partial)
- [x] API routes:
  - `GET/DELETE /api/providers[…]` — connection status, disconnect
  - `GET /api/auth/[provider]` + `/callback` — OAuth flows (state + PKCE cookies)
  - `GET /api/playlists?provider=` and `/api/playlists/[provider]/[id]/tracks`
  - `GET/POST /api/transfer/jobs`, `GET/DELETE /api/transfer/jobs/[id]`
  - `PATCH /api/transfer/jobs/[id]/items/[itemId]` (accept/skip/choose/manual/reset)
  - `POST /api/transfer/jobs/[id]/execute`, `/cancel`
  - `GET /api/health`

- [x] UI: dashboard (connect cards + recent jobs), transfer wizard (source playlist →
      target → review matches → run), job progress/review/report page, history page
- [x] Vitest suite — **58 tests, all passing**:
  - unit: normalize, score (confidence bands, live-version penalty, YouTube title
    handling), ISO8601 duration parsing, token crypto
  - adapters with mocked HTTP: Spotify pagination/search-fallback/chunked adds,
    YouTube title parsing/deleted-video handling, TIDAL JSON:API cursor pagination/
    artist hydration/chunked adds
  - matcher against real SQLite: TrackMap cache, ISRC path, search cache, bands
  - runner end-to-end with fake adapters: create_new + append dedupe + failure paths
  - API flow through real route handlers: create → poll → manual fix → execute → report,
    plus validation errors
- [x] ESLint clean, `tsc --noEmit` clean, production build passes
- [x] Boot smoke test: `/api/health` (db ok), all pages 200, proper 404/400/401
      responses for bad provider/job/payload/not-connected cases
- [x] Docs: README (provider app setup for Spotify/Google/TIDAL, env vars, quotas,
      known limitations), `.env.example`

### To do (requires real accounts — cannot be done by the agent)

- [ ] Create the three provider apps and fill `.env` (see README)
- [ ] Live QA: connect each provider, run a small Spotify → TIDAL transfer, then
      Spotify → YouTube, then TIDAL/YouTube as sources
- [ ] Verify TIDAL dashboard accepts the `http://127.0.0.1:3000` redirect URI
      (community reports suggest dev apps accept localhost; production apps are
      HTTPS-only — flagged during API research)

### Out of scope (for now)

- Scheduled/bidirectional sync, mirror mode with deletes, multi-target jobs
- YouTube Music (official API is video-oriented; YT playlists only)
- Docker/server deployment (runs locally; can be added later)
