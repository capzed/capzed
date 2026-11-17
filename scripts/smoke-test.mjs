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
    }
    return "Public platforms, promotions and news APIs: OK";
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
    const { response, body } = await request("/api/admin/platforms");
    assert(response.status === 401 && body.error === "Unauthorized",
      `Admin API must reject requests without a token (HTTP ${response.status}).`);
    return "Admin API rejects unauthenticated requests: OK";
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
