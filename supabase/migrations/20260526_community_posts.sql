CREATE TABLE IF NOT EXISTS community_posts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  category   TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_posts_author_idx   ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS community_posts_created_idx  ON community_posts(created_at DESC);
