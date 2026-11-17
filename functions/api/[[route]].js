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
  return Boolean(expected && supplied.startsWith("Bearer ") &&
    supplied.slice(7).length === expected.length &&
    supplied.slice(7) === expected);
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
               trading_fee_maker, trading_fee_taker
        FROM platforms WHERE status = 'published'
        ORDER BY name ASC LIMIT 100
      `;
      return json({ data: rows });
    }

    if (method === "GET" && path === "/api/promotions") {
      const rows = await sql`
        SELECT p.id, p.slug, p.title, p.summary, p.offer_type, p.reward_amount,
               p.reward_currency, p.reward_description, p.terms_url, p.landing_url,
               p.starts_at, p.ends_at, p.eligibility, p.region_restrictions,
               p.is_featured, p.is_sponsored, p.sponsorship_label, p.affiliate_url,
               p.affiliate_disclosure, pl.slug AS platform_slug, pl.name AS platform_name,
               pl.platform_type
        FROM promotions p JOIN platforms pl ON pl.id = p.platform_id
        WHERE p.status = 'verified'
          AND pl.status = 'published'
          AND (p.starts_at IS NULL OR p.starts_at <= now())
          AND (p.ends_at IS NULL OR p.ends_at > now())
        ORDER BY p.is_featured DESC, p.updated_at DESC LIMIT 100
      `;
      return json({ data: rows });
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

      if (method === "GET" && path === "/api/admin/promotions/pending") {
        const rows = await sql`
          SELECT id, title, slug, source_url, created_at
          FROM promotions WHERE status = 'pending'
          ORDER BY created_at ASC LIMIT 100
        `;
        return json({ data: rows }, 200);
      }

      if (method === "GET" && path === "/api/admin/platforms") {
        const rows = await sql`
          SELECT id, name, slug, platform_type
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

      if (method === "POST" && path === "/api/admin/promotions") {
        const body = await request.json();
        const required = ["platform_id", "slug", "title", "summary", "offer_type", "terms_url", "landing_url", "source_url"];
        if (required.some((key) => typeof body[key] !== "string" || !body[key].trim())) {
          return fail("Missing required promotion fields");
        }
        if (![body.terms_url, body.landing_url, body.source_url].every(isHttps)) {
          return fail("All promotion URLs must use HTTPS");
        }
        const rows = await sql`
          INSERT INTO promotions
            (platform_id, slug, title, summary, details, offer_type, reward_amount,
             reward_currency, reward_description, terms_url, landing_url, source_url,
             starts_at, ends_at, eligibility, region_restrictions, status,
             affiliate_url, affiliate_disclosure)
          VALUES
            (${body.platform_id}, ${body.slug.trim()}, ${body.title.trim()},
             ${body.summary.trim()}, ${body.details || null}, ${body.offer_type},
             ${body.reward_amount ?? null}, ${body.reward_currency || null},
             ${body.reward_description || null}, ${body.terms_url}, ${body.landing_url},
             ${body.source_url}, ${body.starts_at || null}, ${body.ends_at || null},
             ${body.eligibility || null}, ${body.region_restrictions || null}, 'pending',
             ${body.affiliate_url && isHttps(body.affiliate_url) ? body.affiliate_url : null},
             ${body.affiliate_disclosure || null})
          RETURNING id, slug, title, status
        `;
        return json({ data: rows[0], message: "Saved for verification; not publicly visible yet." }, 201);
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
  return new Response(response.body, { status: response.status, headers });
}
