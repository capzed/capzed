import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL secret is required");
const sql = neon(DATABASE_URL);

const PROMO_TERMS = [
  /\bpromotion\b/i, /\bbonus\b/i, /\bairdrop\b/i, /\bcashback\b/i,
  /\bfee discount\b/i, /\btrading competition\b/i, /\btrading contest\b/i,
  /\breward(s)?\b/i, /\bwelcome offer\b/i, /\bdeposit bonus\b/i,
  /\bshare up to\b/i, /\bwin up to\b/i, /\bvoucher(s)?\b/i,
  /\bcampaign\b/i, /\btask(s)? to earn\b/i
];
const EXCLUDE_TERMS = [
  /maintenance/i, /system upgrade/i, /will list/i, /new listing/i,
  /delisting/i, /deposit and withdrawal.*suspend/i, /trading pair.*remove/i
];

function decode(value = "") {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ").trim();
}
function tag(xml, name) {
  const match = xml.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? decode(match[1]) : "";
}
function parseFeed(xml) {
  const rss = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
  const atom = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m => m[1]);
  return (rss.length ? rss : atom).slice(0, 40).map(item => {
    const title = tag(item, "title");
    const linkTag = item.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
    const link = tag(item, "link") || (linkTag ? linkTag[1] : "");
    const summary = tag(item, "description") || tag(item, "summary") || tag(item, "content");
    const date = tag(item, "pubDate") || tag(item, "published") || tag(item, "updated");
    return { title, link, summary, publishedAt: date ? Date.parse(date) : Date.now() };
  }).filter(item => item.title && item.link);
}
function classify(title) {
  const t = title.toLowerCase();
  if (/airdrop/.test(t)) return "airdrop";
  if (/fee discount|trading fee|maker fee|taker fee/.test(t)) return "fee_discount";
  if (/cashback/.test(t)) return "cashback";
  if (/deposit bonus|deposit.*bonus/.test(t)) return "deposit_bonus";
  if (/trading competition|trading contest/.test(t)) return "trading_competition";
  if (/welcome|new user|newcomer/.test(t)) return "welcome_bonus";
  return "other";
}
function safeArticleUrl(value, allowedDomain) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      (u.hostname === allowedDomain || u.hostname.endsWith("." + allowedDomain))
      ? u.href : null;
  } catch { return null; }
}
function slugFor(url) {
  return "auto-" + createHash("sha256").update(url).digest("hex").slice(0, 32);
}
function isCandidate(title) {
  return PROMO_TERMS.some(re => re.test(title)) && !EXCLUDE_TERMS.some(re => re.test(title));
}

const sources = await sql`
  SELECT id, platform_slug, source_name, allowed_domain, feed_url
  FROM promotion_sources WHERE is_enabled = true
  ORDER BY last_fetched_at NULLS FIRST LIMIT 20
`;
let totalSeen = 0, totalCreated = 0, failures = 0;
for (const source of sources) {
  const runRows = await sql`
    INSERT INTO promotion_discovery_runs(source_id, status)
    VALUES (${source.id}, 'running') RETURNING id
  `;
  const runId = runRows[0].id;
  let seen = 0, created = 0, status = "success", message = "Feed checked";
  try {
    const platformRows = await sql`
      SELECT id, name FROM platforms
      WHERE slug = ${source.platform_slug} AND status <> 'suspended'
      LIMIT 1
    `;
    if (!platformRows.length) throw new Error("Platform slug not found: " + source.platform_slug);

    const response = await fetch(source.feed_url, {
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        "user-agent": "AUTOMATET-PromotionDiscovery/1.0 (+https://automatet.com)"
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error("Feed returned HTTP " + response.status);
    const xml = await response.text();
    const entries = parseFeed(xml);
    seen = entries.length;
    for (const item of entries) {
      if (!isCandidate(item.title)) continue;
      const articleUrl = safeArticleUrl(item.link, source.allowed_domain);
      if (!articleUrl) continue;
      const published = Number.isFinite(item.publishedAt) ? new Date(item.publishedAt) : new Date();
      if (Date.now() - published.getTime() > 45 * 86400000 || published.getTime() > Date.now() + 86400000) continue;
      const slug = slugFor(articleUrl);
      const summary = (item.summary || item.title).slice(0, 1200);
      const rows = await sql`
        INSERT INTO promotions
          (platform_id, slug, title, summary, offer_type, terms_url, landing_url,
           source_url, starts_at, status, last_checked_at)
        VALUES
          (${platformRows[0].id}, ${slug}, ${item.title.slice(0, 240)}, ${summary},
           ${classify(item.title)}, ${articleUrl}, ${articleUrl}, ${articleUrl},
           ${published.toISOString()}, 'pending', now())
        ON CONFLICT (slug) DO NOTHING
        RETURNING id
      `;
      if (rows.length) created++;
    }
    await sql`
      UPDATE promotion_sources SET last_fetched_at = now(), last_success_at = now(),
        last_error = NULL, updated_at = now() WHERE id = ${source.id}
    `;
    message = "Feed checked successfully";
  } catch (error) {
    status = "failed";
    failures++;
    message = String(error?.message || error).slice(0, 500);
    await sql`
      UPDATE promotion_sources SET last_fetched_at = now(),
        last_error = ${message}, updated_at = now() WHERE id = ${source.id}
    `;
  }
  totalSeen += seen;
  totalCreated += created;
  await sql`
    UPDATE promotion_discovery_runs
    SET finished_at = now(), status = ${status}, items_seen = ${seen},
        candidates_created = ${created}, message = ${message}
    WHERE id = ${runId}
  `;
  console.log(JSON.stringify({ source: source.source_name, status, seen, created, message }));
}
console.log(JSON.stringify({
  status: failures === 0 ? "success" : failures === sources.length ? "failed" : "partial",
  sources: sources.length, itemsSeen: totalSeen, pendingCandidatesCreated: totalCreated, failures
}));
if (failures && failures === sources.length && sources.length) process.exitCode = 1;
