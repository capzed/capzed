-- AUTOMATET Crypto Deals — PostgreSQL baseline schema
-- Provider-neutral PostgreSQL (Neon-compatible). Apply once to an empty database.
-- Never connect this database directly from browser JavaScript.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  platform_type text NOT NULL CHECK (platform_type IN ('CEX','DEX','WALLET','OTHER')),
  website_url text NOT NULL,
  logo_url text,
  description text,
  trading_fee_maker numeric(8,5),
  trading_fee_taker numeric(8,5),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS platform_categories (
  platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (platform_id, category_id)
);

CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL,
  details text,
  offer_type text NOT NULL CHECK (offer_type IN ('welcome_bonus','fee_discount','cashback','airdrop','deposit_bonus','trading_competition','other')),
  reward_amount numeric(20,8),
  reward_currency text,
  reward_description text,
  terms_url text NOT NULL,
  landing_url text NOT NULL,
  source_url text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  eligibility text,
  region_restrictions text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','verified','expired','rejected')),
  verified_at timestamptz,
  verified_by text,
  last_checked_at timestamptz,
  is_featured boolean NOT NULL DEFAULT false,
  is_sponsored boolean NOT NULL DEFAULT false,
  sponsorship_label text,
  affiliate_url text,
  affiliate_disclosure text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (NOT is_sponsored OR sponsorship_label IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  code text NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','valid','invalid','expired')),
  last_checked_at timestamptz,
  verification_source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE TABLE IF NOT EXISTS news_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text NOT NULL,
  feed_url text,
  source_type text NOT NULL DEFAULT 'rss' CHECK (source_type IN ('rss','official_blog','api','manual')),
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain, feed_url)
);

CREATE TABLE IF NOT EXISTS news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES news_sources(id) ON DELETE SET NULL,
  external_id text,
  canonical_url text NOT NULL UNIQUE,
  headline text NOT NULL,
  summary text,
  image_url text,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text,
  contact_email text,
  website_url text,
  partnership_type text NOT NULL DEFAULT 'other' CHECK (partnership_type IN ('affiliate','advertiser','sponsor','exchange','media','other')),
  status text NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','contacted','negotiating','active','paused','closed')),
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  name text NOT NULL,
  placement_key text NOT NULL,
  creative_url text,
  target_url text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','paused','completed')),
  sponsor_label text NOT NULL DEFAULT 'Sponsored',
  impressions_count bigint NOT NULL DEFAULT 0 CHECK (impressions_count >= 0),
  clicks_count bigint NOT NULL DEFAULT 0 CHECK (clicks_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  promotion_id uuid REFERENCES promotions(id) ON DELETE SET NULL,
  platform_id uuid REFERENCES platforms(id) ON DELETE SET NULL,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  source_page text,
  campaign_tag text,
  anonymous_session_hash text
);

CREATE TABLE IF NOT EXISTS subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  telegram_user_id text UNIQUE,
  consent_status text NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('pending','confirmed','withdrawn')),
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR telegram_user_id IS NOT NULL)
);

-- Map identities from an external authentication provider. No passwords are stored here.
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider text NOT NULL,
  auth_subject text NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','admin','editor','analyst')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platforms_type_status ON platforms(platform_type, status);
CREATE INDEX IF NOT EXISTS idx_promotions_status_expiry ON promotions(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_promotions_platform ON promotions(platform_id);
CREATE INDEX IF NOT EXISTS idx_promotions_featured ON promotions(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_promo_codes_promotion ON promo_codes(promotion_id);
CREATE INDEX IF NOT EXISTS idx_news_published ON news(published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_news_source ON news(source_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_placement_status ON ad_campaigns(placement_key, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_date ON affiliate_clicks(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_promotion ON affiliate_clicks(promotion_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('0001_initial_schema')
ON CONFLICT (version) DO NOTHING;

COMMIT;
