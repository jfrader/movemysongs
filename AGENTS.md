<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MoveMySongs project notes

Personal single-user playlist transfer app (Spotify/TIDAL/YouTube). Read `docs/SPEC.md` first: it holds the architecture decisions, verified provider API facts (Spotify 2026 endpoint renames, TIDAL JSON:API details, YouTube quota buckets), and the progress checklist — keep it updated when you change things.

- Server logic in `src/server/` (adapters, matching, transfer runner); API routes in `src/app/api/`; UI in `src/app/`.
- SQLite via Prisma 6 (`prisma/dev.db`); tests use a throwaway `prisma/test.db` (never touch dev.db from tests).
- Commands: `npm test` (vitest), `npm run lint`, `npm run typecheck`, `npm run dev`.
- Always use http://127.0.0.1:3000, never localhost (Spotify redirect rules + cookie host matching).
