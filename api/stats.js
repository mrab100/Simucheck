const https = require("https");

function get(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: "GET", headers }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch(e) { reject(new Error("Parse error")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Database not configured. Add SUPABASE_URL and SUPABASE_KEY to Vercel." });
  }

  const host = new URL(supabaseUrl).hostname;
  const h = { "apikey": supabaseKey, "Authorization": "Bearer " + supabaseKey };

  try {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    const [totalR, todayR, yesterdayR, genuineR, suspiciousR, fakeR, recentR, topBrandsR] = await Promise.all([
      get(host, "/rest/v1/verifications?select=id", { ...h, "Prefer": "count=exact", "Range": "0-0" }),
      get(host, `/rest/v1/verifications?select=id&created_at=gte.${today}T00:00:00`, { ...h, "Prefer": "count=exact", "Range": "0-0" }),
      get(host, `/rest/v1/verifications?select=id&created_at=gte.${yesterday}T00:00:00&created_at=lt.${today}T00:00:00`, { ...h, "Prefer": "count=exact", "Range": "0-0" }),
      get(host, "/rest/v1/verifications?select=id&verdict=eq.GENUINE", { ...h, "Prefer": "count=exact", "Range": "0-0" }),
      get(host, "/rest/v1/verifications?select=id&verdict=eq.SUSPICIOUS", { ...h, "Prefer": "count=exact", "Range": "0-0" }),
      get(host, "/rest/v1/verifications?select=id&verdict=eq.FAKE", { ...h, "Prefer": "count=exact", "Range": "0-0" }),
      get(host, "/rest/v1/verifications?select=brand,model,verdict,score,has_photo,created_at&order=created_at.desc&limit=30", h),
      get(host, "/rest/v1/verifications?select=brand&order=brand.asc&limit=200", h)
    ]);

    const cnt = (r) => parseInt(r.headers?.["content-range"]?.split("/")[1] || r.body?.length || "0");

    // Count brands from recent data
    const brandCounts = {};
    if (Array.isArray(topBrandsR.body)) {
      topBrandsR.body.forEach(v => {
        brandCounts[v.brand] = (brandCounts[v.brand] || 0) + 1;
      });
    }
    const topBrands = Object.entries(brandCounts)
      .sort((a,b) => b[1]-a[1])
      .slice(0,8)
      .map(([brand, count]) => ({ brand, count }));

    return res.status(200).json({
      total: cnt(totalR),
      today: cnt(todayR),
      yesterday: cnt(yesterdayR),
      genuine: cnt(genuineR),
      suspicious: cnt(suspiciousR),
      fake: cnt(fakeR),
      recent: recentR.body || [],
      top_brands: topBrands
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
  }
