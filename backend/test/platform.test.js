import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import "dotenv/config";
const temporary = await mkdtemp(path.join(os.tmpdir(), "kai-integration-"));
process.env.MEDIA_DIR = path.join(temporary, "media");
process.env.MAIL_OUTBOX_DIR = path.join(temporary, "outbox");
delete process.env.SMTP_HOST;
process.env.GITHUB_CLIENT_ID = "integration-client";
process.env.GITHUB_CLIENT_SECRET = "integration-secret";
const { app } = await import("../src/app.js");
const { pool } = await import("../src/db/pool.js");
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}/api`,
  origin = process.env.APP_ORIGIN || "http://localhost:5175";
const prefix = `it004-${randomBytes(5).toString("hex")}`,
  password = "Test-password-004!",
  users = [];
async function request(
  route,
  { method = "GET", body, cookie, expected = 200, requestOrigin = origin } = {},
) {
  const r = await fetch(base + route, {
    method,
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      Origin: requestOrigin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  assert.equal(
    r.status,
    expected,
    `${method} ${route}: ${JSON.stringify(data)}`,
  );
  return { data, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
async function fixture(role) {
  const u = (
    await pool.query(
      "INSERT INTO users(name,email,role,onboarding_completed_at) VALUES($1,$2,$3,now()) RETURNING *",
      [
        `${prefix} ${role}`,
        `${prefix}-${role}@example.test`,
        role === "admin" ? "admin" : "reader",
      ],
    )
  ).rows[0];
  users.push(u.id);
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [createHash("sha256").update(token).digest("hex"), u.id],
  );
  return { ...u, cookie: `kai_session=${token}` };
}
const document = (body) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
});
const draft = {
  title: `${prefix} Research perspective`,
  summary: "An integration test publication.",
  format: "story",
  topic: "Research",
  body: "",
  content: document(
    "This is a thoughtful research perspective with genuine persistent content.",
  ),
  tags: ["evaluation"],
  sources: ["https://example.com/research"],
  cover_url: "",
  status: "draft",
};
try {
  await test("PostgreSQL publishing and account journeys", async (t) => {
    let reader, other, admin, post, comment, reply, image;
    await t.test(
      "registration, one-time onboarding, login, session isolation and origin guard",
      async () => {
        const registered = await request("/auth/register", {
          method: "POST",
          body: { name: prefix, email: `${prefix}@example.test`, password },
          expected: 201,
        });
        reader = { ...registered.data.user, cookie: registered.cookie };
        users.push(reader.id);
        let me = (await request("/auth/me", { cookie: reader.cookie })).data
          .user;
        assert.equal(me.role, "reader");
        assert.equal(me.onboarding_completed_at, null);
        assert.match(me.handle, /^reader-/);
        await request("/auth/onboarding/complete", {
          method: "POST",
          cookie: reader.cookie,
        });
        const first = (await request("/auth/me", { cookie: reader.cookie }))
          .data.user.onboarding_completed_at;
        await request("/auth/onboarding/complete", {
          method: "POST",
          cookie: reader.cookie,
        });
        assert.equal(
          (await request("/auth/me", { cookie: reader.cookie })).data.user
            .onboarding_completed_at,
          first,
        );
        reader = { ...me, cookie: reader.cookie };
        const login = await request("/auth/login", {
          method: "POST",
          body: { email: reader.email, password },
        });
        assert.equal(login.data.user.id, reader.id);
        assert.ok(login.cookie);
        await request("/auth/logout", { method: "POST", cookie: login.cookie });
        assert.equal(
          (await request("/auth/me", { cookie: login.cookie })).data.user,
          null,
        );
        await request("/auth/logout", {
          method: "POST",
          cookie: reader.cookie,
          requestOrigin: "https://evil.test",
          expected: 403,
        });
        other = await fixture("other");
        admin = await fixture("admin");
        await request("/admin/overview", {
          cookie: reader.cookie,
          expected: 403,
        });
        await request("/publications?view=saved", { expected: 401 });
      },
    );
    await t.test(
      "GitHub OAuth state, explicit linking, returning identities and role preservation",
      async () => {
        const realFetch = globalThis.fetch;
        let providerId = 90000401,
          providerEmail = `${prefix}-github@example.test`;
        globalThis.fetch = async (input, options) => {
          const target = String(input);
          if (target === "https://github.com/login/oauth/access_token")
            return Response.json({ access_token: "test-only-provider-token" });
          if (target === "https://api.github.com/user")
            return Response.json({
              id: providerId,
              name: "GitHub test reader",
              login: "github-reader",
            });
          if (target.startsWith("https://api.github.com/user/emails"))
            return Response.json([
              { email: providerEmail, verified: true, primary: true },
            ]);
          return realFetch(input, options);
        };
        async function oauth(cookie, link = false, invalid = false) {
          const begin = await fetch(
            base + `/auth/github${link ? "?link=1" : ""}`,
            { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" },
          );
          assert.equal(begin.status, 302);
          const cookies = begin.headers
            .getSetCookie()
            .map((c) => c.split(";")[0]);
          const state = new URL(begin.headers.get("location")).searchParams.get(
            "state",
          );
          assert.ok(
            new URL(begin.headers.get("location")).searchParams.get(
              "code_challenge",
            ),
          );
          return fetch(
            base +
              `/auth/github/callback?code=integration&state=${invalid ? "bad-state" : state}`,
            {
              headers: {
                Cookie: [cookie, ...cookies].filter(Boolean).join("; "),
              },
              redirect: "manual",
            },
          );
        }
        try {
          assert.match(
            (await oauth(null, false, true)).headers.get("location"),
            /github_invalid_state/,
          );
          assert.match(
            (await oauth(reader.cookie, true)).headers.get("location"),
            /github_linked/,
          );
          assert.equal(
            (await request("/auth/me", { cookie: reader.cookie })).data.user
              .github_connected,
            true,
          );
          let returned = await oauth();
          let cookie = returned.headers
            .getSetCookie()
            .find((c) => c.startsWith("kai_session="))
            ?.split(";")[0];
          assert.ok(cookie);
          assert.equal(
            (await request("/auth/me", { cookie })).data.user.id,
            reader.id,
          );
          assert.match(
            (await oauth(other.cookie, true)).headers.get("location"),
            /github_in_use/,
          );
          providerId++;
          await oauth(admin.cookie, true);
          returned = await oauth();
          cookie = returned.headers
            .getSetCookie()
            .find((c) => c.startsWith("kai_session="))
            ?.split(";")[0];
          const adminMe = (await request("/auth/me", { cookie })).data.user;
          assert.equal(adminMe.id, admin.id);
          assert.equal(adminMe.role, "admin");
          providerId++;
          returned = await oauth();
          cookie = returned.headers
            .getSetCookie()
            .find((c) => c.startsWith("kai_session="))
            ?.split(";")[0];
          const githubUser = (await request("/auth/me", { cookie })).data.user;
          users.push(githubUser.id);
          assert.equal(githubUser.role, "reader");
          assert.equal(githubUser.onboarding_completed_at, null);
          await request("/auth/onboarding/complete", {
            method: "POST",
            cookie,
          });
          providerId++;
          providerEmail = reader.email;
          assert.match(
            (await oauth()).headers.get("location"),
            /account_exists/,
          );
        } finally {
          globalThis.fetch = realFetch;
        }
      },
    );
    await t.test(
      "rich draft, private access, upload normalization and ownership",
      async () => {
        const form = new FormData();
        form.append(
          "image",
          new Blob(
            [
              await sharp({
                create: {
                  width: 200,
                  height: 100,
                  channels: 3,
                  background: "#aaaaaa",
                },
              })
                .png()
                .toBuffer(),
            ],
            { type: "image/png" },
          ),
          "cover.png",
        );
        image = (
          await request("/media", {
            method: "POST",
            body: form,
            cookie: reader.cookie,
            expected: 201,
          })
        ).data.url;
        const r = await fetch(base + image.replace("/api", ""));
        assert.equal(r.status, 200);
        const meta = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
        assert.equal(meta.format, "webp");
        post = (
          await request("/publications", {
            method: "POST",
            cookie: reader.cookie,
            body: { ...draft, cover_url: image },
            expected: 201,
          })
        ).data.publication;
        assert.equal(post.status, "draft");
        await request(`/publications/slug/${post.slug}`, { expected: 404 });
        await request(`/publications/slug/${post.slug}`, {
          cookie: other.cookie,
          expected: 404,
        });
        await request(`/publications/${post.id}`, {
          method: "PATCH",
          cookie: other.cookie,
          body: { ...post, cover_url: "" },
          expected: 403,
        });
        await request("/publications", {
          method: "POST",
          cookie: other.cookie,
          body: { ...draft, cover_url: image },
          expected: 403,
        });
        assert.equal(
          (
            await request("/publications?view=drafts", {
              cookie: reader.cookie,
            })
          ).data.items[0].id,
          post.id,
        );
      },
    );
    await t.test(
      "publish, public deep link, search, filters, revision conflict and safe content",
      async () => {
        post = (
          await request(`/publications/${post.id}`, {
            method: "PATCH",
            cookie: reader.cookie,
            body: { ...post, status: "published" },
          })
        ).data.publication;
        assert.ok(
          (await request(`/publications/slug/${post.slug}`)).data.publication
            .published_at,
        );
        for (const q of [prefix, "evaluation", "Research"])
          assert.ok(
            (
              await request(
                `/publications?q=${encodeURIComponent(q)}&sort=relevance`,
              )
            ).data.items.some((p) => p.id === post.id),
          );
        assert.ok(
          (
            await request("/publications?topic=Research&format=story")
          ).data.items.some((p) => p.id === post.id),
        );
        await request(`/publications/${post.id}`, {
          method: "PATCH",
          cookie: reader.cookie,
          body: { ...post, revision: post.revision - 1 },
          expected: 409,
        });
        await request(`/publications/${post.id}`, {
          method: "PATCH",
          cookie: reader.cookie,
          body: {
            ...post,
            content: { type: "doc", content: [{ type: "script" }] },
          },
          expected: 400,
        });
        await request("/publications", {
          method: "POST",
          cookie: reader.cookie,
          body: { ...draft, sources: ["javascript:alert(1)"] },
          expected: 400,
        });
      },
    );
    await t.test(
      "likes, saved state, idempotency and notifications",
      async () => {
        for (let i = 0; i < 2; i++)
          await request(`/publications/${post.id}/interactions`, {
            method: "PUT",
            cookie: other.cookie,
            body: { kind: "liked", active: true },
          });
        let p = (
          await request(`/publications/slug/${post.slug}`, {
            cookie: other.cookie,
          })
        ).data.publication;
        assert.equal(p.like_count, 1);
        assert.equal(p.is_liked, true);
        await request(`/publications/${post.id}/interactions`, {
          method: "PUT",
          cookie: other.cookie,
          body: { kind: "saved", active: true },
        });
        assert.ok(
          (
            await request("/publications?view=saved", { cookie: other.cookie })
          ).data.items.some((p) => p.id === post.id),
        );
        assert.ok(
          (
            await request("/publications?view=liked", { cookie: other.cookie })
          ).data.items.some((p) => p.id === post.id),
        );
        assert.equal(
          (
            await request("/notifications", { cookie: reader.cookie })
          ).data.items.filter((n) => n.event === "like").length,
          1,
        );
        await request(`/publications/${post.id}/interactions`, {
          method: "PUT",
          cookie: other.cookie,
          body: { kind: "liked", active: false },
        });
        assert.equal(
          (await request(`/publications/slug/${post.slug}`)).data.publication
            .like_count,
          0,
        );
      },
    );
    await t.test(
      "author follows, topic follows, following feed, self-follow prevention and deduplication",
      async () => {
        for (let i = 0; i < 2; i++)
          await request(`/profiles/${reader.id}/follow`, {
            method: "PUT",
            cookie: other.cookie,
            body: { active: true },
          });
        await request(`/profiles/${reader.id}/follow`, {
          method: "PUT",
          cookie: reader.cookie,
          body: { active: true },
          expected: 400,
        });
        assert.equal(
          (
            await request(`/profiles/${reader.handle}`, {
              cookie: other.cookie,
            })
          ).data.profile.follower_count,
          1,
        );
        assert.ok(
          (
            await request("/publications?view=following", {
              cookie: other.cookie,
            })
          ).data.items.some((p) => p.id === post.id),
        );
        await request("/topics/Research/follow", {
          method: "PUT",
          cookie: other.cookie,
          body: { active: true },
        });
        assert.equal(
          (await request("/topics", { cookie: other.cookie })).data.items.find(
            (t) => t.name === "Research",
          ).is_followed,
          true,
        );
        assert.equal(
          (await request(`/profiles/${reader.handle}/followers`)).data.items[0]
            .id,
          other.id,
        );
      },
    );
    await t.test(
      "comments, replies, editing, permissions, reporting and moderation",
      async () => {
        comment = (
          await request(`/publications/${post.id}/comments`, {
            method: "POST",
            cookie: other.cookie,
            body: { body: "A thoughtful comment." },
            expected: 201,
          })
        ).data.comment;
        reply = (
          await request(`/publications/${post.id}/comments`, {
            method: "POST",
            cookie: reader.cookie,
            body: { body: "A reply from the author.", parent_id: comment.id },
            expected: 201,
          })
        ).data.comment;
        await request(`/comments/${comment.id}`, {
          method: "PATCH",
          cookie: reader.cookie,
          body: { body: "Unauthorized edit" },
          expected: 403,
        });
        await request(`/comments/${comment.id}`, {
          method: "PATCH",
          cookie: other.cookie,
          body: { body: "Updated perspective." },
        });
        assert.equal(
          (await request(`/publications/${post.id}/comments`)).data.items
            .length,
          2,
        );
        await request("/reports", {
          method: "POST",
          cookie: reader.cookie,
          body: {
            comment_id: comment.id,
            reason: "Review this test discussion",
          },
          expected: 201,
        });
        const overview = (
          await request("/admin/overview", { cookie: admin.cookie })
        ).data;
        assert.ok(overview.reports.some((r) => r.comment_id === comment.id));
        assert.ok(
          (
            await request("/notifications", { cookie: reader.cookie })
          ).data.items.some((n) => n.event === "comment"),
        );
        assert.ok(
          (
            await request("/notifications", { cookie: other.cookie })
          ).data.items.some((n) => n.event === "reply"),
        );
        await request(`/comments/${comment.id}`, {
          method: "DELETE",
          cookie: admin.cookie,
        });
        assert.equal(
          (await request(`/publications/${post.id}/comments`)).data.items
            .length,
          0,
        );
      },
    );
    await t.test(
      "notifications, preferences and recipient boundaries",
      async () => {
        const ns = (await request("/notifications", { cookie: reader.cookie }))
          .data;
        assert.ok(ns.items.some((n) => n.event === "follow"));
        assert.ok(ns.unread > 0);
        await request("/notifications/read", {
          method: "PATCH",
          cookie: other.cookie,
          body: { id: ns.items[0].id },
        });
        assert.equal(
          (await request("/notifications", { cookie: reader.cookie })).data
            .items[0].read_at,
          null,
        );
        await request("/notifications/read", {
          method: "PATCH",
          cookie: reader.cookie,
          body: {},
        });
        assert.equal(
          (await request("/notifications", { cookie: reader.cookie })).data
            .unread,
          0,
        );
        await request("/settings", {
          method: "PATCH",
          cookie: reader.cookie,
          body: {
            feed_density: "compact",
            default_feed: "following",
            notification_events: [],
          },
        });
        assert.equal(
          (await request("/settings", { cookie: reader.cookie })).data
            .feed_density,
          "compact",
        );
      },
    );
    await t.test(
      "profile changes, unique handles, avatar removal and ownership",
      async () => {
        await request(`/profiles/${other.id}/follow`,{method:'PUT',cookie:reader.cookie,body:{active:true}});
        const payload = {
          name: "Changed reader",
          handle: prefix,
          bio: "Research and writing.",
          website: "https://example.com",
          avatar_url: image,
        };
        const changed = (
          await request("/profile", {
            method: "PATCH",
            cookie: reader.cookie,
            body: payload,
          })
        ).data.user;
        assert.equal(changed.handle, prefix);
        assert.ok((await request('/notifications',{cookie:other.cookie})).data.items.some(n=>n.event==='follow' && n.destination===`/u/${prefix}`));
        assert.equal(changed.avatar_url, image);
        await request("/profile", {
          method: "PATCH",
          cookie: other.cookie,
          body: payload,
          expected: 400,
        });
        await request("/profile", {
          method: "PATCH",
          cookie: other.cookie,
          body: { ...payload, avatar_url: null },
          expected: 409,
        });
        await request("/profile", {
          method: "PATCH",
          cookie: reader.cookie,
          body: { ...payload, avatar_url: null },
        });
        assert.equal(
          (await request("/auth/me", { cookie: reader.cookie })).data.user
            .avatar_url,
          null,
        );
      },
    );
    await t.test(
      "cursor pagination has no duplicates under a new publication",
      async () => {
        const ids = [];
        for (let i = 0; i < 14; i++)
          ids.push(
            (
              await pool.query(
                "INSERT INTO publications(author_id,slug,title,body,topic,status,published_at) VALUES($1,$2::text,$2::varchar,'Pagination test content','Research','published',now()) RETURNING id",
                [reader.id, `${prefix}-page-${i}`],
              )
            ).rows[0].id,
          );
        const first = (await request(`/publications?author=${prefix}`)).data;
        assert.equal(first.items.length, 12);
        assert.ok(first.nextCursor);
        await pool.query(
          "INSERT INTO publications(author_id,slug,title,body,topic,status,published_at) VALUES($1,$2::text,$2::varchar,'A newly published article','Research','published',now())",
          [reader.id, `${prefix}-new`],
        );
        const second = (
          await request(
            `/publications?author=${prefix}&cursor=${first.nextCursor}`,
          )
        ).data;
        assert.equal(
          new Set([...first.items, ...second.items].map((p) => p.id)).size,
          15,
        );
        assert.ok(!second.items.some((p) => p.slug === `${prefix}-new`));
        await request("/publications?cursor=invalid", { expected: 400 });
        await request("/publications?sort=trending");
      },
    );
    await t.test(
      "avatar normalization, invalid uploads, interaction reversals and preference suppression",
      async () => {
        const form = new FormData();
        form.append("kind", "avatar");
        form.append(
          "image",
          new Blob(
            [
              await sharp({
                create: {
                  width: 300,
                  height: 150,
                  channels: 3,
                  background: "#9ca48e",
                },
              })
                .png()
                .toBuffer(),
            ],
            { type: "image/png" },
          ),
          "portrait.png",
        );
        const avatar = (
          await request("/media", {
            method: "POST",
            cookie: reader.cookie,
            body: form,
            expected: 201,
          })
        ).data.url;
        const imageResponse = await fetch(base + avatar.replace("/api", ""));
        const meta = await sharp(
          Buffer.from(await imageResponse.arrayBuffer()),
        ).metadata();
        assert.equal(meta.width, 512);
        assert.equal(meta.height, 512);
        const invalid = new FormData();
        invalid.append(
          "image",
          new Blob(["not an image"], { type: "image/png" }),
          "bad.png",
        );
        await request("/media", {
          method: "POST",
          cookie: reader.cookie,
          body: invalid,
          expected: 400,
        });
        const payload = {
          name: "Changed reader",
          handle: prefix,
          bio: "Research and writing.",
          website: "https://example.com",
          avatar_url: avatar,
        };
        await request("/profile", {
          method: "PATCH",
          cookie: reader.cookie,
          body: payload,
        });
        await request(avatar.replace("/api", ""), {
          method: "DELETE",
          cookie: reader.cookie,
          expected: 409,
        });
        await request("/profile", {
          method: "PATCH",
          cookie: reader.cookie,
          body: { ...payload, avatar_url: null },
        });
        await request(avatar.replace("/api", ""), {
          method: "DELETE",
          cookie: other.cookie,
          expected: 404,
        });
        await request(avatar.replace("/api", ""), {
          method: "DELETE",
          cookie: reader.cookie,
        });
        await request(`/publications/${post.id}/interactions`, {
          method: "PUT",
          cookie: other.cookie,
          body: { kind: "saved", active: false },
        });
        assert.ok(
          !(
            await request("/publications?view=saved", { cookie: other.cookie })
          ).data.items.some((p) => p.id === post.id),
        );
        await request(`/profiles/${reader.id}/follow`, {
          method: "PUT",
          cookie: other.cookie,
          body: { active: false },
        });
        assert.equal(
          (await request(`/profiles/${prefix}`)).data.profile.follower_count,
          0,
        );
        assert.ok(
          !(
            await request("/publications?view=following", {
              cookie: other.cookie,
            })
          ).data.items.some((p) => p.id === post.id),
        );
        await request("/topics/Research/follow", {
          method: "PUT",
          cookie: other.cookie,
          body: { active: false },
        });
        assert.equal(
          (await request("/topics", { cookie: other.cookie })).data.items.find(
            (t) => t.name === "Research",
          ).is_followed,
          false,
        );
        const before = (
          await request("/notifications", { cookie: reader.cookie })
        ).data.items.length;
        await request(`/publications/${post.id}/comments`, {
          method: "POST",
          cookie: other.cookie,
          body: { body: "Preferences suppress this notification." },
          expected: 201,
        });
        assert.equal(
          (await request("/notifications", { cookie: reader.cookie })).data
            .items.length,
          before,
        );
        await request("/notifications?page=1.5", {
          cookie: reader.cookie,
          expected: 400,
        });
        await request(`/publications/${post.id}/comments?page=-1`, {
          expected: 400,
        });
      },
    );
    await t.test(
      "unpublish, republish and delete permission boundaries",
      async () => {
        post = (
          await request(`/publications/${post.id}`, {
            method: "PATCH",
            cookie: reader.cookie,
            body: { ...post, status: "draft" },
          })
        ).data.publication;
        await request(`/publications/slug/${post.slug}`, { expected: 404 });
        post = (
          await request(`/publications/${post.id}`, {
            method: "PATCH",
            cookie: reader.cookie,
            body: { ...post, status: "published" },
          })
        ).data.publication;
        await request(`/publications/${post.id}`, {
          method: "DELETE",
          cookie: other.cookie,
          expected: 403,
        });
        await request(`/publications/${post.id}`, {
          method: "DELETE",
          cookie: admin.cookie,
        });
        await request(`/publications/slug/${post.slug}`, { expected: 404 });
      },
    );
    await t.test(
      "real local verification/recovery tokens, one-time use and session invalidation",
      async () => {
        const verified = await request("/security/email/verify", {
          method: "POST",
          cookie: reader.cookie,
        });
        assert.equal(verified.data.delivery, "local-outbox");
        let messages = await readdir(process.env.MAIL_OUTBOX_DIR);
        const verify = JSON.parse(
          await readFile(
            path.join(process.env.MAIL_OUTBOX_DIR, messages[0]),
            "utf8",
          ),
        );
        let token = new URL(verify.text).searchParams.get("token");
        await request("/security/token", {
          method: "POST",
          body: { purpose: "verify", token },
        });
        await request("/security/token", {
          method: "POST",
          body: { purpose: "verify", token },
          expected: 400,
        });
        assert.equal(
          (await request("/auth/me", { cookie: reader.cookie })).data.user
            .email_verified,
          true,
        );
        await request("/security/password/forgot", {
          method: "POST",
          body: { email: reader.email },
        });
        messages = await readdir(process.env.MAIL_OUTBOX_DIR);
        const reset = (
          await Promise.all(
            messages.map(async (f) =>
              JSON.parse(
                await readFile(
                  path.join(process.env.MAIL_OUTBOX_DIR, f),
                  "utf8",
                ),
              ),
            ),
          )
        ).find((m) => m.subject.includes("Reset"));
        token = new URL(reset.text).searchParams.get("token");
        await request("/security/token", {
          method: "POST",
          body: { purpose: "reset", token, password: "New-password-004!" },
        });
        assert.equal(
          (await request("/auth/me", { cookie: reader.cookie })).data.user,
          null,
        );
      },
    );
    await t.test(
      "administrator suspension invalidates sessions without granting roles",
      async () => {
        await request(`/admin/users/${other.id}`, {
          method: "PATCH",
          cookie: admin.cookie,
          body: { suspended: true },
        });
        assert.equal(
          (await request("/auth/me", { cookie: other.cookie })).data.user,
          null,
        );
        await request(`/profiles/${other.handle}`, { expected: 404 });
        await request(`/admin/users/${other.id}`, {
          method: "PATCH",
          cookie: admin.cookie,
          body: { suspended: false },
        });
        assert.equal(
          (await request(`/profiles/${other.handle}`)).data.profile.id,
          other.id,
        );
      },
    );
  });
} finally {
  await pool.query("DELETE FROM publications WHERE author_id=ANY($1::uuid[])", [
    users,
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  await rm(temporary, { recursive: true, force: true });
}
