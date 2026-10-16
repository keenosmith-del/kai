import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import sharp from "sharp";
import { pool } from "../db/pool.js";
import { currentUser } from "../services/sessions.js";
import {
  pageNumber,
  fail,
  id,
  text,
  url,
  transaction,
  notify,
} from "../services/platform.js";
export const platformRouter = Router();
const mediaDir = path.resolve(process.env.MEDIA_DIR || "uploads");
async function signed(req) {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in required.");
  return u;
}
async function admin(req) {
  const u = await signed(req);
  if (u.role !== "admin") fail(403, "Editorial access required.");
  return u;
}
const publicFields = `u.id,u.name,u.handle,u.bio,u.website,u.avatar_url,u.created_at,
 (SELECT count(*)::int FROM follows f WHERE f.author_id=u.id) follower_count,
 (SELECT count(*)::int FROM follows f WHERE f.follower_id=u.id) following_count,
 EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.author_id=u.id) is_following`;
platformRouter.get("/profiles", async (req, res) => {
  const u = await currentUser(req);
  res.json({
    items: (
      await pool.query(
        `SELECT ${publicFields} FROM users u WHERE NOT suspended ORDER BY follower_count DESC,u.created_at LIMIT 24`,
        [u?.id || null],
      )
    ).rows,
  });
});
platformRouter.get("/profiles/:handle", async (req, res) => {
  const u = await currentUser(req);
  const p = (
    await pool.query(
      `SELECT ${publicFields} FROM users u WHERE handle=$2 AND NOT suspended`,
      [u?.id || null, req.params.handle],
    )
  ).rows[0];
  if (!p) fail(404, "Profile not found.");
  res.json({ profile: p });
});
platformRouter.patch("/profile", async (req, res) => {
  const u = await signed(req),
    name = text(req.body.name, 120, 2),
    handle = text(req.body.handle, 48, 3).toLowerCase(),
    bio = text(req.body.bio || "", 600),
    website = url(req.body.website),
    avatar = req.body.avatar_url ? url(req.body.avatar_url, true) : null;
  if (!/^[a-z0-9][a-z0-9_-]+$/.test(handle))
    fail(400, "Use letters, numbers, underscores or hyphens in your handle.");
  if (
    avatar &&
    (!avatar.startsWith("/api/media/") ||
      !(
        await pool.query(
          "SELECT 1 FROM media WHERE owner_id=$1 AND filename=$2",
          [u.id, avatar.split("/").at(-1)],
        )
      ).rowCount)
  )
    fail(400, "Upload a profile image first.");
  await transaction(async db=>{
    await db.query(
      "UPDATE users SET name=$1,handle=$2,bio=$3,website=$4,avatar_url=$5,updated_at=now() WHERE id=$6",
      [name,handle,bio,website,avatar,u.id]);
    await db.query("UPDATE notifications SET destination=$1 WHERE actor_id=$2 AND event='follow'",[`/u/${handle}`,u.id]);
  });
  res.json({ user: await currentUser(req) });
});
platformRouter.put("/profiles/:id/follow", async (req, res) => {
  const u = await signed(req),
    author = id(req.params.id);
  if (u.id === author) fail(400, "You cannot follow yourself.");
  if (typeof req.body.active !== "boolean") fail(400, "Invalid follow state.");
  await transaction(async (db) => {
    const a = (
      await db.query("SELECT handle FROM users WHERE id=$1 AND NOT suspended", [
        author,
      ])
    ).rows[0];
    if (!a) fail(404, "Author not found.");
    if (req.body.active) {
      const r = await db.query(
        "INSERT INTO follows(follower_id,author_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [u.id, author],
      );
      if (r.rowCount)
        await notify(
          db,
          author,
          u.id,
          "follow",
          null,
          null,
          `follow:${u.id}:${author}`,
          `/u/${u.handle}`,
        );
    } else
      await db.query(
        "DELETE FROM follows WHERE follower_id=$1 AND author_id=$2",
        [u.id, author],
      );
  });
  res.json({ ok: true });
});
platformRouter.get("/profiles/:handle/:kind", async (req, res) => {
  if (!["followers", "following"].includes(req.params.kind))
    fail(404, "Collection not found.");
  const u = await currentUser(req),
    page = pageNumber(req.query.page),
    isFollowers = req.params.kind === "followers";
  const { rows } = await pool.query(
    `SELECT ${publicFields} FROM follows f JOIN users owner ON owner.id=f.${isFollowers ? "author_id" : "follower_id"} JOIN users u ON u.id=f.${isFollowers ? "follower_id" : "author_id"} WHERE owner.handle=$2 AND NOT owner.suspended AND NOT u.suspended ORDER BY f.created_at DESC,u.id LIMIT 31 OFFSET $3`,
    [u?.id || null, req.params.handle, (page - 1) * 30],
  );
  res.json({ items: rows.slice(0, 30), hasMore: rows.length > 30 });
});
platformRouter.get("/topics", async (req, res) => {
  const u = await currentUser(req);
  res.json({
    items: (
      await pool.query(
        `SELECT t.name,(SELECT count(*)::int FROM publications p JOIN users a ON a.id=p.author_id WHERE p.topic=t.name AND p.status='published' AND NOT a.suspended) publication_count, EXISTS(SELECT 1 FROM topic_follows f WHERE f.user_id=$1 AND f.topic=t.name) is_followed FROM topics t ORDER BY t.name`,
        [u?.id || null],
      )
    ).rows,
  });
});
platformRouter.put("/topics/:name/follow", async (req, res) => {
  const u = await signed(req);
  if (typeof req.body.active !== "boolean") fail(400, "Invalid follow state.");
  if (
    !(await pool.query("SELECT 1 FROM topics WHERE name=$1", [req.params.name]))
      .rowCount
  )
    fail(404, "Topic not found.");
  if (req.body.active)
    await pool.query(
      "INSERT INTO topic_follows(user_id,topic) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [u.id, req.params.name],
    );
  else
    await pool.query(
      "DELETE FROM topic_follows WHERE user_id=$1 AND topic=$2",
      [u.id, req.params.name],
    );
  res.json({ ok: true });
});
platformRouter.get("/settings", async (req, res) => {
  const u = await signed(req);
  const p = (
    await pool.query("SELECT * FROM reader_preferences WHERE user_id=$1", [
      u.id,
    ])
  ).rows[0];
  res.json(
    p || {
      feed_density: "comfortable",
      default_feed: "for-you",
      notification_events: ["follow", "like", "comment", "reply", "moderation"],
    },
  );
});
platformRouter.patch("/settings", async (req, res) => {
  const u = await signed(req),
    { feed_density, default_feed, notification_events } = req.body;
  if (
    !["comfortable", "compact"].includes(feed_density) ||
    !["for-you", "latest", "following"].includes(default_feed) ||
    !Array.isArray(notification_events) ||
    notification_events.some(
      (e) => !["follow", "like", "comment", "reply", "moderation"].includes(e),
    )
  )
    fail(400, "Invalid settings.");
  await pool.query(
    `INSERT INTO reader_preferences(user_id,feed_density,default_feed,notification_events) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET feed_density=$2,default_feed=$3,notification_events=$4,updated_at=now()`,
    [u.id, feed_density, default_feed, notification_events],
  );
  res.json({ ok: true });
});
platformRouter.get("/notifications", async (req, res) => {
  const u = await signed(req),
    page = pageNumber(req.query.page);
  const rows = (
    await pool.query(
      `SELECT n.*,a.name actor_name,a.avatar_url actor_avatar FROM notifications n LEFT JOIN users a ON a.id=n.actor_id WHERE recipient_id=$1 ORDER BY n.created_at DESC,n.id DESC LIMIT 31 OFFSET $2`,
      [u.id, (page - 1) * 30],
    )
  ).rows;
  res.json({
    items: rows.slice(0, 30),
    hasMore: rows.length > 30,
    unread: (
      await pool.query(
        "SELECT count(*)::int n FROM notifications WHERE recipient_id=$1 AND read_at IS NULL",
        [u.id],
      )
    ).rows[0].n,
  });
});
platformRouter.patch("/notifications/read", async (req, res) => {
  const u = await signed(req);
  const target = req.body.id ? id(req.body.id) : null;
  await pool.query(
    "UPDATE notifications SET read_at=now() WHERE recipient_id=$1 AND read_at IS NULL AND ($2::uuid IS NULL OR id=$2)",
    [u.id, target],
  );
  res.json({ ok: true });
});
platformRouter.patch("/comments/:id", async (req, res) => {
  const u = await signed(req),
    body = text(req.body.body, 4000, 1);
  const r = await pool.query(
    "UPDATE comments SET body=$1,updated_at=now() WHERE id=$2 AND author_id=$3 RETURNING id",
    [body, id(req.params.id), u.id],
  );
  if (!r.rowCount) fail(403, "You can only edit your own comments.");
  res.json({ ok: true });
});
platformRouter.delete("/comments/:id", async (req, res) => {
  const u = await signed(req);
  await transaction(async (db) => {
    const c = (
      await db.query(
        "SELECT c.*,p.author_id publication_author,p.slug FROM comments c JOIN publications p ON p.id=c.publication_id WHERE c.id=$1 FOR UPDATE OF c",
        [id(req.params.id)],
      )
    ).rows[0];
    if (!c) fail(404, "Comment not found.");
    if (
      c.author_id !== u.id &&
      c.publication_author !== u.id &&
      u.role !== "admin"
    )
      fail(403, "You cannot moderate this comment.");
    if (c.author_id !== u.id)
      await notify(
        db,
        c.author_id,
        u.id,
        "moderation",
        c.publication_id,
        null,
        `remove-comment:${c.id}`,
        `/stories/${c.slug}`,
      );
    await db.query("DELETE FROM comments WHERE id=$1", [c.id]);
  });
  res.json({ ok: true });
});
platformRouter.post("/reports", async (req, res) => {
  const u = await signed(req),
    reason = text(req.body.reason, 1000, 5),
    post = req.body.publication_id ? id(req.body.publication_id) : null,
    comment = req.body.comment_id ? id(req.body.comment_id) : null;
  if (Boolean(post) === Boolean(comment))
    fail(400, "Select a publication or comment.");
  if (
    !(
      await pool.query(
        post
          ? "SELECT 1 FROM publications WHERE id=$1 AND status='published'"
          : "SELECT 1 FROM comments c JOIN publications p ON p.id=c.publication_id WHERE c.id=$1 AND p.status='published'",
        [post || comment],
      )
    ).rowCount
  )
    fail(404, "Content not found.");
  await pool.query(
    "INSERT INTO reports(reporter_id,publication_id,comment_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [u.id, post, comment, reason],
  );
  res.status(201).json({ ok: true });
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    cb(
      null,
      ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
        file.mimetype,
      ),
    ),
});
platformRouter.post(
  "/media",
  async (req, _res, next) => {
    const u = await signed(req);
    const daily = (
      await pool.query(
        "SELECT count(*)::int n FROM media WHERE owner_id=$1 AND created_at > now() - interval '1 day'",
        [u.id],
      )
    ).rows[0].n;
    if (daily >= 80)
      fail(429, "Daily image upload limit reached. Try again tomorrow.");
    next();
  },
  upload.single("image"),
  async (req, res) => {
    const u = await signed(req);
    if (!req.file)
      fail(400, "Choose a JPEG, PNG, WebP or AVIF image up to 8 MB.");
    let buffer;
    try {
      let image = sharp(req.file.buffer, {
        limitInputPixels: 40000000,
      }).rotate();
      if (req.body.kind === "avatar")
        image = image.resize(512, 512, { fit: "cover", position: "attention" });
      else
        image = image.resize({
          width: 1800,
          height: 1800,
          fit: "inside",
          withoutEnlargement: true,
        });
      buffer = await image.webp({ quality: 85 }).toBuffer();
    } catch {
      fail(400, "This image could not be decoded.");
    }
    await mkdir(mediaDir, { recursive: true });
    const filename = `${randomUUID()}.webp`;
    await writeFile(path.join(mediaDir, filename), buffer, { flag: "wx" });
    try {
      await pool.query("INSERT INTO media(owner_id,filename) VALUES($1,$2)", [
        u.id,
        filename,
      ]);
    } catch (e) {
      await unlink(path.join(mediaDir, filename));
      throw e;
    }
    res.status(201).json({ url: `/api/media/${filename}` });
  },
);
platformRouter.get("/media/:filename", async (req, res) => {
  const f = req.params.filename;
  if (
    !/^[a-f\d-]{36}\.webp$/.test(f) ||
    !(await pool.query("SELECT 1 FROM media WHERE filename=$1", [f])).rowCount
  )
    fail(404, "Image not found.");
  try {
    const buffer = await readFile(path.join(mediaDir, f));
    res
      .type("webp")
      .set("Cache-Control", "public, max-age=31536000, immutable")
      .send(buffer);
  } catch {
    fail(404, "Image is unavailable.");
  }
});
platformRouter.delete("/media/:filename", async (req, res) => {
  const u = await signed(req),
    f = req.params.filename;
  const src = `/api/media/${f}`;
  if (
    (
      await pool.query(
        `SELECT 1 FROM users WHERE avatar_url=$1 UNION ALL SELECT 1 FROM publications WHERE cover_url=$1 OR content::text LIKE '%'||$1||'%' LIMIT 1`,
        [src],
      )
    ).rowCount
  )
    fail(409, "Remove the image from its publication or profile first.");
  const r = await pool.query(
    "DELETE FROM media WHERE filename=$1 AND owner_id=$2 RETURNING filename",
    [f, u.id],
  );
  if (!r.rowCount) fail(404, "Image not found.");
  await unlink(path.join(mediaDir, f)).catch(() => {});
  res.json({ ok: true });
});
platformRouter.get("/admin/overview", async (req, res) => {
  await admin(req);
  const usersPage = pageNumber(req.query.usersPage),
    reportsPage = pageNumber(req.query.reportsPage);
  const [statistics, reports, users] = await Promise.all([
    pool.query(
      `SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM publications WHERE status='published') published,(SELECT count(*)::int FROM publications WHERE status='draft') drafts,(SELECT count(*)::int FROM comments) comments,(SELECT count(*)::int FROM publication_interactions WHERE kind='liked') likes,(SELECT count(*)::int FROM reports WHERE status='open') reports`,
    ),
    pool.query(
      `SELECT r.*,p.title,p.slug,c.body comment_body FROM reports r LEFT JOIN comments c ON c.id=r.comment_id LEFT JOIN publications p ON p.id=COALESCE(r.publication_id,c.publication_id) WHERE r.status='open' ORDER BY r.created_at DESC,r.id DESC LIMIT 101 OFFSET $1`,
      [(reportsPage - 1) * 100],
    ),
    pool.query(
      "SELECT id,name,handle,role,suspended FROM users ORDER BY created_at DESC,id DESC LIMIT 101 OFFSET $1",
      [(usersPage - 1) * 100],
    ),
  ]);
  res.json({
    statistics: statistics.rows[0],
    reports: reports.rows.slice(0, 100),
    users: users.rows.slice(0, 100),
    reportsHasMore: reports.rows.length > 100,
    usersHasMore: users.rows.length > 100,
  });
});
platformRouter.patch("/admin/reports/:id", async (req, res) => {
  await admin(req);
  await pool.query("UPDATE reports SET status='resolved' WHERE id=$1", [
    id(req.params.id),
  ]);
  res.json({ ok: true });
});
platformRouter.patch("/admin/users/:id", async (req, res) => {
  const u = await admin(req),
    target = id(req.params.id);
  if (u.id === target) fail(400, "You cannot suspend yourself.");
  if (typeof req.body.suspended !== "boolean")
    fail(400, "Invalid moderation state.");
  await transaction(async (db) => {
    const a = (
      await db.query("SELECT role FROM users WHERE id=$1 FOR UPDATE", [target])
    ).rows[0];
    if (!a) fail(404, "User not found.");
    if (a.role === "admin")
      fail(403, "Administrator accounts cannot be suspended here.");
    await db.query("UPDATE users SET suspended=$1 WHERE id=$2", [
      req.body.suspended,
      target,
    ]);
    if (req.body.suspended)
      await db.query("DELETE FROM sessions WHERE user_id=$1", [target]);
    await notify(
      db,
      target,
      u.id,
      "moderation",
      null,
      null,
      `suspend:${target}:${randomUUID()}`,
      "/account",
    );
  });
  res.json({ ok: true });
});
platformRouter.post("/admin/topics", async (req, res) => {
  await admin(req);
  await pool.query(
    "INSERT INTO topics(name) VALUES($1) ON CONFLICT DO NOTHING",
    [text(req.body.name, 60, 2)],
  );
  res.status(201).json({ ok: true });
});
platformRouter.patch("/admin/topics/:name", async (req, res) => {
  await admin(req);
  const name = text(req.body.name, 60, 2);
  await transaction(async (db) => {
    const r = await db.query(
      "UPDATE topics SET name=$1 WHERE name=$2 RETURNING name",
      [name, req.params.name],
    );
    if (!r.rowCount) fail(404, "Topic not found.");
    await db.query("UPDATE publications SET topic=$1 WHERE topic=$2", [
      name,
      req.params.name,
    ]);
  });
  res.json({ ok: true });
});
