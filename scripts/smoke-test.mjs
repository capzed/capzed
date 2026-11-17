import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

async function checkInlineScripts() {
  for (const file of ["index.html", "admin.html", "platform.html", "compare.html", "prop-firms.html", "advertise.html", "guides.html", "methodology.html", "media-kit.html", "news.html"]) {
    const html = await readFile(new URL("../" + file, import.meta.url), "utf8");
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    for (let i = 0; i < scripts.length; i++) {
      new Script(scripts[i][1], { filename: file + ":inline-script-" + (i + 1) });
    }
  }
  console.log("PASS: Homepage, admin, platform, comparator, guides, methodology and media kit syntax");
}

await checkInlineScripts();

const base = (process.env.SMOKE_BASE_URL || "https://automatet-crypto-deals.pages.dev").replace(/\/$/, "");

async function request(path, options) {
  const response = await fetch(new URL(path, base), options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const checks = [
  async () => {
    const { response, body } = await request("/api/health");
    assert(response.ok && body.status === "ok" && body.database === "connected",
      "Health check failed: database is not connected.");
    return "Health and Neon database: OK";
  },
  async () => {
    for (const path of ["/api/platforms", "/api/promotions", "/api/news"]) {
      const { response, body } = await request(path);
      assert(response.ok && Array.isArray(body.data), `${path} did not return a data array (HTTP ${response.status}).`);
      if (path === "/api/news") {
        assert(body.data.length >= 4, "News feed is empty or missing its seeded editorial stories.");
        assert(body.data.every(item => typeof item.headline === "string" && item.canonical_url?.startsWith("https://")),
          "News feed contains an incomplete headline or non-HTTPS source URL.");
      }
    }
    return "Public APIs and populated, source-linked news feed: OK";
  },
  async () => {
    const { response, body } = await request("/api/prop-firm-programs");
    assert(response.ok && Array.isArray(body.data), `Prop firm API did not return a data array (HTTP ${response.status}).`);
    assert(body.data.length >= 1, "Verified prop firm programme feed is empty.");
    assert(body.data.every(item => item.program_name && item.platform_slug && item.rules_url?.startsWith("https://")),
      "Prop firm feed contains an incomplete programme or non-HTTPS rules URL.");
    return "Verified prop firm programme API and official rules links: OK";
  },
  async () => {
    const { response, body } = await request("/api/platforms/not-a-real-platform");
    assert(response.status === 404 && body.error === "Platform not found",
      `Unknown platform detail must return 404 (HTTP ${response.status}).`);
    return "Platform detail endpoint rejects unknown slugs: OK";
  },
  async () => {
    const { response, body } = await request("/api/advertiser-leads", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert(response.status === 400 && typeof body.error === "string",
      `Advertiser inquiry validation failed (HTTP ${response.status}).`);
    return "Advertiser inquiry endpoint validates required fields: OK";
  },
  async () => {
    const { response, body } = await request("/api/ads?placement=top");
    assert(response.ok && Array.isArray(body.data), `Sponsored ads API failed (HTTP ${response.status}).`);
    return "Sponsored ad feed: OK";
  },
  async () => {
    const { response, body } = await request("/api/ad-go/00000000-0000-0000-0000-000000000000");
    assert(response.status === 404 && body.error === "Sponsored campaign is unavailable",
      `Sponsored redirect must reject unavailable campaigns (HTTP ${response.status}).`);
    return "Sponsored redirect rejects unavailable campaigns: OK";
  },
  async () => {
    const { response, body } = await request("/api/go/this-offer-does-not-exist");
    assert(response.status === 404 && body.error === "Offer is no longer available",
      `Affiliate redirect must reject unavailable offers (HTTP ${response.status}).`);
    return "Affiliate redirect rejects unavailable offers: OK";
  },
  async () => {
    for (const path of ["/api/admin/platforms", "/api/admin/fees", "/api/admin/regions", "/api/admin/advertiser-leads", "/api/admin/prop-firm-programs"]) {
      const { response, body } = await request(path);
      assert(response.status === 401 && body.error === "Unauthorized",
        `${path} must reject requests without a token (HTTP ${response.status}).`);
    }
    return "Admin platform, fee, region and prop firm APIs reject unauthenticated requests: OK";
  },
  async () => {
    for (const path of ["/compare.html", "/platform.html", "/prop-firms.html", "/advertise.html", "/guides.html", "/methodology.html", "/media-kit.html", "/news.html"]) {
      const { response, body } = await request(path);
      assert(response.ok && typeof body === "string" && body.toLowerCase().includes("<html"),
        `${path} did not return HTML (HTTP ${response.status}).`);
    }
    return "Comparator, platform profile, prop firms, guides, methodology, media kit and news desk pages: OK";
  },
  async () => {
    const { response, body } = await request("/");
    assert(response.ok && typeof body === "string" && body.toLowerCase().includes("<html"),
      `Homepage did not return HTML (HTTP ${response.status}).`);
    return "Homepage response: OK";
  },
];

try {
  for (const check of checks) console.log("PASS:", await check());
  console.log("All AUTOMATET Crypto Deals smoke tests passed.");
} catch (error) {
  console.error("SMOKE TEST FAILED:", error.message);
  process.exitCode = 1;
}
