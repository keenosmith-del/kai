# kai — Home and discovery (implementation 003)

## Scope

Permanent Home/discovery surface: header with mascot and user account, accessible left sidebar, real PostgreSQL briefs, admin-only quick post, read dialog, server-backed search and topic filters, saved/liked interactions, account summary, GitHub linking entry, per-account reading density, responsive layout and public read-only access.

No fabricated publications, counts or images. Content begins empty until an administrator publishes a brief. Editorial covers are CSS typographic art rather than external stock photos.

## Files to copy

- `frontend/src/pages/Home/Home.jsx` — replace existing file
- `frontend/src/pages/Home/Home.css` — replace existing file
- `frontend/src/App.jsx` — replace existing file (preserves Welcome and SignIn routes; public access to `/`)
- `backend/src/routes/publications.routes.js` — create new file
- `database/migrations/003_publications.sql` — create new migration

### One manual backend change

In `backend/src/server.js`, add:

```js
import { publicationRouter } from './routes/publications.routes.js';
```

Then directly after `app.use('/api/auth', authRouter);` add:

```js
app.use('/api/publications', publicationRouter);
```

Do not remove the existing auth router, health check or error handler.

## Apply migration (does not reset existing users)

From project root:

```bash
docker compose up -d postgres
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U kai -d kai < database/migrations/003_publications.sql
```

Check:

```bash
docker compose exec postgres psql -U kai -d kai -c '\dt'
```

Expected new tables: `publications`, `publication_interactions`, `reader_preferences`.

## Start

Backend: `cd backend && npm run dev`

Frontend: `cd frontend && npm run dev` (same established Vite port 5175; API 5051).

Open `http://localhost:5175`.

## Verification

1. Signed-out browser: Home loads with empty publications state, Sign in CTA.
2. Signed-in admin: header shows avatar/name and Sign out. Clicking mascot opens sidebar.
3. Admin publishes a brief. It appears in live feed and persists after refresh.
4. Search title/body, filter topic, and open brief reader.
5. Like and save. Verify respective sidebar collections and refresh persistence.
6. Change feed density under Settings and verify it persists after refresh.
7. Account shows GitHub connection status; link navigates through the existing OAuth flow.
8. Reader can like/save/read but sees no Quick post button; backend must reject POST `/api/publications` as 403.
9. On mobile, sidebar, cards and composer remain scrollable and fit screen.
10. First-time sign-in still goes through Welcome, subsequent sign-ins go to Home.

## Notes / future additions

- The browser identity uses initials from the authenticated name because no profile-photo upload has been implemented. This is a legitimate avatar fallback, not fake user data.
- Brief reader is a maintained quick-read modal. Full stories will get a dedicated `/stories/:slug` article page later.
- For production, add image upload/media ownership, long-form composer, topic pages, account settings expansion, comments/moderation and email verification. Avoid storing personal GitHub access tokens on the client.
- Topic naming is shared between the frontend composer and backend validation; when topics become editor-managed, replace this with a `/api/topics` endpoint.
- Do not commit secrets. No Git stage/commit/push commands are included.
