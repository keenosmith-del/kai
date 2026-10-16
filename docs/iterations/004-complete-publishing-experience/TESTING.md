# Executed verification

## Automated checks

Executed against local PostgreSQL on port 5434, without resetting the database:

- `cd backend && npm run migrate`: applied 001–004 through the tracked runner, then additive migration 005. Existing idempotent schema was adopted safely.
- `cd backend && npm test`: **15 passed, 0 failed**, including the parent test and 14 journey subtests. Runs use random fixture identifiers, a temporary API listener and temporary image/mail directories; cleanup deletes only fixture records.
- `cd backend && npm run check`: every backend/script/test JavaScript file passed Node syntax validation. The checker propagates failures.
- `cd frontend && npm run build`: passed. Tiptap is split into an on-demand composer chunk; final main bundle is approximately 335 KB and editor chunk 415 KB before gzip. No chunk-size warning remains.
- `cd frontend && npm run lint`: exit 0, **17 advisory warnings**. These concern synchronous resource/form state updates in effects plus the existing SignIn render-time year. Hook-order, missing key/dependency and ref-access warnings found during implementation were addressed. The warnings have not been hidden through configuration changes.
- `git diff --check`: passed. No Git staging, commits, pushes or merges were performed.

### Integration journeys covered

- Email registration/login, session identity/isolation, logout invalidation, origin rejection, reader/admin separation and idempotent one-time onboarding.
- Controlled GitHub token/profile/email responses: invalid OAuth state, PKCE challenge generation, explicit linking, linked returning users, identity conflict, no email-based merge, new reader onboarding and admin role preservation. These are local callback tests, not live provider authorization.
- Persistent rich drafts, private draft access, author ownership, normalized image upload and cross-user media rejection.
- Publish/public reader URLs, PostgreSQL search/tag/topic/format filtering, revision conflicts and rejected script nodes/unsafe URLs.
- Like/unlike, save/unsave, uniqueness, persisted viewer state, author/topic follows/unfollows, actual counts, self-follow rejection, following feed and paginated people lists.
- Comments/replies, author-only editing, administrator moderation, reports and real count changes.
- Follow/like/comment/reply/moderation notifications, deduplication, recipient boundaries, one/all read updates, persisted preferences and notification suppression. Profile handle changes keep follow notification destinations current.
- Profile metadata/unique handles, avatar references/removal, portrait WebP normalization to 512×512, invalid image rejection and referenced/foreign media deletion boundaries.
- Cursor pagination without duplicates while a new publication is inserted; invalid cursors and invalid discussion/notification pages.
- Unpublish/republish, public hiding, ownership-protected deletion and moderator access.
- Local outbox email verification/recovery with hashed expiring one-time tokens, reuse rejection and password-reset session invalidation.
- Suspension invalidates sessions and hides public profiles; restoration preserves the account.

## Browser checks actually performed

Inspected the running app in the Codex browser at desktop **1280×720**, mobile **390×844**, and tablet **820×1180**. Temporary viewport overrides were reset afterward.

Verified with a disposable local reader account:

- Preserved SignIn layout, successful login and the authenticated shared shell.
- New composer loads, title/body entry, Cancel protection, return/save options, backend draft saving and reopening from Drafts.
- Brief-to-story selection, subtitle editing, preview, actual thumbnail upload and visible preview, publication persistence and feed visibility.
- Editorial desktop/mobile/tablet feed composition; circular publication image and author avatar; no horizontal overflow observed in those views.
- Dedicated reader URL, sign-out, guest reading and full reload of the public deep link.
- Like and save changes; Saved collection retained the publication and state after reload.
- A real discussion submission changed both the comment list and count without unmounting the article.
- Sidebar expansion/collapse and independent scrolling: main content width stayed **1280 px**, and scroll position changed from **1192 to 472 px** while expanded; collapse retained **472 px**.
- Rounded mobile drawer, scrollable modal containment, notification panel, Escape dismissal of the panel, close X, outside-click modal dismissal and unsaved Cancel handling.
- Keyboard modal focus wrapping from dialog → last Publish button with Shift+Tab, then Publish → Close with Tab; closing restored focus to the originating New post control.
- Browser console had no errors/warnings in the inspected signed-in/public reader journey.

The disposable browser account and its authored publication, comment, interactions, session records and uploaded media were removed afterward. No fabricated content remains in the feed.

## Checks not claimed

- Live GitHub consent/token exchange and actual SMTP inbox delivery were not exercised. Configure provider credentials/callback and SMTP in the target environment and verify before launch.
- Administrator UI browser inspection was blocked: automatic approval review rejected temporary elevation of the disposable browser account because explicit privilege scope was missing. The account remained a reader. Administrator APIs, identity roles and moderation permissions were exercised in the isolated integration suite.
- Reduced-motion CSS rules were inspected, but an OS-level reduced-motion browser session was not emulated. Mobile checks used browser viewport sizing, not a physical phone/soft keyboard.
- No production deployment, external storage service, multi-instance rate-limit store or email deliverability audit was performed.
- Not every page/interaction received a separate browser screenshot; automated API coverage and build checks complement the listed hands-on journeys.
