# API reference

All routes are under `/api`. Requests and responses use JSON, except multipart image upload and image retrieval. Cookie authentication uses `credentials: include`. Mutation requests from browsers must use the configured same origin. Errors use `{ error: string }`; typical statuses are 400 validation, 401 no session, 403 permission/origin, 404 unavailable, 409 conflict, 413 upload size, 429 rate limit and 503 unavailable mail configuration.

## Authentication and security

| Method / path | Access / behavior |
| --- | --- |
| `GET /health` | Database readiness |
| `POST /auth/register` | `{name,email,password}` → reader session, Welcome pending |
| `POST /auth/login` | `{email,password}` → existing account session |
| `GET /auth/me` | `{user}` or `{user:null}`; profile/identity metadata, never password hashes |
| `POST /auth/onboarding/complete` | Signed in; idempotent completion |
| `POST /auth/logout` | Invalidates current session and clears cookie |
| `GET /auth/github` | OAuth/PKCE redirect; `?link=1` requires a current session |
| `GET /auth/github/callback` | Validated provider callback; links only explicitly |
| `POST /security/password` | Signed in; `{current_password,password}`, current password required when set |
| `POST /security/sessions/revoke` | Signed in; invalidate all sessions and rotate the current one |
| `POST /security/email/verify` | Signed in; sends verification link through configured transport |
| `POST /security/password/forgot` | Public/rate limited; `{email}`, generic response |
| `POST /security/token` | `{purpose:'verify'|'reset',token,password?}`; one-time token consumption |

## Publications

`GET /publications` → `{items,hasMore,nextCursor}`. Query: `view=feed|for-you|following|saved|liked|mine|drafts|admin`, `sort=latest|relevance|trending`, `q`, `topic`, `format=brief|story`, `author=<handle>`, `cursor`. Private views require a session; `admin` requires an administrator. Author/admin studios may also filter `status=draft|published`. Cursors are validated against the collection's filters.

`GET /publications/slug/:slug` → `{publication}`. Public published content, with owner/admin access to drafts. Publication responses contain author handle/avatar, actual like/comment counts and viewer-specific like/save states.

| Method / path | Access / body |
| --- | --- |
| `POST /publications` | Signed in; create draft or publish |
| `PATCH /publications/:id` | Author/admin; full editable fields plus current `revision` |
| `DELETE /publications/:id` | Author/admin; cascading content deletion |
| `PUT /publications/:id/interactions` | Signed in; `{kind:'liked'|'saved',active:boolean}`, idempotent |
| `GET /publications/:id/comments?page=1` | Public on published posts; owner/admin on drafts; `{items,hasMore}` |
| `POST /publications/:id/comments` | Signed in; `{body,parent_id?}`; parent must belong to the publication |
| `PATCH /comments/:id` | Commenter only; `{body}` |
| `DELETE /comments/:id` | Commenter, publication author or admin; removes descendant replies |
| `POST /reports` | Signed in; `{reason,publication_id}` or `{reason,comment_id}`; deduplicated by reporter/target |

Publication writable fields: `title`, `summary`, `format`, `topic`, `content` (restricted Tiptap JSON), `body` (plain text fallback), `tags` (array), `sources` (HTTP(S) URL array), `cover_url`, `status`. Server derives `body` from rich content. The server owns author, slug, dates, identifiers and revision increments.

## Profiles, topics and settings

| Method / path | Access / body |
| --- | --- |
| `GET /profiles` | Public suggested people, actual follower counts |
| `GET /profiles/:handle` | Public profile, bio, website, avatar, counts and viewer follow state |
| `GET /profiles/:handle/followers?page=1` | Public paged people list |
| `GET /profiles/:handle/following?page=1` | Public paged people list |
| `PATCH /profile` | Signed in; `{name,handle,bio,website,avatar_url}`; avatar must be owned upload or null |
| `PUT /profiles/:id/follow` | Signed in; `{active:boolean}`; no self-follows |
| `GET /topics` | Public actual publication counts and viewer topic-follow state |
| `PUT /topics/:name/follow` | Signed in; `{active:boolean}` |
| `GET /settings` | Signed in; persisted preferences or defaults |
| `PATCH /settings` | `{feed_density:'comfortable'|'compact',default_feed:'for-you'|'latest'|'following',notification_events:[]}` |

Notification event values: `follow`, `like`, `comment`, `reply`, `moderation`. People/notification/comment page sizes are 30 with validated page bounds.

## Notifications and media

| Method / path | Access / behavior |
| --- | --- |
| `GET /notifications?page=1` | Recipient only; `{items,hasMore,unread}` |
| `PATCH /notifications/read` | `{id}` for one; `{}` for all recipient notifications |
| `POST /media` | Signed in; multipart `image`, optional `kind=avatar`; normalized upload → `{url}` |
| `GET /media/:uuid.webp` | Known public image URL, immutable cache headers |
| `DELETE /media/:uuid.webp` | Owner only; fails 409 while referenced |

## Editorial

| Method / path | Administrator only |
| --- | --- |
| `GET /admin/overview?usersPage=1&reportsPage=1` | Actual totals, open reports and community accounts (100 per page, has-more flags) |
| `PATCH /admin/reports/:id` | Resolve a report |
| `PATCH /admin/users/:id` | `{suspended:boolean}`; cannot suspend yourself or other admins |
| `POST /admin/topics` | `{name}` |
| `PATCH /admin/topics/:name` | `{name}`; rename updates existing publications/topic follows transactionally |

Use `GET /publications?view=admin` for paged publication management. Admin publication changes use the same ownership-aware mutation endpoints and generate moderation notifications for the author.
