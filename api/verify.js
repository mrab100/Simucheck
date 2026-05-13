const https = require("https");

// Make a single HTTPS POST request
function post(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: "POST", headers }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(new Error("Failed to parse response: " + data.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.setTimeout(28000, () => { req.destroy(); reject(new Error("Request timed out")); });
    req.write(body);
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: "API key not configured in Vercel environment variables." } });

  const { brand, model, imei, imeiOk, price, currency, notes, photos } = req.body;
  if (!brand || !model || !imei) return res.status(400).json({ error: { message: "Brand, model and IMEI are required." } });

  const tac = imei.substring(0, 8);
  const photoCount = Array.isArray(photos) ? photos.filter(p => p && p.b64).length : 0;

  // ── STEP 1: Search Google for this phone ──────────────────────────────────
  let phoneResearch = null;
  try {
    const searchPrompt = `Search Google right now for: "${brand} ${model} release date specs price Kenya 2024 2025"

Find:
1. Is this phone real and officially released by ${brand}? What year?
2. Official specs: RAM, storage options, camera, battery, display, chipset
3. Current retail price in Kenya (KES) from Jumia Kenya, Phone Place Kenya, or any Kenya shop
4. Is it commonly faked/cloned in Kenya?

Respond ONLY with this JSON — no markdown, no backticks:
{
  "model_exists": true,
  "release_year": "2025",
  "official_specs": {
    "ram_options": ["8GB", "12GB"],
    "storage_options": ["256GB", "512GB"],
    "battery": "5000mAh",
    "main_camera": "200MP",
    "display": "6.9 inch Dynamic AMOLED",
    "chipset": "Snapdragon 8 Elite"
  },
  "kenya_price_min": 155000,
  "kenya_price_max": 185000,
  "price_source": "Jumia Kenya",
  "commonly_faked": true,
  "fake_notes": "Commonly sold as fake at KES 20,000-40,000",
  "confidence": "HIGH"
}`;

    const searchBody = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: "You are a phone research agent. Search Google and find accurate information. Respond ONLY with pure JSON.",
      messages: [{ role: "user", content: searchPrompt }]
    });

    const searchResult = await post(
      "api.anthropic.com",
      "/v1/messages",
      {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(searchBody)
      },
      searchBody
    );

    if (searchResult.status === 200) {
      const textBlock = searchResult.body.content && searchResult.body.content.find(b => b.type === "text");
      if (textBlock && textBlock.text) {
        const cleaned = textBlock.text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
        phoneResearch = JSON.parse(cleaned);
      }
    }
  } catch(e) {
    // Search failed silently — continue with verification using AI knowledge
    phoneResearch = null;
  }

  // ── STEP 2: Build verification prompt with search results ─────────────────
  const userContent = [];

  // Add photos
  if (Array.isArray(photos)) {
    photos.forEach(p => {
      if (p && p.b64) {
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: p.mime || "image/jpeg", data: p.b64 }
        });
      }
    });
  }

  const researchBlock = phoneResearch ? `
LIVE GOOGLE SEARCH RESULTS FOR ${brand} ${model}:
Model officially exists: ${phoneResearch.model_exists}
Release year: ${phoneResearch.release_year}
Official RAM: ${phoneResearch.official_specs?.ram_options?.join(", ")}
Official Storage: ${phoneResearch.official_specs?.storage_options?.join(", ")}
Official Camera: ${phoneResearch.official_specs?.main_camera}
Official Battery: ${phoneResearch.official_specs?.battery}
Official Display: ${phoneResearch.official_specs?.display}
Official Chipset: ${phoneResearch.official_specs?.chipset}
Kenya retail price: KES ${phoneResearch.kenya_price_min?.toLocaleString()} – KES ${phoneResearch.kenya_price_max?.toLocaleString()} (source: ${phoneResearch.price_source})
Commonly faked in Kenya: ${phoneResearch.commonly_faked}
${phoneResearch.fake_notes ? "Clone/fake details: " + phoneResearch.fake_notes : ""}
USE THESE LIVE PRICES AND SPECS — more accurate than training data.` : `
LIVE SEARCH: unavailable — use your knowledge carefully.
IMPORTANT: Do NOT flag any phone as non-existent unless you are 100% certain. When unsure, give benefit of the doubt.`;

  userContent.push({
    type: "text",
    text: `You are SimuScan, Kenya's most trusted phone verification AI.

PHONE SUBMITTED:
Brand: ${brand}
Model: ${model}
IMEI: ${imei}
IMEI Luhn: ${imeiOk ? "PASSED ✓" : "FAILED ✗ — major red flag"}
TAC (first 8 digits): ${tac}
Buyer price: ${price ? price + " " + currency : "not provided"}
Notes: ${notes || "none"}
Photos: ${photoCount}

${researchBlock}

CRITICAL RULES — follow exactly:
1. Samsung S25, S25 Plus, S25 Ultra, S25 Edge are REAL phones (released January-May 2025)
2. Samsung S26 series — may exist as 2026 models, do not flag as fake, mark as UNVERIFIED
3. iPhone 16 series, iPhone 17 series are all real
4. Tecno Camon 40 Pro is real (genuine costs KES 28,000-35,000)
5. NEVER say a phone "hasn't been released" unless live search confirms this
6. If you don't recognise a model, say "could not verify model" — do NOT say fake
7. Neon phones by Safaricom are legitimate Kenya branded Android phones
8. Nothing phones (Phone 2a, 3a) are legitimate UK brand sold in Kenya

KENYA FAKE PATTERNS:
- U-FM phones sold as Tecno Camon 40 Pro for under KES 15,000 = clone fraud
- Any iPhone under KES 40,000 = fake
- Samsung S series under KES 40,000 = fake
- IMEI Luhn FAIL = very likely fake
- Storage fraud: claims 256GB but only 8-16GB actual
- TAC mismatch: Samsung 35xxxxxx, Apple 01/35xxxxxx, Transsion 86xxxxxx

SCORING: Start 85. Luhn fail -35. Model confirmed non-existent by search -50. TAC wrong brand -30. Price 40%+ below confirmed market -20. Visual fake -20. Clone brand visible -30.
GENUINE=75+, SUSPICIOUS=45-74, FAKE=below 45

${photoCount > 0 ? "Analyse ALL uploaded photos: logo accuracy, box design, specs label, build quality, clone brand names." : ""}

Reply ONLY with this exact JSON — no markdown, no backticks:
{
  "score": 85,
  "verdict": "GENUINE",
  "headline": "This phone appears genuine based on all checks.",
  "confidence": "HIGH",
  "imei_result": {"passed": true, "detail": "IMEI passes Luhn algorithm. Format is valid."},
  "tac_result": {"passed": true, "detail": "TAC code is consistent with claimed brand."},
  "model_result": {"exists": true, "release_year": "2025", "detail": "Model confirmed via live search."},
  "price_result": {"realistic": true, "genuine_range_kes": "KES 155,000-185,000", "detail": "Price is within expected range."},
  "visual_result": {"detail": "No photo provided. Upload photos for better accuracy."},
  "storage_warning": false,
  "storage_warning_detail": "",
  "clone_warning": false,
  "clone_warning_detail": "",
  "red_flags": [],
  "green_flags": ["IMEI passes Luhn check", "Model verified via search", "Price realistic"],
  "physical_checks": ["Dial *#06# and confirm IMEI matches box sticker", "Test storage by copying a large file", "Check brand logo and font carefully"],
  "advice": "Based on all checks this phone shows no major red flags. Always verify physically before paying.",
  "service_centre": "Visit Samsung Experience Store, Sarit Centre Nairobi for official confirmation.",
  "certificate_note": "This SimuScan result can be shown if a dispute arises."
}`
  });

  // ── STEP 3: Final verification ─────────────────────────────────────────────
  const verifyBody = JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: "You are SimuScan — Kenya's phone authentication AI. Be accurate and honest. NEVER falsely flag a genuine phone. Respond ONLY with pure JSON — no markdown, no backticks, nothing outside the JSON.",
    messages: [{ role: "user", content: userContent }]
  });

  try {
    const result = await post(
      "api.anthropic.com",
      "/v1/messages",
      {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(verifyBody)
      },
      verifyBody
    );

    if (result.status !== 200) {
      const msg = result.body?.error?.message || "API error " + result.status;
      return res.status(500).json({ error: { message: msg } });
    }

    const textBlock = result.body.content && result.body.content.find(b => b.type === "text");
    if (!textBlock || !textBlock.text) return res.status(500).json({ error: { message: "No response from AI." } });

    const cleaned = textBlock.text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const verdict = JSON.parse(cleaned);

    // Log this verification to stats (fire and forget — don't wait)
    try {
      const statsBody = JSON.stringify({
        brand, model,
        verdict: verdict.verdict,
        score: verdict.score
      });
      post("api.jsonbin.io", `/v3/b/${process.env.JSONBIN_ID}`, {
        "Content-Type": "application/json",
        "X-Access-Key": process.env.JSONBIN_KEY,
        "Content-Length": Buffer.byteLength(statsBody)
      }, statsBody).catch(() => {}); // silent fail
    } catch(e) {}

    return res.status(200).json(verdict);

  } catch(err) {
    return res.status(500).json({ error: { message: err.message || "Verification failed. Please try again." } });
  }
}
