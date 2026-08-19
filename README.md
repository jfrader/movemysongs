# MoveMySongs

Personal playlist transfer app for **Spotify ⇄ TIDAL ⇄ YouTube**. Runs locally
with your own API credentials — connect your accounts, pick a source playlist,
review the track matches, and create (or append to) the equivalent playlist on
another service.

Single-user by design: no login, SQLite on disk, OAuth tokens encrypted at rest
and never sent to the browser.

## How it works

1. Connect two or more providers on the dashboard (OAuth).
2. **New transfer** → pick source playlist → pick target provider → the app
   matches every track against the target catalog:
   - previously confirmed mappings are reused instantly,
   - then exact **ISRC** lookup (Spotify/TIDAL),
   - then text search scored by title/artist/duration/album similarity.
3. Review: ≥90 confidence auto-matches, 70–89 needs your confirmation, below
   that is unmatched. You can pick another candidate, paste a track URL/id
   manually, or skip.
4. Execute: the playlist is created (or appended, skipping duplicates) and you
   get a report with a link plus any failures/skips.

## Setup

Requirements: Node 20+.

```bash
npm install
cp .env.example .env
# fill in TOKEN_ENCRYPTION_KEY:
openssl rand -hex 32
npx prisma migrate dev
npm run dev
```

Then open **http://127.0.0.1:3000** — use that exact origin, not
`localhost:3000` (the OAuth cookies and registered redirect URIs must match).

### Provider credentials (one-time)

**Spotify** — <https://developer.spotify.com/dashboard>

1. Create an app. Redirect URI: `http://127.0.0.1:3000/api/auth/spotify/callback`
   (Spotify rejects `localhost`; the `127.0.0.1` loopback literal is required).
2. Copy Client ID + Client Secret into `.env`.

**YouTube** — <https://console.cloud.google.com>

1. Create a project, enable **YouTube Data API v3**.
2. Configure the OAuth consent screen (External + Testing is fine; add your own
   Google account as a test user).
3. Create an OAuth client (type: Web application) with redirect URI
   `http://127.0.0.1:3000/api/auth/youtube/callback`.
4. Copy Client ID + Client Secret into `.env`.

**TIDAL** — <https://developer.tidal.com/dashboard>

1. Create an app, enable scopes `user.read`, `playlists.read`,
   `playlists.write`, `search.read`.
2. Redirect URI: `http://127.0.0.1:3000/api/auth/tidal/callback`. If the
   dashboard rejects a plain-HTTP URI for your app type, try `localhost` or a
   dev-mode app — TIDAL's production apps require HTTPS redirects.
3. Copy the Client ID into `.env` (TIDAL uses PKCE; no secret is needed).

## Quotas & limitations worth knowing

- **YouTube search is capped at ~100 calls/day** (its own quota bucket), and
  each playlist insert costs 50 units of the separate 10k/day pool (~200 adds
  per day). Matching a big playlist into YouTube may take multiple days —
  search results are cached for 7 days, so re-running the same transfer
  tomorrow resumes cheaply. The job tells you when quota ran out.
- YouTube has no ISRC lookup, so YouTube matches are text/duration based;
  auto-generated "Topic" uploads match best.
- TIDAL's rate limits are unpublished; the app backs off automatically on 429s.
- Matches you confirm are remembered (`TrackMap`), so repeat transfers get
  faster and more accurate.

## Commands

```bash
npm run dev        # dev server on http://127.0.0.1:3000
npm run build      # production build
npm start          # run the production build
npm test           # vitest suite (58 tests, uses a throwaway prisma/test.db)
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Data & privacy

- Everything lives in `prisma/dev.db` (SQLite). Delete it to start fresh.
- OAuth tokens are AES-256-GCM encrypted with `TOKEN_ENCRYPTION_KEY`.
- Disconnecting a provider deletes its tokens.
- Only playlist/track metadata needed for matching is stored.

## Project docs

- [docs/SPEC.md](docs/SPEC.md) — architecture decisions, verified provider API
  facts, and the build progress checklist.
