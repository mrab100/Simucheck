// ═══════════════════════════════════════════════════════════════════════════
// SimuCheck AI Agent — 3-step verification
// Step 1: Google search for model existence, official specs, Kenya price
// Step 2: Visual photo analysis
// Step 3: Final verdict combining everything
// ═══════════════════════════════════════════════════════════════════════════

async function callClaude(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }
  return res.json();
}

// ── STEP 1: Research agent — searches Google for model + specs + Kenya price ─
async function researchPhone(brand, model, price, currency) {
  try {
    const data = await callClaude({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: "You are a phone research agent for SimuCheck Kenya. Search Google and find accurate information. Respond only with pure JSON — no markdown, no backticks, nothing outside the JSON object.",
      messages: [{
        role: "user",
        content: `Search Google and find accurate information about the "${brand} ${model}".

Search for:
1. Does this phone officially exist from ${brand}? When released?
2. Official specs: RAM, storage, battery, camera, display, chipset
3. Current retail price in Kenya (KES) from Jumia Kenya, Phone Place Kenya, Kilimall, or Safaricom Shop
4. Is this model commonly counterfeited or cloned in Kenya?

Buyer claims price: ${price ? price + " " + currency : "not provided"}

Respond ONLY with this exact JSON:
{
  "model_exists": true,
  "release_year": "2024",
  "official_specs": {
    "ram_options": ["4GB", "6GB"],
    "storage_options": ["128GB", "256GB"],
    "battery": "5000mAh",
    "main_camera": "50MP",
    "display": "6.88 inch HD+",
    "chipset": "MediaTek Helio G81"
  },
  "kenya_price_min": 12000,
  "kenya_price_max": 16000,
  "price_source": "Jumia Kenya",
  "commonly_faked": false,
  "fake_notes": "",
  "search_confidence": "HIGH"
}`
      }]
    });

    const textBlock = data.content && data.content.find(b => b.type === "text");
    if (!textBlock || !textBlock.text) return null;
    const cleaned = textBlock.text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Research step error:", e.message);
    return null;
  }
}

// ── STEP 2: Visual analysis — analyses uploaded phone photo ─────────────────
async function analysePhoto(imgB64, imgMime, brand, model) {
  if (!imgB64) return null;
  try {
    const data = await callClaude({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: "You are a phone authentication expert specialising in visual fake detection for the Kenyan market. Respond only with pure JSON.",
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: imgMime || "image/jpeg", data: imgB64 } },
          {
            type: "text",
            text: `Carefully analyse this photo for ${brand} ${model} authenticity.

Check:
1. Brand logo — font, spacing, colour, position correct for ${brand}?
2. Box/packaging — print quality sharp or blurry? Genuine design?
3. Spec labels — do specs on box match official ${brand} ${model}?
4. Build quality — genuine materials or cheap clone feel?
5. Any clone brand names visible? (U-FM, Shenzhen brands, generic Chinese brands)
6. Camera module — correct shape and layout for this model?
7. Any sticker cover-ups or rebranding attempts?

Respond ONLY with this JSON:
{
  "visual_score": 85,
  "looks_genuine": true,
  "findings": "2-3 sentences about what you see in the photo",
  "red_flags_visual": [],
  "green_flags_visual": ["Tecno logo font and spacing correct", "Box print quality sharp"],
  "clone_brand_visible": false,
  "clone_brand_name": ""
}`
          }
        ]
      }]
    });

    const textBlock = data.content && data.content.find(b => b.type === "text");
    if (!textBlock) return null;
    const cleaned = textBlock.text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Visual step error:", e.message);
    return null;
  }
}

// ── STEP 3: Final verdict — combines all research into one result ────────────
async function getFinalVerdict(phoneData, research, visual) {
  const { brand, model, imei, imeiOk, tac, price, currency, notes } = phoneData;

  const researchBlock = research ? `
━━━ LIVE GOOGLE RESEARCH (searched just now) ━━━
Model officially exists: ${research.model_exists}
Release year: ${research.release_year}
Official RAM options: ${research.official_specs?.ram_options?.join(", ") || "unknown"}
Official storage options: ${research.official_specs?.storage_options?.join(", ") || "unknown"}
Official battery: ${research.official_specs?.battery || "unknown"}
Official camera: ${research.official_specs?.main_camera || "unknown"}
Official display: ${research.official_specs?.display || "unknown"}
Official chipset: ${research.official_specs?.chipset || "unknown"}
Kenya retail price range: KES ${research.kenya_price_min?.toLocaleString() || "?"} – KES ${research.kenya_price_max?.toLocaleString() || "?"} (from ${research.price_source || "search"})
Commonly faked in Kenya: ${research.commonly_faked}
${research.fake_notes ? "Clone/fake details: " + research.fake_notes : ""}
Search confidence: ${research.search_confidence}
USE THESE PRICES AND SPECS — they are from live Google search right now.` : `
━━━ RESEARCH ━━━
Live Google search unavailable — use your own knowledge carefully. Note: many phones released in 2024-2025 may not be in your training data. Do not flag a model as non-existent unless you are absolutely certain.`;

  const visualBlock = visual ? `
━━━ VISUAL PHOTO ANALYSIS ━━━
Visual authenticity score: ${visual.visual_score}/100
Looks genuine: ${visual.looks_genuine}
Findings: ${visual.findings}
Visual red flags: ${visual.red_flags_visual?.join(", ") || "none"}
Visual green flags: ${visual.green_flags_visual?.join(", ") || "none"}
Clone brand visible in photo: ${visual.clone_brand_visible}${visual.clone_brand_name ? " — " + visual.clone_brand_name : ""}` : `
━━━ VISUAL ━━━
No photo uploaded. Advise buyer to upload a photo next time for better accuracy.`;

  const data = await callClaude({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1400,
    system: "You are SimuCheck — Kenya's most accurate phone authentication AI. Be honest and accurate. Respond ONLY with pure JSON — no markdown, no backticks, nothing outside the JSON object.",
    messages: [{
      role: "user",
      content: `You are SimuCheck Kenya. You have just completed Google research and visual analysis. Now give the final verification verdict.

━━━ PHONE SUBMITTED ━━━
Brand: ${brand}
Model: ${model}
IMEI: ${imei}
IMEI Luhn check: ${imeiOk ? "PASSED ✓" : "FAILED ✗ — major red flag"}
TAC code (first 8 digits): ${tac}
Buyer's price: ${price ? price + " " + currency : "not provided"}
Buyer notes: ${notes || "none"}

${researchBlock}
${visualBlock}

━━━ KENYA CLONE KNOWLEDGE ━━━
- U-FM: makes phones sold as Tecno Camon, Samsung A series
- Shenzhen generic brands: sold as iPhone, Samsung, Tecno
- Storage fraud: claims 256GB but actually 8–16GB
- Price fraud: 40%+ below genuine Kenya price = red flag
- Redmi 15C, Samsung A07, Tecno Camon 40 Pro, Infinix Hot 40 are ALL real phones released in 2024 — do not flag as non-existent

━━━ SCORING ━━━
Start: 85
IMEI Luhn FAIL: -35
Model confirmed non-existent by Google search: -50
TAC returns different manufacturer: -30
Price 40%+ below confirmed Kenya price: -20
Visual shows clone/fake: -15 to -25
Storage fraud pattern: -15
Clone brand in photo: -30
All checks pass: +10

GENUINE=75+, SUSPICIOUS=45-74, FAKE=below 45

Respond ONLY with this exact JSON:
{
  "score": <0-100>,
  "verdict": "<GENUINE|SUSPICIOUS|FAKE>",
  "headline": "<one honest plain-English sentence for a Kenyan buyer>",
  "confidence": "<HIGH|MEDIUM|LOW>",
  "imei_result": {"passed": <true|false>, "detail": "<2 sentences>"},
  "tac_result": {"passed": <true|false|null>, "detail": "<2 sentences>"},
  "model_result": {"exists": <true|false>, "release_year": "<year>", "detail": "<2 sentences confirmed by Google>"},
  "price_result": {"realistic": <true|false|null>, "genuine_range_kes": "<KES X–Y>", "detail": "<2 sentences from live data>"},
  "specs_match": {"checked": <true|false>, "detail": "<2 sentences — do claimed specs match official?>"},
  "visual_result": {"detail": "<2 sentences>"},
  "storage_warning": <true|false>,
  "storage_warning_detail": "<storage fraud warning or empty string>",
  "clone_warning": <true|false>,
  "clone_warning_detail": "<clone explanation or empty string>",
  "red_flags": ["<specific red flags only>"],
  "green_flags": ["<positive signals>"],
  "physical_checks": ["<2-3 things to check physically in the shop right now>"],
  "advice": "<3-4 sentences direct honest advice>",
  "service_centre": "<brand service centre in Nairobi for official confirmation>",
  "certificate_note": "<one sentence about using this result in a dispute>"
}`
    }]
  });

  const textBlock = data.content && data.content.find(b => b.type === "text");
  if (!textBlock || !textBlock.text) throw new Error("No verdict received from AI");
  const cleaned = textBlock.text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  return JSON.parse(cleaned);
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const incoming = JSON.parse(event.body);
    const userMsg = incoming.messages?.[0]?.content;
    const textPart = Array.isArray(userMsg) ? userMsg.find(b => b.type === "text") : null;
    const imgPart  = Array.isArray(userMsg) ? userMsg.find(b => b.type === "image") : null;
    const text = textPart?.text || (typeof userMsg === "string" ? userMsg : "");

    // Extract phone details from structured prompt text
    const extract = (pattern) => { const m = text.match(pattern); return m ? m[1].trim() : ""; };
    const brand    = extract(/Brand:\s*([^\n]+)/);
    const model    = extract(/Model:\s*([^\n]+)/);
    const imei     = extract(/IMEI:\s*(\d+)/);
    const price    = extract(/Price:\s*(\d+)/);
    const currency = text.match(/Price:\s*\d+\s*(\w+)/)?.[1] || "KES";
    const notes    = extract(/Notes:\s*([^\n]+)/);
    const tac      = imei ? imei.substring(0, 8) : "";

    // IMEI Luhn
    function luhn(n) {
      if (!/^\d{15}$/.test(n)) return false;
      let s = 0;
      for (let i = 0; i < 15; i++) {
        let d = parseInt(n[i]);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        s += d;
      }
      return s % 10 === 0;
    }
    const imeiOk = luhn(imei);

    const imgB64  = imgPart?.source?.data || null;
    const imgMime = imgPart?.source?.media_type || "image/jpeg";
    const phoneData = { brand, model, imei, imeiOk, tac, price, currency, notes };

    // Run research + visual in parallel, then get final verdict
    const [research, visual] = await Promise.all([
      researchPhone(brand, model, price, currency),
      analysePhoto(imgB64, imgMime, brand, model)
    ]);

    const verdict = await getFinalVerdict(phoneData, research, visual);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify(verdict) }] }),
    };

  } catch (err) {
    console.error("SimuCheck agent error:", err.message);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: { message: err.message || "Verification failed. Please try again." } }),
    };
  }
};
