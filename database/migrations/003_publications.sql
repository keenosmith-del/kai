-- kai: publication discovery, reader interactions and reading preferences.
-- Safe to apply to an existing installation; never drops user or auth data.
BEGIN;

CREATE TABLE IF NOT EXISTS publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL DEFAULT 'brief' CHECK (format IN ('brief', 'story')),
  title VARCHAR(180) NOT NULL,
  summary VARCHAR(400) NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  topic VARCHAR(60) NOT NULL,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS publications_feed_idx
  ON publications (published_at DESC, id DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS publications_topic_feed_idx
  ON publications (topic, published_at DESC)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS publication_interactions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('liked', 'saved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, publication_id, kind)
);
CREATE INDEX IF NOT EXISTS publication_interactions_list_idx
  ON publication_interactions (user_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS reader_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  feed_density TEXT NOT NULL DEFAULT 'comfortable'
    CHECK (feed_density IN ('comfortable', 'compact')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
