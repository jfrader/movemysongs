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
   - then exact track-ID lookup where the provider supports it,
   - then text search scored by title/artist/duration/album similarity.
3. Review: high-confidence matches auto-match, mid-confidence needs your
   confirmation, the rest is unmatched. You can pick another candidate, paste
   a track URL/id manually, or skip.
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

Create an app on each provider's developer portal and copy the credentials
into `.env` (see `.env.example` for the exact variable names and redirect URIs
to register):

- **Spotify** — <https://developer.spotify.com/dashboard>
- **YouTube** — <https://console.cloud.google.com> (enable YouTube Data API v3)
- **TIDAL** — <https://developer.tidal.com/dashboard>

## Quotas & limitations worth knowing

- YouTube search/insert costs are generous per day, but each YouTube API call
  consumes quota — large transfers into YouTube may need multiple days, and
  search results are cached for 7 days so re-running a transfer resumes
  cheaply. The job tells you when quota ran out.
- TIDAL's rate limits are unpublished; the app backs off automatically on 429s.
- Matches you confirm are remembered (`TrackMap`), so repeat transfers get
  faster and more accurate.

## Commands

```bash
npm run dev        # dev server on http://127.0.0.1:3000
npm run build      # production build
npm start          # run the production build
npm test           # vitest suite (uses a throwaway prisma/test.db)
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Data & privacy

- Everything lives in `prisma/dev.db` (SQLite). Delete it to start fresh.
- OAuth tokens are AES-256-GCM encrypted with `TOKEN_ENCRYPTION_KEY`.
- Disconnecting a provider deletes its tokens.
- Only playlist/track metadata needed for matching is stored.

## Project docs

- [docs/SPEC.md](docs/SPEC.md) — architecture decisions, provider API facts,
  and the build progress checklist.
