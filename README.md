# kai

An independent AI publication and social reading platform. React + Vite, Express and PostgreSQL; native Fetch; cookie sessions; email/password and explicitly linked GitHub identities.

## Local setup

Use Node.js 22.12+ (verified with Node 24) and Docker Compose. The established ports are frontend **5175**, backend **5051**, PostgreSQL **5434**.

```sh
docker compose up -d postgres
cp -n backend/.env.example backend/.env
cd backend
npm ci
npm run migrate
npm run dev
```

In another terminal, from the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open [kai](http://localhost:5175). Guests can browse and read. Register to write, follow, comment and keep a library. New accounts pass through Welcome once. All readers can publish without changing their role. Existing administrator accounts retain editorial access.

Never remove the PostgreSQL volume to upgrade. `npm run migrate` adopts the existing idempotent migrations and applies new files in filename order under a database lock, with a transaction and checksum per migration. Back up the database before production upgrades.

Configure `backend/.env` using the example. Keep `APP_ORIGIN` exact. For GitHub, configure an OAuth application with callback `http://localhost:5175/api/auth/github/callback` and set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. Link an existing account through Account; matching email strings never trigger automatic merging.

Uploads are normalized to WebP in `MEDIA_DIR` (default `backend/uploads` when running from backend). For deployment, mount a durable shared volume at an absolute `MEDIA_DIR` and back it up alongside PostgreSQL. Ephemeral container storage is insufficient. SMTP settings support real verification/recovery email; `MAIL_OUTBOX_DIR` supports private local testing without delivering email.

## Verification

```sh
cd backend
npm run check
npm test
```

The integration tests require a migrated development/test PostgreSQL database via `DATABASE_URL`. They start a temporary API listener, create isolated records, exercise actual SQL and cookie sessions, and clean up only those fixtures. GitHub provider responses are controlled in tests; no real OAuth credentials or external mail delivery are used.

```sh
cd frontend
npm run lint
npm run build
npm run preview -- --port 5175
```

Vite preview alone has no development API proxy. For full production verification, use a same-origin reverse proxy that routes `/api` to Express and serves `frontend/dist`, with SPA fallback for reader/profile routes. Ordinary local testing uses `npm run dev`.

See [iteration 004 documentation](docs/iterations/004-complete-publishing-experience/README.md) for architecture, API reference, migration details, deployment requirements, executed checks and limitations.
