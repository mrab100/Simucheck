// SimuCheck — Netlify Function
// Single reliable AI call with all Kenya knowledge built in

const https = require("https");

// Use built-in https to avoid fetch compatibility issues on older Node
function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error("Invalid JSON response from API")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error("Request timed out")); });
    req.write(body);
    req.end();
  });
}

exports.handler = async function (event) {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const payload = JSON.parse(event.body);
    const { brand, model, imei, imeiOk, price, currency, notes, imgB64, imgMime } = payload;

    if (!brand || !model || !imei) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: { message: "Brand, model and IMEI are required." } }),
      };
    }

    // Build the message content
    const userContent = [];

    // Add photo if provided
    if (imgB64) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imgMime || "image/jpeg",
          data: imgB64,
        },
      });
    }

    const tac = imei.substring(0, 8);

    userContent.push({
      type: "text",
      text: `You are SimuCheck, Kenya's most accurate phone verification AI.

PHONE SUBMITTED FOR VERIFICATION:
Brand: ${brand}
Model: ${model}
IMEI: ${imei}
IMEI Luhn check: ${imeiOk ? "PASSED ✓" : "FAILED ✗ — major red flag"}
TAC code (first 8 digits): ${tac}
Buyer price: ${price ? price + " " + currency : "not provided"}
Notes: ${notes || "none"}
Photo: ${imgB64 ? "YES — analyse the image carefully for authenticity" : "No photo"}

━━━ KENYA MARKET KNOWLEDGE ━━━

REAL PRICES IN KENYA (2025):
iPhone 16 Pro Max: KES 185,000–230,000
iPhone 15: KES 95,000–120,000
iPhone 14: KES 75,000–95,000
iPhone 13: KES 55,000–75,000
Samsung Galaxy S24 Ultra: KES 130,000–160,000
Samsung Galaxy S24: KES 95,000–120,000
Samsung Galaxy A55: KES 38,000–48,000
Samsung Galaxy A35: KES 26,000–34,000
Samsung Galaxy A25: KES 18,000–24,000
Samsung Galaxy A17: KES 13,000–17,000
Samsung Galaxy A15: KES 11,000–15,000
Samsung Galaxy A07: KES 10,000–14,000 (128GB up to KES 16,000)
Samsung Galaxy A06: KES 9,000–12,000
Samsung Galaxy A05s: KES 10,000–13,000
Samsung Galaxy A05: KES 8,000–11,000
Tecno Camon 40 Pro (genuine Tecno): KES 28,000–35,000
Tecno Camon 30 Pro: KES 22,000–28,000
Tecno Spark 30 Pro: KES 14,000–18,000
Infinix Note 40 Pro: KES 24,000–30,000
Infinix Hot 40 Pro: KES 16,000–20,000
Xiaomi Redmi Note 13 Pro: KES 24,000–32,000
Xiaomi Redmi 15C: KES 12,000–16,000
Xiaomi Redmi 13C: KES 10,000–14,000
Benco S1 Plus: KES 7,000–10,000
Benco V60: KES 5,000–8,000
Honor X8b: KES 16,000–22,000
Nokia G42: KES 14,000–18,000
Itel A70: KES 5,000–8,000

REAL PHONES — DO NOT FLAG AS FAKE OR NON-EXISTENT:
- Samsung Galaxy A17 (2024) — real phone
- Redmi 15C (2024) — real Xiaomi/Redmi phone
- Benco S1 Plus — real phone by Vmobile Kenya
- Tecno Camon 40 Pro — real phone (genuine costs KES 28,000–35,000)
- Honor phones — real brand (spun off from Huawei 2020)
- ZTE phones — real brand with Kenya presence
- Infinix, Tecno, Itel — all real (Transsion Holdings)

CLONE & FAKE PATTERNS IN KENYA:
- U-FM brand: makes clones sold as "Tecno Camon 40 Pro" etc for KES 6,000–10,000
- Shenzhen generic brands: sold as Samsung/iPhone/Tecno
- "Tecno Camon 40 Pro" for under KES 20,000 = almost certainly U-FM clone
- "iPhone 15" for under KES 40,000 = definitely fake
- "Samsung S24 Ultra" for under KES 50,000 = definitely fake
- Storage fraud: phone claims 256GB but actually 8–16GB with software tricks
- IMEI all zeros or repeating = fake
- Box says one brand, phone says another = clone fraud

TAC CODE KNOWLEDGE:
- Samsung: mostly 35xxxxxx
- Apple: mostly 01xxxxxx or 35xxxxxx
- Transsion (Tecno/Infinix/Itel): 35xxxxxx, 86xxxxxx, 52xxxxxx
- Xiaomi/Redmi: 86xxxxxx, 35xxxxxx
- Benco/Vmobile: 86xxxxxx
- Generic Chinese clones: often 86xxxxxx or 99xxxxxx

SCORING:
Start at 85.
IMEI Luhn FAIL: subtract 35
Model confirmed non-existent: subtract 50 (max score 25)
TAC clearly wrong manufacturer: subtract 30
Price 40%+ below Kenya market: subtract 20
Storage fraud (high GB claim + very low price): subtract 15
Visual shows clone/fake signs: subtract 15 to 25
Clone brand visible in photo: subtract 30
All checks pass strongly: add 10

GENUINE = 75+, SUSPICIOUS = 45–74, FAKE = below 45

${imgB64 ? "IMPORTANT: Analyse the uploaded photo carefully. Check logo, box design, specs label, build quality, any clone brand names visible." : ""}

Respond ONLY with this exact JSON — no markdown, no backticks, nothing outside the JSON:
{
  "score": <0-100>,
  "verdict": "<GENUINE|SUSPICIOUS|FAKE>",
  "headline": "<one honest plain-English sentence for a Kenyan buyer>",
  "confidence": "<HIGH|MEDIUM|LOW>",
  "imei_result": {"passed": <true|false>, "detail": "<2 sentences>"},
  "tac_result": {"passed": <true|false|null>, "detail": "<2 sentences>"},
  "model_result": {"exists": <true|false>, "detail": "<2 sentences>"},
  "price_result": {"realistic": <true|false|null>, "genuine_range_kes": "<e.g. KES 10,000–14,000>", "detail": "<2 sentences>"},
  "visual_result": {"detail": "<2 sentences about photo or advice to upload>"},
  "storage_warning": <true|false>,
  "storage_warning_detail": "<storage fraud warning if true, empty string if false>",
  "clone_warning": <true|false>,
  "clone_warning_detail": "<clone explanation if true, empty string if false>",
  "red_flags": ["<specific red flags only — empty array if none>"],
  "green_flags": ["<positive signals — empty array if none>"],
  "physical_checks": ["<2-3 things to check physically in the shop right now>"],
  "advice": "<3-4 sentences of direct honest practical advice>",
  "service_centre": "<brand service centre in Nairobi for official confirmation>",
  "certificate_note": "<one sentence about using this result in a dispute>"
}`,
    });

    const requestBody = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1400,
      system: "You are SimuCheck — Kenya's phone authentication AI. Be accurate and honest. Never falsely flag a genuine phone as fake. Respond ONLY with pure JSON — no markdown, no backticks, nothing outside the JSON object.",
      messages: [{ role: "user", content: userContent }],
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("API key not configured. Please add ANTHROPIC_API_KEY in Netlify environment variables.");
    }

    const result = await httpsPost(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      },
      requestBody
    );

    if (result.status !== 200) {
      const msg = result.body?.error?.message || `API error ${result.status}`;
      throw new Error(msg);
    }

    const textBlock = result.body.content && result.body.content.find((b) => b.type === "text");
    if (!textBlock || !textBlock.text) throw new Error("No response from AI. Please try again.");

    const cleaned = textBlock.text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();

    const verdict = JSON.parse(cleaned);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(verdict),
    };

  } catch (err) {
    console.error("SimuCheck error:", err.message);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: { message: err.message || "Verification failed. Please try again." },
      }),
    };
  }
};
        
