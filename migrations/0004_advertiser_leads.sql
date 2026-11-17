CREATE TABLE IF NOT EXISTS advertiser_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  website_url TEXT,
  interest_type TEXT NOT NULL CHECK (interest_type IN ('sponsored_placement','affiliate_partnership','featured_offer','campaign_reporting','other')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','declined','converted')),
  source_page TEXT NOT NULL DEFAULT '/advertise.html',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertiser_leads_status_created_idx
  ON advertiser_leads (status, created_at DESC);
INSERT INTO schema_migrations (version) VALUES ('0004_advertiser_leads')
ON CONFLICT (version) DO NOTHING;
