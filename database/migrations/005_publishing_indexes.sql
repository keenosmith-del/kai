-- Support counts, trending, author studios, cascades and media maintenance.
CREATE INDEX IF NOT EXISTS interactions_publication_kind_idx ON publication_interactions(publication_id,kind,created_at DESC);
CREATE INDEX IF NOT EXISTS publications_author_idx ON publications(author_id,status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments(parent_id);
CREATE INDEX IF NOT EXISTS media_owner_idx ON media(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS account_tokens_user_idx ON account_tokens(user_id,purpose);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status,created_at DESC);
