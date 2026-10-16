import { Router } from "express";
import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";
import { currentUser } from "../services/sessions.js";
import {
  pageNumber,
  fail,
  id,
  text,
  url,
  richContent,
  transaction,
  notify,
} from "../services/platform.js";
export const publicationRouter = Router();
export const TOPICS = [
  "Research",
  "Language models",
  "AI agents",
  "Engineering",
  "Automation",
  "Models & tools",
  "AI in business",
  "Perspectives",
];
const fields = `p.*, a.name author_name, a.handle author_handle, a.avatar_url author_avatar,
 (SELECT count(*)::int FROM publication_interactions i WHERE i.publication_id=p.id AND i.kind='liked') like_count,
 (SELECT count(*)::int FROM comments c WHERE c.publication_id=p.id) comment_count,
 EXISTS(SELECT 1 FROM publication_interactions i WHERE i.publication_id=p.id AND i.user_id=$1 AND i.kind='liked') is_liked,
 EXISTS(SELECT 1 FROM publication_interactions i WHERE i.publication_id=p.id AND i.user_id=$1 AND i.kind='saved') is_saved`;
const trending = `((SELECT count(*) FROM publication_interactions i WHERE i.publication_id=p.id AND i.kind='liked' AND i.created_at >= $2::timestamptz - interval '7 days' AND i.created_at <= $2::timestamptz) + 2*(SELECT count(*) FROM comments c WHERE c.publication_id=p.id AND c.created_at >= $2::timestamptz - interval '7 days' AND c.created_at <= $2::timestamptz)) / power(2 + greatest(0,extract(epoch FROM ($2::timestamptz-p.published_at))/3600),0.6)`;
publicationRouter.get("/", async (req, res) => {
  const user = await currentUser(req),
    view = req.query.view || "feed",
    sort = req.query.sort || "latest";
  if (
    ![
      "feed",
      "saved",
      "liked",
      "following",
      "for-you",
      "mine",
      "drafts",
      "admin",
    ].includes(view) ||
    !["latest", "trending", "relevance"].includes(sort)
  )
    fail(400, "Invalid feed.");
  if (
    ["saved", "liked", "following", "mine", "drafts", "admin"].includes(view) &&
    !user
  )
    fail(401, "Sign in to see your collection.");
  if (view === "admin" && user.role !== "admin")
    fail(403, "Editorial access required.");
  let cursor = null;
  if (req.query.cursor) {
    try {
      cursor = JSON.parse(
        Buffer.from(req.query.cursor, "base64url").toString(),
      );
      if (
        !Number.isFinite(cursor.rank) ||
        !Number.isFinite(Date.parse(cursor.date)) ||
        !Number.isFinite(Date.parse(cursor.at))
      )
        throw Error();
      id(cursor.id);
      if (
        cursor.key !==
        JSON.stringify([
          view,
          sort,
          req.query.q || "",
          req.query.topic || "",
          req.query.format || "",
          req.query.author || "",
          req.query.status || "",
        ])
      )
        throw Error();
    } catch {
      fail(400, "Invalid pagination cursor.");
    }
  }
  const at = cursor?.at || new Date().toISOString(),
    args = [user?.id || null, at],
    where = ["$2::timestamptz IS NOT NULL"];
  if (view !== "admin") where.push("NOT a.suspended");
  const param = (v) => {
    args.push(v);
    return `$${args.length}`;
  };
  if (["mine", "drafts"].includes(view)) {
    where.push(`p.author_id=$1`);
    if (view === "drafts") where.push("p.status='draft'");
  } else if (view !== "admin")
    where.push("p.status='published'", "p.published_at <= $2");
  if (req.query.status && ["mine", "admin"].includes(view)) {
    if (!["draft", "published"].includes(req.query.status))
      fail(400, "Invalid publication status.");
    where.push(`p.status=${param(req.query.status)}`);
  }
  if (req.query.author)
    where.push(`a.handle=${param(text(req.query.author, 80))}`);
  if (req.query.topic)
    where.push(`p.topic=${param(text(req.query.topic, 60))}`);
  if (req.query.format) {
    if (!["brief", "story"].includes(req.query.format))
      fail(400, "Invalid format.");
    where.push(`p.format=${param(req.query.format)}`);
  }
  let rank = sort === "trending" ? trending : "0::numeric";
  if (req.query.q) {
    const q = param(text(req.query.q, 150, 1));
    const vector = `to_tsvector('english',p.title||' '||p.summary||' '||p.body||' '||p.topic)`;
    where.push(
      `(${vector} @@ websearch_to_tsquery('english',${q}) OR a.name ILIKE '%'||${q}||'%' OR a.handle ILIKE '%'||${q}||'%' OR EXISTS(SELECT 1 FROM unnest(p.tags) tag WHERE tag ILIKE '%'||${q}||'%'))`,
    );
    if (sort === "relevance")
      rank = `ts_rank(${vector},websearch_to_tsquery('english',${q}))::numeric`;
  }
  if (["saved", "liked"].includes(view))
    where.push(
      `EXISTS(SELECT 1 FROM publication_interactions i WHERE i.user_id=$1 AND i.publication_id=p.id AND i.kind=${param(view)})`,
    );
  if (view === "following")
    where.push(
      "EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.author_id=p.author_id)",
    );
  if (view === "for-you" && user)
    rank = `(CASE WHEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.author_id=p.author_id) THEN 2 ELSE 0 END + CASE WHEN EXISTS(SELECT 1 FROM topic_follows t WHERE t.user_id=$1 AND t.topic=p.topic) THEN 1 ELSE 0 END)::numeric * 1000 + (${rank})`;
  const date = ["mine", "drafts", "admin"].includes(view)
    ? "p.created_at"
    : "p.published_at";
  let after = "";
  if (cursor)
    after = `WHERE (rank,feed_date,id) < (${param(cursor.rank)}::numeric,${param(cursor.date)}::timestamptz,${param(cursor.id)}::uuid)`;
  const { rows } = await pool.query(
    `SELECT *, to_char(feed_date AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_date FROM(SELECT ${fields},${rank} rank,${date} feed_date FROM publications p JOIN users a ON a.id=p.author_id WHERE ${where.join(" AND ")}) feed ${after} ORDER BY rank DESC,feed_date DESC,id DESC LIMIT 13`,
    args,
  );
  const items = rows.slice(0, 12),
    last = items.at(-1);
  res.json({
    items,
    hasMore: rows.length > 12,
    nextCursor:
      rows.length > 12
        ? Buffer.from(
            JSON.stringify({
              rank: Number(last.rank),
              date: last.cursor_date,
              at,
              id: last.id,
              key: JSON.stringify([
                view,
                sort,
                req.query.q || "",
                req.query.topic || "",
                req.query.format || "",
                req.query.author || "",
                req.query.status || "",
              ]),
            }),
          ).toString("base64url")
        : null,
  });
});
publicationRouter.get("/slug/:slug", async (req, res) => {
  const u = await currentUser(req);
  const { rows } = await pool.query(
    `SELECT ${fields} FROM publications p JOIN users a ON a.id=p.author_id WHERE p.slug=$2 AND ((p.status='published' AND NOT a.suspended) OR p.author_id=$1 OR $3)`,
    [u?.id || null, req.params.slug, u?.role === "admin"],
  );
  if (!rows[0]) fail(404, "Publication not found.");
  res.json({ publication: rows[0] });
});
async function input(body, user) {
  const status = body.status || "draft";
  if (
    !["draft", "published"].includes(status) ||
    !["brief", "story"].includes(body.format)
  )
    fail(400, "Choose a format and status.");
  const title = text(body.title, 180, status === "published" ? 5 : 1),
    summary = text(body.summary || "", 400),
    rich = richContent(body.content);
  const plain = rich.content ? rich.plain : text(body.body || "", 100000);
  if (
    plain.length > 100000 ||
    (status === "published" && plain.trim().length < 20)
  )
    fail(400, "Published content needs 20–100,000 characters.");
  const topic = text(body.topic, 60, 1);
  if (
    !(await pool.query("SELECT 1 FROM topics WHERE name=$1", [topic])).rowCount
  )
    fail(400, "Choose an existing topic.");
  if (
    !Array.isArray(body.tags) ||
    body.tags.length > 12 ||
    !Array.isArray(body.sources) ||
    body.sources.length > 20
  )
    fail(400, "Use up to 12 tags and 20 references.");
  const cover = url(body.cover_url, true) || null;
  const mediaUrls = [cover];
  function media(n) {
    if (n?.type === "image") mediaUrls.push(n.attrs.src);
    n?.content?.forEach(media);
  }
  media(rich.content);
  for (const src of mediaUrls.filter((s) => s?.startsWith("/api/media/"))) {
    if (
      !(
        await pool.query(
          "SELECT 1 FROM media WHERE filename=$1 AND owner_id=$2",
          [src.split("/").at(-1), user.id],
        )
      ).rowCount &&
      user.role !== "admin"
    )
      fail(403, "Use your own uploaded media.");
  }
  return [
    title,
    summary,
    plain,
    topic,
    body.format,
    status,
    JSON.stringify(rich.content),
    body.tags.map((t) => text(t, 40, 1)),
    JSON.stringify(body.sources.map((s) => url(s))),
    cover,
  ];
}
publicationRouter.post("/", async (req, res) => {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in to publish.");
  const v = await input(req.body, u);
  const slug = `${v[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 64)}-${randomBytes(6).toString("hex")}`;
  const { rows } = await pool.query(
    `INSERT INTO publications(title,summary,body,topic,format,status,content,tags,sources,cover_url,author_id,slug,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $6='published' THEN now() END) RETURNING *`,
    [...v, u.id, slug],
  );
  res.status(201).json({ publication: rows[0] });
});
publicationRouter.patch("/:id", async (req, res) => {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in required.");
  id(req.params.id);
  const v = await input(req.body, u);
  const publication = await transaction(async (db) => {
    const p = (
      await db.query("SELECT * FROM publications WHERE id=$1 FOR UPDATE", [
        req.params.id,
      ])
    ).rows[0];
    if (!p) fail(404, "Publication not found.");
    if (p.author_id !== u.id && u.role !== "admin")
      fail(403, "You can only edit your own publications.");
    if (req.body.revision !== p.revision)
      fail(
        409,
        "This publication changed in another window. Reopen it before saving.",
      );
    const result = await db.query(
      `UPDATE publications SET title=$1,summary=$2,body=$3,topic=$4,format=$5,status=$6,content=$7,tags=$8,sources=$9,cover_url=$10,updated_at=now(),revision=revision+1,published_at=CASE WHEN $6='published' THEN COALESCE(published_at,now()) ELSE published_at END WHERE id=$11 RETURNING *`,
      [...v, p.id],
    );
    if (p.author_id !== u.id)
      await notify(
        db,
        p.author_id,
        u.id,
        "moderation",
        p.id,
        null,
        `edit:${p.id}:${p.revision}`,
        `/stories/${p.slug}`,
      );
    return result.rows[0];
  });
  res.json({ publication });
});
publicationRouter.delete("/:id", async (req, res) => {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in required.");
  id(req.params.id);
  await transaction(async (db) => {
    const p = (
      await db.query("SELECT * FROM publications WHERE id=$1 FOR UPDATE", [
        req.params.id,
      ])
    ).rows[0];
    if (!p) fail(404, "Publication not found.");
    if (p.author_id !== u.id && u.role !== "admin")
      fail(403, "You can only delete your own publications.");
    if (p.author_id !== u.id)
      await notify(
        db,
        p.author_id,
        u.id,
        "moderation",
        null,
        null,
        `delete:${p.id}`,
        "/studio",
      );
    await db.query("DELETE FROM publications WHERE id=$1", [p.id]);
  });
  res.json({ ok: true });
});
publicationRouter.put("/:id/interactions", async (req, res) => {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in to interact.");
  id(req.params.id);
  const { kind, active } = req.body;
  if (!["liked", "saved"].includes(kind) || typeof active !== "boolean")
    fail(400, "Invalid interaction.");
  const result = await transaction(async (db) => {
    const p = (
      await db.query(
        "SELECT p.* FROM publications p JOIN users a ON a.id=p.author_id WHERE p.id=$1 AND p.status='published' AND NOT a.suspended FOR SHARE OF p",
        [req.params.id],
      )
    ).rows[0];
    if (!p) fail(404, "Publication not found.");
    if (active) {
      const r = await db.query(
        "INSERT INTO publication_interactions(user_id,publication_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [u.id, p.id, kind],
      );
      if (r.rowCount && kind === "liked")
        await notify(
          db,
          p.author_id,
          u.id,
          "like",
          p.id,
          null,
          `like:${u.id}:${p.id}`,
          `/stories/${p.slug}`,
        );
    } else
      await db.query(
        "DELETE FROM publication_interactions WHERE user_id=$1 AND publication_id=$2 AND kind=$3",
        [u.id, p.id, kind],
      );
    return (
      await db.query(
        `SELECT ${fields} FROM publications p JOIN users a ON a.id=p.author_id WHERE p.id=$2`,
        [u.id, p.id],
      )
    ).rows[0];
  });
  res.json(result);
});
publicationRouter.get("/:id/comments", async (req, res) => {
  id(req.params.id);
  const u = await currentUser(req),
    page = pageNumber(req.query.page);
  const p = (
    await pool.query("SELECT p.author_id,p.status,a.suspended FROM publications p JOIN users a ON a.id=p.author_id WHERE p.id=$1", [
      req.params.id,
    ])
  ).rows[0];
  if (
    !p ||
    (p.suspended && u?.role !== "admin") ||
    (p.status !== "published" && p.author_id !== u?.id && u?.role !== "admin")
  )
    fail(404, "Publication not found.");
  const { rows } = await pool.query(
    `SELECT c.*,a.name author_name,a.handle author_handle,a.avatar_url author_avatar FROM comments c JOIN users a ON a.id=c.author_id WHERE publication_id=$1 ORDER BY c.created_at,c.id LIMIT 31 OFFSET $2`,
    [req.params.id, (page - 1) * 30],
  );
  res.json({ items: rows.slice(0, 30), hasMore: rows.length > 30 });
});
publicationRouter.post("/:id/comments", async (req, res) => {
  const u = await currentUser(req);
  if (!u) fail(401, "Sign in to comment.");
  id(req.params.id);
  const body = text(req.body.body, 4000, 1),
    parent = req.body.parent_id ? id(req.body.parent_id) : null;
  const c = await transaction(async (db) => {
    const p = (
      await db.query(
        "SELECT p.* FROM publications p JOIN users a ON a.id=p.author_id WHERE p.id=$1 AND p.status='published' AND NOT a.suspended FOR SHARE OF p",
        [req.params.id],
      )
    ).rows[0];
    if (!p) fail(404, "Publication not found.");
    let parentRow = null;
    if (parent) {
      parentRow = (
        await db.query(
          "SELECT * FROM comments WHERE id=$1 AND publication_id=$2 FOR SHARE",
          [parent, p.id],
        )
      ).rows[0];
      if (!parentRow) fail(400, "Reply must belong to this publication.");
    }
    const c = (
      await db.query(
        "INSERT INTO comments(publication_id,author_id,parent_id,body) VALUES($1,$2,$3,$4) RETURNING *",
        [p.id, u.id, parent, body],
      )
    ).rows[0];
    await notify(
      db,
      p.author_id,
      u.id,
      "comment",
      p.id,
      c.id,
      `comment:${c.id}`,
      `/stories/${p.slug}#comment-${c.id}`,
    );
    if (parentRow && parentRow.author_id !== p.author_id)
      await notify(
        db,
        parentRow.author_id,
        u.id,
        "reply",
        p.id,
        c.id,
        `reply:${c.id}`,
        `/stories/${p.slug}#comment-${c.id}`,
      );
    return c;
  });
  res.status(201).json({ comment: c });
});
