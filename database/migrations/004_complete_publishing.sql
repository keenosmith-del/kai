ALTER TABLE users ADD COLUMN IF NOT EXISTS handle TEXT;
UPDATE users SET handle = 'reader-' || replace(id::text, '-', '') WHERE handle IS NULL;
ALTER TABLE users ALTER COLUMN handle SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_unique ON users (lower(handle));
CREATE OR REPLACE FUNCTION kai_user_handle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.handle IS NULL THEN NEW.handle := 'reader-' || replace(NEW.id::text, '-', ''); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS kai_user_handle ON users;
CREATE TRIGGER kai_user_handle BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION kai_user_handle();
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(600) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS content JSONB;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE publications ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]';
ALTER TABLE publications ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS publications_search_idx ON publications USING gin(to_tsvector('english', title || ' ' || summary || ' ' || body || ' ' || topic));
CREATE TABLE IF NOT EXISTS topics (name VARCHAR(60) PRIMARY KEY);
INSERT INTO topics(name) VALUES ('Research'),('Language models'),('AI agents'),('Engineering'),('Automation'),('Models & tools'),('AI in business'),('Perspectives') ON CONFLICT DO NOTHING;
INSERT INTO topics(name) SELECT DISTINCT topic FROM publications ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS follows (
 follower_id UUID REFERENCES users ON DELETE CASCADE,
 author_id UUID REFERENCES users ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(follower_id, author_id), CHECK(follower_id <> author_id)
);
CREATE INDEX IF NOT EXISTS follows_author_idx ON follows(author_id);
CREATE TABLE IF NOT EXISTS topic_follows (
 user_id UUID REFERENCES users ON DELETE CASCADE,
 topic TEXT REFERENCES topics(name) ON DELETE CASCADE ON UPDATE CASCADE,
 PRIMARY KEY(user_id, topic)
);
CREATE TABLE IF NOT EXISTS comments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 publication_id UUID NOT NULL REFERENCES publications ON DELETE CASCADE,
 author_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
 parent_id UUID REFERENCES comments ON DELETE CASCADE,
 body VARCHAR(4000) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_publication_idx ON comments(publication_id, created_at, id);
CREATE TABLE IF NOT EXISTS notifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
 actor_id UUID REFERENCES users ON DELETE CASCADE,
 event TEXT NOT NULL CHECK(event IN ('follow','like','comment','reply','moderation')),
 publication_id UUID REFERENCES publications ON DELETE CASCADE,
 comment_id UUID REFERENCES comments ON DELETE CASCADE,
 destination TEXT NOT NULL,
 dedupe_key TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(recipient_id) WHERE read_at IS NULL;
ALTER TABLE reader_preferences ADD COLUMN IF NOT EXISTS default_feed TEXT NOT NULL DEFAULT 'for-you' CHECK(default_feed IN ('for-you','latest','following'));
ALTER TABLE reader_preferences ADD COLUMN IF NOT EXISTS notification_events TEXT[] NOT NULL DEFAULT ARRAY['follow','like','comment','reply','moderation'];
CREATE TABLE IF NOT EXISTS media (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
 filename TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reports (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
 publication_id UUID REFERENCES publications ON DELETE CASCADE,
 comment_id UUID REFERENCES comments ON DELETE CASCADE,
 reason VARCHAR(1000) NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((publication_id IS NULL) <> (comment_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS reports_post_unique ON reports(reporter_id, publication_id) WHERE publication_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_comment_unique ON reports(reporter_id, comment_id) WHERE comment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS account_tokens (
 token_hash TEXT PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
 expires_at TIMESTAMPTZ NOT NULL
);
