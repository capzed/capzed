import { neon } from "@neondatabase/serverless";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=60, s-maxage=120" : "no-store",
    "x-content-type-options": "nosniff",
  },
});

const fail = (message, status = 400) => json({ error: message }, status);
const isHttps = (value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

function getDb(env) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(env.DATABASE_URL);
}

function authorized(request, env) {
  const expected = env.ADMIN_API_TOKEN;
  const supplied = request.headers.get("authorization") || "";
  if (!expected || !supplied.startsWith("Bearer ")) return false;
  const candidate = supplied.slice(7);
  if (candidate.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
  }
  return difference === 0;
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": url.origin,
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-max-age": "86400",
    }});
  }

  try {
    const sql = getDb(env);

    if (method === "GET" && path === "/api/health") {
      const rows = await sql`SELECT now() AS database_time`;
      return json({ status: "ok", database: "connected", time: rows[0].database_time });
    }

    if (method === "GET" && path === "/api/platforms") {
      const rows = await sql`
        SELECT id, slug, name, platform_type, website_url, logo_url, description,
               (SELECT maker_rate FROM platform_fee_sources fs WHERE fs.platform_id = platforms.id AND fs.product_scope = 'spot' AND fs.fee_tier = 'regular' AND fs.is_current = true ORDER BY fs.checked_at DESC LIMIT 1) AS trading_fee_maker,
               (SELECT taker_rate FROM platform_fee_sources fs WHERE fs.platform_id = platforms.id AND fs.product_scope = 'spot' AND fs.fee_tier = 'regular' AND fs.is_current = true ORDER BY fs.checked_at DESC LIMIT 1) AS trading_fee_taker,
               (SELECT source_url FROM platform_fee_sources fs WHERE fs.platform_id = platforms.id AND fs.product_scope = 'spot' AND fs.fee_tier = 'regular' AND fs.is_current = true ORDER BY fs.checked_at DESC LIMIT 1) AS fee_source_url,
               (SELECT checked_at FROM platform_fee_sources fs WHERE fs.platform_id = platforms.id AND fs.product_scope = 'spot' AND fs.fee_tier = 'regular' AND fs.is_current = true ORDER BY fs.checked_at DESC LIMIT 1) AS fee_checked_at,
               (SELECT availability_status FROM platform_region_availability r
                 WHERE r.platform_id = platforms.id AND r.country_code = 'DZ') AS algeria_status
        FROM platforms WHERE status = 'published'
        ORDER BY name ASC LIMIT 100
      `;
      return json({ data: rows });
    }

    const platformDetailMatch = method === "GET" ? path.match(/^\/api\/platforms\/([a-z0-9-]+)$/i) : null;
    if (platformDetailMatch) {
      const slug = platformDetailMatch[1];
      const rows = await sql`
        SELECT p.id, p.slug, p.name, p.platform_type, p.website_url, p.logo_url,
               p.description,
               (SELECT maker_rate FROM platform_fee_sources fs WHERE fs.platform_id = p.id AND fs.product_scope = 'spot' AND fs.fee_tier = 'regular' AND fs.is_current = true ORDER BY fs.checked_at DESC LIMIT 1) AS trading_fee_maker,
               (SELECT taker_rate FROM platform_fee_sources fs WHERE fs.platform_id = p.id AND fs.product_scope = 'spot' AND fs.fee_tier = 'regular' AND fs.is_current = true ORDER BY fs.checked_at DESC LIMIT 1) AS trading_fee_taker,
               (SELECT source_url FROM platform_fee_sources fs WHERE fs.platform_id = p.id AND fs.product_scope = 'spot' AND fs.fee_tier = 'regular' AND fs.is_current = true ORDER BY fs.checked_at DESC LIMIT 1) AS fee_source_url,
               (SELECT checked_at FROM platform_fee_sources fs WHERE fs.platform_id = p.id AND fs.product_scope = 'spot' AND fs.fee_tier = 'regular' AND fs.is_current = true ORDER BY fs.checked_at DESC LIMIT 1) AS fee_checked_at,
               (SELECT json_agg(json_build_object('slug', c.slug, 'name', c.name))
                  FROM platform_categories pc JOIN categories c ON c.id = pc.category_id
                 WHERE pc.platform_id = p.id) AS categories,
               (SELECT json_build_object('status', r.availability_status, 'evidence_url', r.evidence_url,
                         'checked_at', r.checked_at, 'notes', r.notes)
                  FROM platform_region_availability r
                 WHERE r.platform_id = p.id AND r.country_code = 'DZ') AS algeria,
               (SELECT count(*)::int FROM promotions pr
                 WHERE pr.platform_id = p.id AND pr.status = 'verified'
                   AND (pr.starts_at IS NULL OR pr.starts_at <= now())
                   AND (pr.ends_at IS NULL OR pr.ends_at > now())) AS active_promotions
        FROM platforms p WHERE p.slug = ${slug} AND p.status = 'published' LIMIT 1
      `;
      if (!rows.length) return fail("Platform not found", 404);
      return json({ data: rows[0] });
    }

    if (method === "GET" && path === "/api/promotions") {
      const rows = await sql`
        SELECT p.id, p.slug, p.title, p.summary, p.offer_type, p.reward_amount,
               p.reward_currency, p.reward_description, p.terms_url, p.landing_url,
               p.starts_at, p.ends_at, p.eligibility, p.region_restrictions,
               p.is_featured, p.is_sponsored, p.sponsorship_label, p.affiliate_url,
               p.affiliate_disclosure,
               (SELECT pc.code FROM promo_codes pc WHERE pc.promotion_id = p.id
                 AND pc.status = 'valid'
                 AND (pc.valid_from IS NULL OR pc.valid_from <= now())
                 AND (pc.valid_until IS NULL OR pc.valid_until > now())
                 ORDER BY pc.created_at DESC LIMIT 1) AS promo_code,
               pl.slug AS platform_slug, pl.name AS platform_name, pl.platform_type
        FROM promotions p JOIN platforms pl ON pl.id = p.platform_id
        WHERE p.status = 'verified'
          AND pl.status = 'published'
          AND (p.starts_at IS NULL OR p.starts_at <= now())
          AND (p.ends_at IS NULL OR p.ends_at > now())
        ORDER BY p.is_featured DESC, p.updated_at DESC LIMIT 100
      `;
      return json({ data: rows });
    }

    const clickMatch = method === "GET" ? path.match(/^\/api\/go\/([a-z0-9-]+)$/i) : null;
    if (clickMatch) {
      const slug = clickMatch[1];
      const rows = await sql`
        SELECT p.id AS promotion_id, p.platform_id, COALESCE(p.affiliate_url, p.landing_url) AS target_url
        FROM promotions p
        JOIN platforms pl ON pl.id = p.platform_id
        WHERE p.slug = ${slug}
          AND p.status = 'verified' AND pl.status = 'published'
          AND (p.starts_at IS NULL OR p.starts_at <= now())
          AND (p.ends_at IS NULL OR p.ends_at > now())
        LIMIT 1
      `;
      if (!rows.length || !isHttps(rows[0].target_url)) return fail("Offer is no longer available", 404);
      const sourcePage = (url.searchParams.get("from") || "/").slice(0, 160);
      await sql`
        INSERT INTO affiliate_clicks (promotion_id, platform_id, source_page, campaign_tag)
        VALUES (${rows[0].promotion_id}, ${rows[0].platform_id}, ${sourcePage}, 'website')
      `;
      return new Response(null, { status: 302, headers: {
        "location": rows[0].target_url,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff"
      }});
    }

    if (method === "GET" && path === "/api/ads") {
      const placement = url.searchParams.get("placement") || "";
      if (!/^[a-z0-9_-]{2,40}$/i.test(placement)) return fail("Invalid ad placement");
      const rows = await sql`
        SELECT id, name, placement_key, creative_url, sponsor_label
        FROM ad_campaigns
        WHERE placement_key = ${placement} AND status = 'active'
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at > now())
        ORDER BY created_at DESC LIMIT 3
      `;
      for (const row of rows) {
        await sql`UPDATE ad_campaigns SET impressions_count = impressions_count + 1, updated_at = now()
          WHERE id = ${row.id}`;
      }
      return json({ data: rows });
    }

    const adClickMatch = method === "GET" ? path.match(/^\/api\/ad-go\/([0-9a-f-]{36})$/i) : null;
    if (adClickMatch) {
      const rows = await sql`
        SELECT id, target_url FROM ad_campaigns
        WHERE id = ${adClickMatch[1]} AND status = 'active'
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at > now())
        LIMIT 1
      `;
      if (!rows.length || !isHttps(rows[0].target_url)) return fail("Sponsored campaign is unavailable", 404);
      await sql`UPDATE ad_campaigns SET clicks_count = clicks_count + 1, updated_at = now() WHERE id = ${rows[0].id}`;
      return new Response(null, { status: 302, headers: {
        "location": rows[0].target_url, "cache-control": "no-store",
        "referrer-policy": "no-referrer", "x-content-type-options": "nosniff"
      }});
    }

    if (method === "POST" && path === "/api/advertiser-leads") {
      const body = await request.json();
      if (String(body.company_fax || "").trim()) {
        return json({ message: "Thank you. Your inquiry has been received." }, 201);
      }
      const email = String(body.contact_email || "").trim();
      const allowed = ["sponsored_placement", "affiliate_partnership", "featured_offer", "campaign_reporting", "other"];
      if (!String(body.company_name || "").trim() || !String(body.contact_name || "").trim() ||
          !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) ||
          !allowed.includes(body.interest_type) || String(body.message || "").trim().length < 10) {
        return fail("Please provide company, contact, valid email, inquiry type and a message of at least 10 characters");
      }
      if (body.website_url && !isHttps(body.website_url)) return fail("Website URL must use HTTPS");
      if ([body.company_name, body.contact_name, email, body.message].some(v => String(v).length > 2000)) {
        return fail("One or more fields are too long");
      }
      await sql`
        INSERT INTO advertiser_leads
          (company_name, contact_name, contact_email, website_url, interest_type, message, source_page)
        VALUES
          (${String(body.company_name).trim().slice(0,160)},
           ${String(body.contact_name).trim().slice(0,120)},
           ${email.slice(0,180)},
           ${body.website_url || null},
           ${body.interest_type},
           ${String(body.message).trim().slice(0,2000)},
           ${String(body.source_page || "/advertise.html").slice(0,160)})
      `;
      return json({ message: "Thank you. Your inquiry has been received." }, 201);
    }

    if (method === "GET" && path === "/api/news") {
      const rows = await sql`
        SELECT n.id, n.headline, n.summary, n.canonical_url, n.image_url,
               n.published_at, s.name AS publisher, s.domain AS publisher_domain
        FROM news n LEFT JOIN news_sources s ON s.id = n.source_id
        WHERE n.status = 'published'
        ORDER BY n.published_at DESC NULLS LAST LIMIT 30
      `;
      return json({ data: rows });
    }

    if (path.startsWith("/api/admin/")) {
      if (!authorized(request, env)) return fail("Unauthorized", 401);

      if (method === "GET" && path === "/api/admin/advertiser-leads") {
        const rows = await sql`
          SELECT id, company_name, contact_name, contact_email, website_url,
                 interest_type, message, status, source_page, created_at
          FROM advertiser_leads ORDER BY created_at DESC LIMIT 200
        `;
        return json({ data: rows }, 200);
      }

      const leadStatusMatch = method === "PATCH" ? path.match(/^\/api\/admin\/advertiser-leads\/([0-9a-f-]{36})\/status$/i) : null;
      if (leadStatusMatch) {
        const body = await request.json();
        if (!["new", "contacted", "qualified", "declined", "converted"].includes(body.status)) {
          return fail("Invalid lead status");
        }
        const rows = await sql`
          UPDATE advertiser_leads SET status = ${body.status}, updated_at = now()
          WHERE id = ${leadStatusMatch[1]}
          RETURNING id, company_name, status
        `;
        if (!rows.length) return fail("Lead not found", 404);
        return json({ data: rows[0] });
      }

      if (method === "GET" && path === "/api/admin/metrics") {
        const rows = await sql`
          SELECT
            (SELECT count(*)::int FROM platforms) AS platforms_total,
            (SELECT count(*)::int FROM platforms WHERE status = 'published') AS platforms_published,
            (SELECT count(*)::int FROM promotions) AS promotions_total,
            (SELECT count(*)::int FROM promotions WHERE status = 'pending') AS promotions_pending,
            (SELECT count(*)::int FROM promotions WHERE status = 'verified'
              AND (starts_at IS NULL OR starts_at <= now())
              AND (ends_at IS NULL OR ends_at > now())) AS promotions_active,
            (SELECT count(*)::int FROM news WHERE status = 'published') AS news_published,
            (SELECT count(*)::int FROM affiliate_clicks
              WHERE clicked_at >= now() - interval '30 days') AS affiliate_clicks_30d,
            (SELECT count(*)::int FROM ad_campaigns WHERE status = 'active'
              AND (starts_at IS NULL OR starts_at <= now())
              AND (ends_at IS NULL OR ends_at > now())) AS ads_active,
            (SELECT COALESCE(sum(clicks_count),0)::int FROM ad_campaigns) AS ad_clicks_total
        `;
        return json({ data: rows[0] }, 200);
      }

      if (method === "GET" && path === "/api/admin/regions") {
        const rows = await sql`
          SELECT p.id AS platform_id, p.name AS platform_name, p.slug,
                 r.availability_status, r.evidence_url, r.checked_at, r.notes
          FROM platforms p LEFT JOIN platform_region_availability r
            ON r.platform_id = p.id AND r.country_code = 'DZ'
          ORDER BY p.name ASC LIMIT 200
        `;
        return json({ data: rows }, 200);
      }

      const regionMatch = method === "PATCH" ? path.match(/^\/api\/admin\/platforms\/([0-9a-f-]{36})\/region\/DZ$/i) : null;
      if (regionMatch) {
        const body = await request.json();
        const allowed = ["available", "restricted", "unavailable", "unknown"];
        if (!allowed.includes(body.availability_status)) return fail("Invalid regional availability status");
        if (body.availability_status !== "unknown" && !isHttps(body.evidence_url || "")) {
          return fail("An official HTTPS evidence URL is required for a confirmed regional status");
        }
        if (body.evidence_url && !isHttps(body.evidence_url)) return fail("Evidence URL must use HTTPS");
        const exists = await sql`SELECT id FROM platforms WHERE id = ${regionMatch[1]} LIMIT 1`;
        if (!exists.length) return fail("Platform not found", 404);
        const rows = await sql`
          INSERT INTO platform_region_availability
            (platform_id, country_code, availability_status, evidence_url, checked_at, notes, updated_at)
          VALUES
            (${regionMatch[1]}, 'DZ', ${body.availability_status},
             ${body.evidence_url || null},
             now(), ${body.notes || null}, now())
          ON CONFLICT (platform_id, country_code) DO UPDATE SET
            availability_status = EXCLUDED.availability_status,
            evidence_url = EXCLUDED.evidence_url,
            checked_at = now(), notes = EXCLUDED.notes, updated_at = now()
          RETURNING platform_id, country_code, availability_status, evidence_url, checked_at, notes
        `;
        return json({ data: rows[0] }, 200);
      }

      if (method === "GET" && path === "/api/admin/fees") {
        const rows = await sql`
          SELECT fs.id, fs.platform_id, p.name AS platform_name, p.slug,
                 fs.product_scope, fs.fee_tier, fs.maker_rate, fs.taker_rate,
                 fs.fee_currency, fs.source_url, fs.checked_at, fs.notes, fs.is_current
          FROM platform_fee_sources fs JOIN platforms p ON p.id = fs.platform_id
          ORDER BY p.name ASC, fs.product_scope ASC, fs.checked_at DESC LIMIT 300
        `;
        return json({ data: rows }, 200);
      }

      if (method === "POST" && path === "/api/admin/fees") {
        const body = await request.json();
        const scopes = ["spot", "futures", "margin", "other"];
        const rate = (v) => v === null || v === "" || v === undefined ? null : Number(v);
        const maker = rate(body.maker_rate), taker = rate(body.taker_rate);
        if (!/^[0-9a-f-]{36}$/i.test(body.platform_id || "") ||
            !scopes.includes(body.product_scope) || !String(body.fee_tier || "").trim() ||
            !isHttps(body.source_url || "") ||
            (maker !== null && (!Number.isFinite(maker) || maker < -100 || maker > 100)) ||
            (taker !== null && (!Number.isFinite(taker) || taker < -100 || taker > 100)) ||
            (maker === null && taker === null)) {
          return fail("Platform, product scope, fee tier, at least one valid rate and official HTTPS source are required");
        }
        const exists = await sql`SELECT id FROM platforms WHERE id = ${body.platform_id} LIMIT 1`;
        if (!exists.length) return fail("Platform not found", 404);
        await sql`UPDATE platform_fee_sources SET is_current = false, updated_at = now()
          WHERE platform_id = ${body.platform_id} AND product_scope = ${body.product_scope}
            AND fee_tier = ${String(body.fee_tier).trim()} AND is_current = true`;
        const rows = await sql`
          INSERT INTO platform_fee_sources
            (platform_id, product_scope, fee_tier, maker_rate, taker_rate, fee_currency,
             source_url, checked_at, notes, is_current)
          VALUES
            (${body.platform_id}, ${body.product_scope}, ${String(body.fee_tier).trim()},
             ${maker}, ${taker}, ${String(body.fee_currency || "%").slice(0, 12)},
             ${body.source_url}, now(), ${body.notes || null}, true)
          RETURNING id, platform_id, product_scope, fee_tier, maker_rate, taker_rate,
                    source_url, checked_at, notes, is_current
        `;
        return json({ data: rows[0], message: "Source-backed fee record saved. Previous record retained as history." }, 201);
      }

      if (method === "GET" && path === "/api/admin/partners") {
        const rows = await sql`
          SELECT id, company_name, contact_name, contact_email, website_url,
                 partnership_type, status, created_at
          FROM partners ORDER BY company_name ASC LIMIT 200
        `;
        return json({ data: rows }, 200);
      }

      if (method === "POST" && path === "/api/admin/partners") {
        const body = await request.json();
        const types = ["affiliate", "advertiser", "sponsor", "exchange", "media", "other"];
        if (!body.company_name?.trim() || !types.includes(body.partnership_type)) {
          return fail("Company name and a valid partnership type are required");
        }
        if (body.website_url && !isHttps(body.website_url)) return fail("Partner website must use HTTPS");
        if (body.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact_email)) {
          return fail("Contact email is invalid");
        }
        const rows = await sql`
          INSERT INTO partners
            (company_name, contact_name, contact_email, website_url, partnership_type, status)
          VALUES
            (${body.company_name.trim()}, ${body.contact_name || null},
             ${body.contact_email || null}, ${body.website_url || null},
             ${body.partnership_type}, 'prospect')
          RETURNING id, company_name, partnership_type, status
        `;
        return json({ data: rows[0], message: "Partner saved as a prospect." }, 201);
      }

      if (method === "GET" && path === "/api/admin/ads") {
        const rows = await sql`
          SELECT a.id, a.name, a.placement_key, a.target_url, a.sponsor_label,
                 a.starts_at, a.ends_at, a.status, a.impressions_count, a.clicks_count,
                 p.company_name AS partner_name
          FROM ad_campaigns a LEFT JOIN partners p ON p.id = a.partner_id
          ORDER BY a.created_at DESC LIMIT 100
        `;
        return json({ data: rows }, 200);
      }

      if (method === "POST" && path === "/api/admin/ads") {
        const body = await request.json();
        const placement = String(body.placement_key || "");
        if (!body.name?.trim() || !/^[a-z0-9_-]{2,40}$/i.test(placement) ||
            !isHttps(body.target_url || "") || !String(body.sponsor_label || "").trim()) {
          return fail("Name, valid placement, HTTPS target URL and sponsor label are required");
        }
        if (body.creative_url && !isHttps(body.creative_url)) return fail("Creative URL must use HTTPS");
        let partnerId = null;
        if (body.partner_id) {
          if (!/^[0-9a-f-]{36}$/i.test(body.partner_id)) return fail("Invalid partner");
          const partnerRows = await sql`SELECT id FROM partners WHERE id = ${body.partner_id} LIMIT 1`;
          if (!partnerRows.length) return fail("Partner not found", 404);
          partnerId = partnerRows[0].id;
        }
        const rows = await sql`
          INSERT INTO ad_campaigns
            (partner_id, name, placement_key, creative_url, target_url, starts_at, ends_at, status, sponsor_label)
          VALUES
            (${partnerId}, ${body.name.trim()}, ${placement}, ${body.creative_url || null},
             ${body.target_url}, ${body.starts_at || null}, ${body.ends_at || null},
             'draft', ${String(body.sponsor_label).trim()})
          RETURNING id, name, placement_key, status
        `;
        return json({ data: rows[0], message: "Campaign saved as draft. Activate it after checking the advertiser and creative." }, 201);
      }

      const adStatusMatch = method === "PATCH" ? path.match(/^\/api\/admin\/ads\/([0-9a-f-]{36})\/status$/i) : null;
      if (adStatusMatch) {
        const body = await request.json();
        if (!["draft", "scheduled", "active", "paused", "completed"].includes(body.status)) return fail("Invalid campaign status");
        const rows = await sql`
          UPDATE ad_campaigns SET status = ${body.status}, updated_at = now()
          WHERE id = ${adStatusMatch[1]}
          RETURNING id, name, status
        `;
        if (!rows.length) return fail("Campaign not found", 404);
        return json({ data: rows[0] });
      }

      if (method === "GET" && path === "/api/admin/promotions/pending") {
        const rows = await sql`
          SELECT p.id, p.title, p.slug, p.source_url, p.created_at,
                 (SELECT pc.id FROM promo_codes pc WHERE pc.promotion_id = p.id ORDER BY pc.created_at DESC LIMIT 1) AS promo_code_id,
                 (SELECT pc.code FROM promo_codes pc WHERE pc.promotion_id = p.id ORDER BY pc.created_at DESC LIMIT 1) AS promo_code
          FROM promotions p WHERE p.status = 'pending'
          ORDER BY p.created_at ASC LIMIT 100
        `;
        return json({ data: rows }, 200);
      }

      if (method === "GET" && path === "/api/admin/platforms") {
        const rows = await sql`
          SELECT id, name, slug, platform_type, website_url, status, description
          FROM platforms ORDER BY name ASC LIMIT 100
        `;
        return json({ data: rows }, 200);
      }

      const platformPrefix = "/api/admin/platforms/";
      const platformId = method === "PATCH" && path.startsWith(platformPrefix) && path.endsWith("/status")
        ? path.slice(platformPrefix.length, -"/status".length) : "";
      const platformMatch = /^[0-9a-f-]{36}$/i.test(platformId) ? platformId : null;
      if (method === "PATCH" && platformMatch) {
        const body = await request.json();
        if (!["published", "suspended", "draft"].includes(body.status)) return fail("Invalid status");
        const rows = await sql`
          UPDATE platforms SET status = ${body.status}, updated_at = now()
          WHERE id = ${platformMatch}
          RETURNING id, slug, name, platform_type, status
        `;
        if (!rows.length) return fail("Platform not found", 404);
        return json({ data: rows[0] });
      }

      if (method === "POST" && path === "/api/admin/platforms") {
        const body = await request.json();
        if (!["CEX","DEX","WALLET","OTHER"].includes(body.platform_type) ||
            !body.slug?.trim() || !body.name?.trim() || !isHttps(body.website_url || "")) {
          return fail("Provide a name, slug, valid platform type, and HTTPS website URL");
        }
        const rows = await sql`
          INSERT INTO platforms (slug, name, platform_type, website_url, logo_url, description, status)
          VALUES (${body.slug.trim()}, ${body.name.trim()}, ${body.platform_type},
                  ${body.website_url}, ${body.logo_url && isHttps(body.logo_url) ? body.logo_url : null},
                  ${body.description || null}, 'draft')
          RETURNING id, slug, name, platform_type, status
        `;
        return json({ data: rows[0], message: "Platform created as draft." }, 201);
      }

      if (method === "POST" && path === "/api/admin/news") {
        const body = await request.json();
        if (!body.publisher?.trim() || !body.headline?.trim() ||
            !body.canonical_url || !isHttps(body.canonical_url)) {
          return fail("Publisher, headline, and an HTTPS canonical URL are required");
        }
        const parsed = new URL(body.canonical_url);
        const domain = parsed.hostname.toLowerCase();
        const found = await sql`SELECT id FROM news_sources WHERE domain = ${domain} LIMIT 1`;
        const sourceRows = found.length ? found : await sql`
          INSERT INTO news_sources (name, domain, source_type)
          VALUES (${body.publisher.trim()}, ${domain}, 'manual')
          RETURNING id
        `;
        const rows = await sql`
          INSERT INTO news (source_id, canonical_url, headline, summary, image_url, published_at, status)
          VALUES (${sourceRows[0].id}, ${body.canonical_url}, ${body.headline.trim()},
                  ${body.summary || null}, ${body.image_url && isHttps(body.image_url) ? body.image_url : null},
                  ${body.published_at || null}, 'published')
          ON CONFLICT (canonical_url) DO UPDATE SET
            source_id = EXCLUDED.source_id, headline = EXCLUDED.headline,
            summary = EXCLUDED.summary, published_at = EXCLUDED.published_at,
            status = 'published'
          RETURNING id, headline, canonical_url, published_at
        `;
        return json({ data: rows[0] }, 201);
      }

      if (method === "POST" && path === "/api/admin/promotions") {
        const body = await request.json();
        const required = ["platform_id", "slug", "title", "summary", "offer_type", "terms_url", "landing_url", "source_url"];
        if (required.some((key) => typeof body[key] !== "string" || !body[key].trim())) {
          return fail("Missing required promotion fields");
        }
        if (![body.terms_url, body.landing_url, body.source_url].every(isHttps)) {
          return fail("All promotion URLs must use HTTPS");
        }
        if (body.is_sponsored && !String(body.sponsorship_label || "").trim()) {
          return fail("Sponsored promotions require a visible sponsorship label");
        }
        const rows = await sql`
          INSERT INTO promotions
            (platform_id, slug, title, summary, details, offer_type, reward_amount,
             reward_currency, reward_description, terms_url, landing_url, source_url,
             starts_at, ends_at, eligibility, region_restrictions, status,
             is_sponsored, sponsorship_label, affiliate_url, affiliate_disclosure)
          VALUES
            (${body.platform_id}, ${body.slug.trim()}, ${body.title.trim()},
             ${body.summary.trim()}, ${body.details || null}, ${body.offer_type},
             ${body.reward_amount ?? null}, ${body.reward_currency || null},
             ${body.reward_description || null}, ${body.terms_url}, ${body.landing_url},
             ${body.source_url}, ${body.starts_at || null}, ${body.ends_at || null},
             ${body.eligibility || null}, ${body.region_restrictions || null}, 'pending',
             ${Boolean(body.is_sponsored)}, ${body.is_sponsored ? String(body.sponsorship_label).trim() : null},
             ${body.affiliate_url && isHttps(body.affiliate_url) ? body.affiliate_url : null},
             ${body.affiliate_disclosure || null})
          RETURNING id, slug, title, status
        `;
        if (body.promo_code && String(body.promo_code).trim()) {
          await sql`
            INSERT INTO promo_codes (promotion_id, code, valid_from, valid_until, status, verification_source_url)
            VALUES (${rows[0].id}, ${String(body.promo_code).trim()}, ${body.starts_at || null},
                    ${body.ends_at || null}, 'unverified', ${body.source_url})
          `;
        }
        return json({ data: rows[0], message: "Saved for verification; not publicly visible yet." }, 201);
      }

      const codePrefix = "/api/admin/promo-codes/";
      const codeId = method === "PATCH" && path.startsWith(codePrefix) && path.endsWith("/status")
        ? path.slice(codePrefix.length, -"/status".length) : "";
      if (method === "PATCH" && /^[0-9a-f-]{36}$/i.test(codeId)) {
        const body = await request.json();
        if (!["valid", "invalid", "expired"].includes(body.status)) return fail("Invalid promo code status");
        const rows = await sql`
          UPDATE promo_codes SET status = ${body.status}, last_checked_at = now()
          WHERE id = ${codeId}
          RETURNING id, promotion_id, code, status
        `;
        if (!rows.length) return fail("Promo code not found", 404);
        return json({ data: rows[0] });
      }

      const match = path.match(/^\/api\/admin\/promotions\/([0-9a-f-]+)\/status$/i);
      if (method === "PATCH" && match) {
        const body = await request.json();
        if (!["verified", "rejected", "expired", "pending"].includes(body.status)) {
          return fail("Invalid status");
        }
        const rows = await sql`
          UPDATE promotions SET status = ${body.status},
            verified_at = CASE WHEN ${body.status} = 'verified' THEN now() ELSE verified_at END,
            last_checked_at = now(), updated_at = now()
          WHERE id = ${match[1]}
          RETURNING id, slug, title, status
        `;
        if (!rows.length) return fail("Promotion not found", 404);
        return json({ data: rows[0] });
      }

      return fail("Admin endpoint not found", 404);
    }

    return fail("Not found", 404);
  } catch (error) {
    // Keep provider details, SQL text, and credentials out of public responses.
    console.error("AUTOMATET API error:", error?.message || "unknown");
    if (String(error?.message || "").includes("DATABASE_URL")) {
      return json({ error: "Database is not configured yet." }, 503);
    }
    return json({ error: "Service temporarily unavailable." }, 503);
  }
}

export async function onRequest(context) {
  const response = await handle(context.request, context.env);
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  if (new URL(context.request.url).pathname.startsWith("/api/admin/")) {
    headers.set("cache-control", "no-store");
  }
  return new Response(response.body, { status: response.status, headers });
}
