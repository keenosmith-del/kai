import { pool } from "../db/pool.js";
export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
export function id(value) {
  if (!uuid(value)) fail(400, "Invalid identifier.");
  return value;
}
export function text(value, max, min = 0) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(400, `Text must contain ${min}–${max} characters.`);
  return value.trim();
}
export function url(value, media = false) {
  if (!value) return "";
  if (typeof value !== "string" || value.length > 2048)
    fail(400, "Invalid URL.");
  if (media && /^\/api\/media\/[a-f\d-]+\.webp$/.test(value)) return value;
  try {
    const u = new URL(value);
    if (["https:", "http:"].includes(u.protocol) && !u.username && !u.password)
      return u.href;
  } catch {}
  fail(400, "Use an http or https URL.");
}
export async function transaction(fn) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function notify(
  db,
  recipient,
  actor,
  event,
  publication,
  comment,
  key,
  destination,
) {
  if (!recipient || recipient === actor) return;
  await db.query(
    `INSERT INTO notifications(recipient_id,actor_id,event,publication_id,comment_id,dedupe_key,destination)
 SELECT $1,$2,$3,$4,$5,$6,$7 WHERE NOT EXISTS(SELECT 1 FROM reader_preferences WHERE user_id=$1 AND NOT ($3=ANY(notification_events))) ON CONFLICT(dedupe_key) DO NOTHING`,
    [recipient, actor, event, publication, comment, key, destination],
  );
}
const types = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
  "codeBlock",
  "image",
]);
export function richContent(value) {
  if (value == null) return { content: null, plain: "" };
  let count = 0;
  function walk(n, depth = 0) {
    if (
      !n ||
      typeof n !== "object" ||
      depth > 24 ||
      ++count > 15000 ||
      !types.has(n.type)
    )
      fail(400, "Invalid article structure.");
    const out = { type: n.type };
    if (n.type === "text") {
      if (typeof n.text !== "string" || n.text.length > 100000)
        fail(400, "Invalid text node.");
      out.text = n.text;
    }
    if (n.type === "heading")
      out.attrs = {
        level: [1, 2, 3].includes(n.attrs?.level) ? n.attrs.level : 2,
      };
    if (n.type === "image")
      out.attrs = {
        src: url(n.attrs?.src, true),
        alt: typeof n.attrs?.alt === "string" ? n.attrs.alt.slice(0, 300) : "",
      };
    if (n.marks) {
      if (!Array.isArray(n.marks) || n.marks.length > 8)
        fail(400, "Invalid formatting.");
      out.marks = n.marks.map((m) => {
        if (
          !["bold", "italic", "strike", "code", "link", "underline"].includes(
            m.type,
          )
        )
          fail(400, "Unsupported formatting.");
        return m.type === "link"
          ? { type: "link", attrs: { href: url(m.attrs?.href) } }
          : { type: m.type };
      });
    }
    if (n.content) {
      if (!Array.isArray(n.content)) fail(400, "Invalid content.");
      out.content = n.content.map((c) => walk(c, depth + 1));
    }
    return out;
  }
  const content = walk(value);
  if (content.type !== "doc") fail(400, "Article must be a document.");
  function plain(n) {
    return (
      (n.text || "") +
      (n.content?.map(plain).join(n.type === "paragraph" ? "" : "\n") || "")
    );
  }
  return { content, plain: plain(content) };
}

export function pageNumber(value) {
  const number = Number(value || 1);
  if (!Number.isSafeInteger(number) || number < 1 || number > 1000)
    fail(400, "Invalid page.");
  return number;
}
