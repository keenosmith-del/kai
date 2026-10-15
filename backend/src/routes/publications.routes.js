import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../db/pool.js';
import { currentUser } from '../services/sessions.js';

export const publicationRouter = Router();

export const TOPICS = Object.freeze([
  'Research', 'Language models', 'AI agents', 'Engineering',
  'Automation', 'Models & tools', 'AI in business', 'Perspectives',
]);

// Same-origin guard protects cookie-authenticated mutations.
publicationRouter.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    const expected = process.env.APP_ORIGIN || 'http://localhost:5175';
    if (origin && origin !== expected) {
      return res.status(403).json({ error: 'Invalid request origin.' });
    }
  }
  next();
});

const publishLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many publications. Please try again later.' },
});
const interactionLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

function validUuid(value) {
  return typeof value === 'string' &&
    /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value);
}
function publicationSlug(title) {
  const base = title.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  return `${base || 'brief'}-${randomBytes(5).toString('hex')}`;
}
function text(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit + 1) : '';
}
function escapeLike(input) {
  return input.replace(/[\\%_]/g, '\\$&');
}

// Public read-only publication discovery. Reader identity enriches liked/saved flags.
publicationRouter.get('/', async (req, res) => {
  const user = await currentUser(req);
  const view = req.query.view ?? 'feed';
  if (!['feed', 'saved', 'liked'].includes(view)) {
    return res.status(400).json({ error: 'Invalid feed view.' });
  }
  if (view !== 'feed' && !user) {
    return res.status(401).json({ error: 'Sign in to see your collection.' });
  }
  const q = text(req.query.q, 120);
  const topic = typeof req.query.topic === 'string' ? req.query.topic : '';
  if (q.length > 120 || (topic && !TOPICS.includes(topic))) {
    return res.status(400).json({ error: 'Invalid search or topic.' });
  }
  const rawPage = Number(req.query.page || 1);
  if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 500) {
    return res.status(400).json({ error: 'Invalid page.' });
  }
  const limit = 12;
  const args = [user?.id ?? null];
  const conditions = ["p.status = 'published'", 'p.published_at IS NOT NULL'];
  if (topic) {
    args.push(topic);
    conditions.push(`p.topic = $${args.length}`);
  }
  if (q) {
    args.push(`%${escapeLike(q)}%`);
    const pos = args.length;
    conditions.push(`(p.title ILIKE $${pos} ESCAPE '\\' OR p.summary ILIKE $${pos} ESCAPE '\\' OR p.body ILIKE $${pos} ESCAPE '\\')`);
  }
  if (view !== 'feed') {
    args.push(view);
    conditions.push(`EXISTS (SELECT 1 FROM publication_interactions pi
       WHERE pi.publication_id = p.id AND pi.user_id = $1 AND pi.kind = $${args.length})`);
  }
  args.push(limit + 1, (rawPage - 1) * limit);
  const { rows } = await pool.query(`
    SELECT p.id, p.slug, p.format, p.title, p.summary, p.body, p.topic,
           p.cover_url, p.published_at, p.created_at,
           a.id AS author_id, a.name AS author_name,
           EXISTS (SELECT 1 FROM publication_interactions i
             WHERE i.publication_id = p.id AND i.user_id = $1 AND i.kind = 'liked') AS is_liked,
           EXISTS (SELECT 1 FROM publication_interactions i
             WHERE i.publication_id = p.id AND i.user_id = $1 AND i.kind = 'saved') AS is_saved,
           (SELECT COUNT(*)::int FROM publication_interactions i
             WHERE i.publication_id = p.id AND i.kind = 'liked') AS like_count
    FROM publications p
    JOIN users a ON a.id = p.author_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.published_at DESC, p.id DESC
    LIMIT $${args.length - 1} OFFSET $${args.length}
  `, args);
  return res.json({
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
    page: rawPage,
    topics: TOPICS,
  });
});

// Deep links must work independently of feed pagination and filters.
publicationRouter.get('/slug/:slug', async (req, res) => {
  const slug = req.params.slug;
  if (!/^[a-z0-9-]{1,130}$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid publication slug.' });
  }
  const user = await currentUser(req);
  const { rows } = await pool.query(`
    SELECT p.id, p.slug, p.format, p.title, p.summary, p.body, p.topic,
           p.cover_url, p.published_at, p.created_at,
           a.id AS author_id, a.name AS author_name,
           EXISTS (SELECT 1 FROM publication_interactions i
             WHERE i.publication_id = p.id AND i.user_id = $2 AND i.kind = 'liked') AS is_liked,
           EXISTS (SELECT 1 FROM publication_interactions i
             WHERE i.publication_id = p.id AND i.user_id = $2 AND i.kind = 'saved') AS is_saved,
           (SELECT COUNT(*)::int FROM publication_interactions i
             WHERE i.publication_id = p.id AND i.kind = 'liked') AS like_count
    FROM publications p JOIN users a ON a.id = p.author_id
    WHERE p.slug = $1 AND p.status = 'published' AND p.published_at IS NOT NULL
  `, [slug, user?.id ?? null]);
  if (!rows.length) return res.status(404).json({ error: 'Publication not found.' });
  return res.json({ publication: rows[0] });
});

// Publish a concise editorial brief immediately. Only an admin can write.
publicationRouter.post('/', publishLimit, async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Editorial access required.' });

  const title = text(req.body?.title, 180);
  const summary = text(req.body?.summary, 400);
  const body = text(req.body?.body, 10000);
  const topic = req.body?.topic;
  if (title.length < 5 || title.length > 180 || summary.length > 400 ||
      body.length < 20 || body.length > 10000 || !TOPICS.includes(topic)) {
    return res.status(400).json({ error: 'Check title, content and topic.' });
  }
  const slug = publicationSlug(title);
  const { rows } = await pool.query(`
    INSERT INTO publications
      (author_id, slug, format, title, summary, body, topic, status, published_at)
    VALUES ($1, $2, 'brief', $3, $4, $5, $6, 'published', NOW())
    RETURNING id, slug
  `, [user.id, slug, title, summary, body, topic]);
  return res.status(201).json({ publication: rows[0] });
});

// Reader interaction: two independent, persisted states per article.
publicationRouter.put('/:id/interactions', interactionLimit, async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in to interact.' });
  const { kind, active } = req.body ?? {};
  if (!validUuid(req.params.id) || !['liked', 'saved'].includes(kind) || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Invalid interaction.' });
  }
  const exists = await pool.query(
    "SELECT id FROM publications WHERE id = $1 AND status = 'published'",
    [req.params.id],
  );
  if (!exists.rowCount) return res.status(404).json({ error: 'Publication not found.' });
  if (active) {
    await pool.query(`
      INSERT INTO publication_interactions (user_id, publication_id, kind)
      VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
    `, [user.id, req.params.id, kind]);
  } else {
    await pool.query(`
      DELETE FROM publication_interactions WHERE user_id = $1 AND publication_id = $2 AND kind = $3
    `, [user.id, req.params.id, kind]);
  }
  const { rows } = await pool.query(`
    SELECT EXISTS (SELECT 1 FROM publication_interactions WHERE user_id = $1 AND publication_id = $2 AND kind = 'liked') AS is_liked,
           EXISTS (SELECT 1 FROM publication_interactions WHERE user_id = $1 AND publication_id = $2 AND kind = 'saved') AS is_saved,
           (SELECT COUNT(*)::int FROM publication_interactions WHERE publication_id = $2 AND kind = 'liked') AS like_count
  `, [user.id, req.params.id]);
  return res.json(rows[0]);
});

publicationRouter.get('/preferences/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  const { rows } = await pool.query(
    'SELECT feed_density FROM reader_preferences WHERE user_id = $1', [user.id],
  );
  return res.json({ feed_density: rows[0]?.feed_density ?? 'comfortable' });
});
publicationRouter.patch('/preferences/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  const density = req.body?.feed_density;
  if (!['comfortable', 'compact'].includes(density)) {
    return res.status(400).json({ error: 'Invalid reading preference.' });
  }
  await pool.query(`
    INSERT INTO reader_preferences (user_id, feed_density)
    VALUES ($1, $2) ON CONFLICT (user_id)
    DO UPDATE SET feed_density = EXCLUDED.feed_density, updated_at = NOW()
  `, [user.id, density]);
  return res.json({ feed_density: density });
});
