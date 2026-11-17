-- Store fee schedules as scoped, source-backed observations instead of treating a single
-- maker/taker number as universal across products, regions, pairs, or VIP tiers.
CREATE TABLE IF NOT EXISTS platform_fee_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  product_scope TEXT NOT NULL CHECK (product_scope IN ('spot', 'futures', 'margin', 'other')),
  fee_tier TEXT NOT NULL DEFAULT 'regular',
  maker_rate NUMERIC(12,8),
  taker_rate NUMERIC(12,8),
  fee_currency TEXT NOT NULL DEFAULT '%',
  source_url TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_fee_sources_source_https CHECK (source_url ~ '^https://')
);
CREATE INDEX IF NOT EXISTS platform_fee_sources_platform_current_idx
  ON platform_fee_sources (platform_id, product_scope, is_current, checked_at DESC);
INSERT INTO schema_migrations (version) VALUES ('0003_platform_fee_sources')
ON CONFLICT (version) DO NOTHING;
