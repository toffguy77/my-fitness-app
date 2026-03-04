CREATE TYPE content_category AS ENUM (
  'nutrition',
  'training',
  'recipes',
  'health',
  'motivation',
  'general'
);

CREATE TYPE content_status AS ENUM (
  'draft',
  'scheduled',
  'published'
);

CREATE TYPE audience_type AS ENUM (
  'all',
  'my_clients',
  'selected'
);

CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id BIGINT NOT NULL REFERENCES users(id),
  title VARCHAR(500) NOT NULL,
  excerpt VARCHAR(1000),
  cover_image_url TEXT,
  category content_category NOT NULL DEFAULT 'general',
  status content_status NOT NULL DEFAULT 'draft',
  content_s3_key TEXT,
  audience_scope audience_type NOT NULL DEFAULT 'my_clients',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE article_audience (
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, client_id)
);

CREATE INDEX idx_articles_author ON articles(author_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_scheduled ON articles(status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX idx_article_audience_client ON article_audience(client_id);
