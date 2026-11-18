-- AUTOMATET automatic promotion discovery
BEGIN;

CREATE TABLE IF NOT EXISTS promotion_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_slug text NOT NULL,
  source_name text NOT NULL,
  allowed_domain text NOT NULL,
  feed_url text NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT true,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotion_discovery_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id uuid REFERENCES promotion_sources(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','success','partial','failed')),
  items_seen integer NOT NULL DEFAULT 0,
  candidates_created integer NOT NULL DEFAULT 0,
  message text
);

CREATE INDEX IF NOT EXISTS idx_promotion_sources_enabled
  ON promotion_sources(is_enabled, last_fetched_at);
CREATE INDEX IF NOT EXISTS idx_promotion_discovery_runs_started
  ON promotion_discovery_runs(started_at DESC);

-- Binance's official blog RSS is the first enabled source.
-- Other exchange feeds can be added after their official feed URLs are verified.
INSERT INTO promotion_sources
  (platform_slug, source_name, allowed_domain, feed_url, is_enabled)
VALUES
  ('binance', 'Binance Official Blog', 'binance.com', 'https://blog.binance.com/en/rss', true)
ON CONFLICT (feed_url) DO UPDATE SET
  source_name = EXCLUDED.source_name,
  allowed_domain = EXCLUDED.allowed_domain,
  updated_at = now();

INSERT INTO schema_migrations(version)
VALUES ('0005_automatic_promotion_discovery')
ON CONFLICT (version) DO NOTHING;

COMMIT;
