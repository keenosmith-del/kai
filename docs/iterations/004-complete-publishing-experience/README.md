# Complete publishing experience

## Implemented experience

kai now has one responsive application shell and independent content scroll region, an overlay sidebar, public discovery/search/topics/profiles/readers, authenticated collections, a Tiptap publishing composer, an author studio, notifications, account/security settings, and an administrator editorial desk. No seed publications, generated engagement or invented analytics are used.

The current kailor style guide and implementation were inspected read-only. Shared kai tokens use the #fafafa canvas, white surfaces, Helvetica Neue stack, charcoal text, pill controls, circular avatars/thumbnails, rounded floating surfaces and restrained motion. SignIn and Welcome keep their existing treatments. SignIn gains a recovery link; Welcome and one-time onboarding are preserved.

## Architecture and files

- `frontend/src/App.jsx`: public routes, account guards, onboarding and return destination handling. Public reader routes include `/stories/:slug`, `/publications/:slug` and the legacy `/?publication=:slug` redirect.
- `frontend/src/components/AppShell.*`: shared header, navigation and tokens; content width does not depend on sidebar state. Desktop expansion never disables content scrolling. Mobile uses a dismissible rounded drawer. Collapsed navigation has focus/hover tooltips.
- `frontend/src/components/Feed.jsx`, `PublicationCard.jsx`, `Common.jsx`: server discovery, shared editorial rows/actions, avatars, safe rich rendering, feedback and accessible modal.
- `frontend/src/components/Composer.jsx`: on-demand Tiptap editor, images, rich formatting, preview, persistent drafts, optimistic revision checks and unsaved-change protection. Explicit saving is used; there is no simulated autosave status.
- `frontend/src/hooks`: native Fetch boundary, async resource state, feed cache and notification event copy.
- Page directories: Home, Latest, Trending, Explore, Search, Topics, Publication, Saved, Liked, Following, Followers, Notifications, Profile, Account, Settings, MyStudio, EditorialStudio and Security. Each retains the requested JSX/CSS pair. Shared layout rules live in AppShell.css rather than being duplicated across page stylesheets.
- `backend/src/app.js`: independently importable Express app, shared origin checks, parser limits, rate limits, JSON errors and private API caching policy. `server.js` only starts the listener.
- `backend/src/routes/publications.routes.js`: discovery, lifecycle, ownership, interaction and discussion creation APIs.
- `backend/src/routes/platform.routes.js`: profiles, follows, topics, settings, notifications, comment moderation, reporting, image processing and admin APIs.
- `backend/src/routes/security.routes.js`: passwords, sessions, real one-time verification/recovery links and SMTP/local-outbox transport.
- `backend/src/services/platform.js`: bounded input validation, URL/document allowlists, transaction helper and deduplicated notifications. Existing authentication/session services remain in use.
- `backend/scripts`: migration runner, syntax checker and explicitly disposable browser-test fixture utility. `backend/test/platform.test.js` exercises actual PostgreSQL and API permissions.

The [API reference](API.md) lists request fields, routes and permissions.

## Migrations and data

Run from `backend`:

```sh
npm run migrate
```

`004_complete_publishing.sql` adds:

- Unique lowercase-editable user handles, biographies, websites, avatar references and moderation suspension. Existing users receive collision-free `reader-<uuid>` handles; new registrations get handles through a database trigger.
- Restricted JSON publication documents, tags, sources and revision numbers. Existing plain-text publications continue to render without conversion.
- Topics and separate author/topic follow relationships, with uniqueness and no-self-follow constraints.
- Threaded comments with parent ownership/publication validation and cascading reply deletion.
- Recipient/actor/event notifications, optional related content, destination, creation/read timestamps and a unique event deduplication key.
- Reports for publications or comments; media ownership metadata; reader feed/default/notification settings; hashed, expiring account tokens.
- Full-text publication search index and notification/follow/comment indexes.

`005_publishing_indexes.sql` adds indexes for author studios, engagement counts and recent interactions, comment parents, media ownership, token cleanup and report retrieval.

The runner takes a PostgreSQL advisory lock, tracks each filename/checksum in `schema_migrations`, rejects edits to applied files, and applies each new migration transactionally. It strips only the legacy migration 003's standalone transaction wrapper. Existing idempotent migrations are safely adopted on the first tracked run. No accounts, sessions or authored records are reset.

## Authentication and permissions

All public reading/discovery/profile endpoints work without a session. Private collections, authoring, profile edits, comments, interactions, follow relationships and notifications require a valid non-suspended user session. Authentication is enforced on the server. A reader can publish and remains a reader. Only administrators can manage topics/users/reports or access all private drafts; authors can manage their own work. Authors and admins can remove discussion comments on their posts; only the commenter can edit their wording.

Sessions keep hashed tokens in PostgreSQL, HttpOnly/Lax cookies and production Secure cookies. Temporary `/auth/me` failures show a retry state and never assert a confirmed logout. Mutations enforce the configured Origin and reject cross-site Fetch Metadata. Requests without Origin remain usable by non-browser clients; browsers receive no permissive CORS policy. General/mutation/auth/security rate limits constrain abuse. Image uploads have byte, decoder pixel and daily account limits.

GitHub retains state and PKCE checks, verified provider-email registration, explicit session-bound linking, identity uniqueness and role preservation. Login/linking never overwrites a manually uploaded avatar. Email equality alone does not merge accounts. Suspension invalidates sessions and excludes the user from public discovery until restored.

Password changes require the current password when one exists; a signed-in GitHub-only account can set its first password. Password changes and recovery invalidate other sessions. Revoking other sessions rotates the current session. Verification/reset links contain random one-time tokens, stored only as SHA-256 hashes with expirations. Recovery responses avoid revealing whether an address exists.

## Publishing and content safety

Create a brief or story with a title, optional subtitle, rich body, topic, tags, source URLs and thumbnail. Save creates a private PostgreSQL draft, available across sessions. Publishing requires a 5–180 character title and 20–100,000 characters of content. Draft titles may be shorter. Tags are limited to 12 and sources to 20. The composer provides inline media, headings, emphasis, lists, links and quotes.

Permanent slugs remain stable through title edits. Updates require the last `revision`; conflicting saves return 409 instead of overwriting newer writing. Unpublishing preserves the original publication timestamp and discussion while hiding the post publicly; republishing restores that permanent URL. Deletion requires an in-app confirmation and removes associated discussions/interactions/reports. Admin edits, removals and user moderation create relevant notifications.

The server recursively validates node/mark types, nesting/count limits and URL protocols, rebuilds the allowed document tree and derives searchable plain text. React renders supported nodes directly; arbitrary HTML and script URLs are never inserted. Legacy text is escaped by React. Full reader media uses editorial rounding; feed images remain circular.

## Discovery and pagination

PostgreSQL searches titles, summaries, bodies, topics, author names/handles and tags, with language-aware full-text queries/ranking for article text. Topic/format filters and query/sort selections live in the URL. Search input is debounced. Latest orders by actual publication date. For you prioritizes followed authors (2) and topics (1), then recent items; guests and readers without follows receive recent public work. Following includes only followed authors.

Trending uses real likes plus twice the comment count from the previous seven days, divided by `(2 + ageInHours)^0.6`. The query's time anchor is carried through pagination. For you adds preference priority to the selected ranking. No fake share counts are recorded.

Publication discovery/studios use 12-item keyset pages ordered by rank, timestamp and UUID, with microsecond-precision cursor timestamps. New posts after the first page's time anchor do not move into later pages. Live edits/deletions, unlikes and preference changes can still affect a ranked collection between requests; refresh starts a new view. Discussion, notification and people lists use bounded pages of 30. Feed data/scroll position is retained during normal in-app return navigation; reload fetches fresh persisted state.

## Notifications

Events: author follows, publication likes/comments, replies to another reader and editorial actions. Self-actions are suppressed. Likes/follows deduplicate by actor/target; comments/replies by event ID. Notifications are inserted within the related transaction and respect persisted per-event in-app preferences. Removing a related comment/publication removes dependent notifications; editorial removal notices use a surviving destination.

The bell refreshes on opening, window focus and at most every 90 seconds while visible. It includes unread counts, outside/Escape dismissal, mark-all-read and the full notification page. Recipient-scoped updates prevent one reader from marking another's notifications. No email notification delivery or real-time subscription is advertised.

## Media and email configuration

Copy `backend/.env.example` without overwriting existing secrets. See [environment reference](ENVIRONMENT.md).

Uploads accept JPEG/PNG/WebP/AVIF up to 8 MiB, reject unsupported or undecodable input, cap source pixels at 40 million and normalize to WebP with orientation metadata removed. Avatars become 512×512 portraits; other images fit within 1800×1800. Avatar previews are circular and server cropping uses attention positioning. Interactive manual crop/reposition is not included.

Media uses generated UUID filenames, a database owner reference and fixed content types. Clients cannot choose filesystem paths. Only an owner can delete unused media; referenced images return 409. Uploads can be replaced/removed from profiles or posts without overwriting other readers' files.

Development defaults to `backend/uploads`. Production must mount durable shared storage at `MEDIA_DIR`, back it up and restore it with PostgreSQL. A multi-instance deployment must share that store; ephemeral containers are unsupported. Object storage can replace this boundary later without changing publication IDs. Unreferenced uploads are retained for safe reuse; production needs a retention policy/maintenance job for unused files. They are never silently represented as durable on ephemeral hosting.

Set SMTP variables for real delivery. Without SMTP, local development can explicitly write private message JSON files to `MAIL_OUTBOX_DIR`; UI feedback identifies the local-outbox result. Production without SMTP returns a configuration error. Local outbox files contain credential links, are private and ignored by Git, and must never be served publicly. Provider acceptance is not a guarantee of inbox delivery.

## Local commands and deployment

See the [root README](../../../README.md). Run PostgreSQL, install both lockfiles, configure environment, run migrations, start the API on 5051 and Vite on 5175. PostgreSQL remains exposed locally on 5434. `VITE` development proxy routes `/api` to the backend; no deployment hostname is hardcoded into frontend calls.

Production builds use `cd frontend && npm run build`. Serve `frontend/dist` behind HTTPS with SPA fallback and same-origin `/api` proxy to Express. Set `NODE_ENV=production`, exact `APP_ORIGIN`, GitHub callback/secrets, durable PostgreSQL/media storage, SMTP and a correct proxy-hop count if needed. Provision administrator roles through trusted database operations rather than self-service APIs. Use one API instance with the current in-memory rate limiter, or introduce a shared rate-limit store before horizontal deployment.

## Verification and remaining limits

See [testing results](TESTING.md). Live GitHub authorization and actual SMTP delivery require deployment/provider checks; controlled GitHub response tests exercise the local identity/linking logic. The implementation uses manual draft saving, server-selected avatar cropping and modest notification polling. No account deletion/privacy controls or email subscriptions are exposed. Admin user/report lists use bounded pages of 100; publication management uses keyset pagination.

All changes are left uncommitted. The pre-existing root `.DS_Store` modification is preserved.
