const https = require("https");

exports.handler = async function(event) {
  // CORS headers for all responses
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: { message: "Method not allowed" } }) };
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: { message: "API key not configured in Netlify environment variables" } })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: { message: "Invalid request body" } }) };
  }

  const { brand, model, imei, imeiOk, price, currency, notes, photos } = payload;

  if (!brand || !model || !imei) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: { message: "Brand, model and IMEI are required" } })
    };
  }

  const tac = imei.substring(0, 8);
  const photoCount = Array.isArray(photos) ? photos.filter(p => p && p.b64).length : 0;

  // Build message content
  const userContent = [];

  // Add photos
  if (Array.isArray(photos)) {
    photos.forEach(function(p) {
      if (p && p.b64) {
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: p.mime || "image/jpeg", data: p.b64 }
        });
      }
    });
  }

  // Add text prompt
  userContent.push({
    type: "text",
    text: `You are SimuScan, Kenya's most trusted phone verification AI.

PHONE DETAILS:
Brand: ${brand}
Model: ${model}
IMEI: ${imei}
IMEI Luhn check: ${imeiOk ? "PASSED" : "FAILED - major red flag"}
TAC (first 8 digits): ${tac}
Price: ${price ? price + " " + currency : "not provided"}
Notes: ${notes || "none"}
Photos uploaded: ${photoCount}

KENYA PRICES 2025:
Samsung A07: KES 10,000-16,000
Samsung A15: KES 11,000-15,000
Samsung A17: KES 13,000-17,000
Samsung A25: KES 18,000-24,000
Samsung A35: KES 26,000-34,000
Samsung A55: KES 38,000-48,000
Samsung S24: KES 95,000-120,000
iPhone 13: KES 55,000-75,000
iPhone 14: KES 75,000-95,000
iPhone 15: KES 95,000-120,000
Tecno Camon 40 Pro (genuine): KES 28,000-35,000
Infinix Note 40 Pro: KES 24,000-30,000
Redmi 15C: KES 12,000-16,000
Redmi Note 13: KES 16,000-22,000
Benco S1 Plus: KES 7,000-10,000
Honor X8b: KES 16,000-22,000
Nokia G42: KES 14,000-18,000

REAL PHONES - DO NOT FLAG AS FAKE:
Samsung Galaxy A17 (2024), Redmi 15C (2024), Benco S1 Plus, Honor phones, ZTE phones, Tecno/Infinix/Itel (Transsion)

FAKE PATTERNS IN KENYA:
- U-FM phones sold as Tecno Camon 40 Pro for under KES 15,000
- iPhone under KES 40,000 = fake
- Samsung S series under KES 40,000 = fake
- IMEI Luhn fail = very likely fake
- Storage fraud: claims 256GB but only 8-16GB actual

TAC CODES:
Samsung: 35xxxxxx | Apple: 01xxxxxx or 35xxxxxx | Transsion: 86xxxxxx | Benco: 86xxxxxx

SCORING: Start 85. Luhn fail -35. Model does not exist -50. TAC wrong brand -30. Price 40% below market -20. Visual fake signs -20. Clone brand in photo -30.
GENUINE=75+, SUSPICIOUS=45-74, FAKE=below 45

${photoCount > 0 ? "Analyse all uploaded photos carefully for logo, box design, specs, build quality, clone brand names." : "No photos provided."}

Reply ONLY with this JSON, nothing else:
{"score":85,"verdict":"GENUINE","headline":"This phone appears to be genuine based on all checks.","confidence":"HIGH","imei_result":{"passed":true,"detail":"The IMEI passes the Luhn algorithm check and the format is valid."},"tac_result":{"passed":true,"detail":"TAC code matches the claimed brand."},"model_result":{"exists":true,"detail":"This model exists and is sold in Kenya."},"price_result":{"realistic":true,"genuine_range_kes":"KES 7,000-10,000","detail":"Price is within the expected range for this model."},"visual_result":{"detail":"No photo provided. Upload photos next time for better accuracy."},"storage_warning":false,"storage_warning_detail":"","clone_warning":false,"clone_warning_detail":"","red_flags":[],"green_flags":["IMEI passes Luhn check","Model exists","Price realistic"],"physical_checks":["Dial *#06# and confirm IMEI matches box sticker","Check storage by copying a large file","Verify brand logo font and spacing"],"advice":"Based on the information provided, this phone shows no major red flags. Always verify physically in the shop before paying.","service_centre":"Visit Vmobile Kenya (Benco authorised dealer) in Nairobi for official confirmation.","certificate_note":"This SimuScan result can be shown to the seller if a dispute arises."}`
  });

  // Call Anthropic API
  const requestBody = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1200,
    system: "You are SimuScan — Kenya's phone authentication AI. Be accurate and honest. Respond ONLY with the pure JSON object shown in the prompt — no markdown, no backticks, no extra text.",
    messages: [{ role: "user", content: userContent }]
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(requestBody)
        }
      }, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch(e) { reject(new Error("Failed to parse API response")); }
        });
      });
      req.on("error", reject);
      req.setTimeout(25000, () => { req.destroy(); reject(new Error("Request timed out — please try again")); });
      req.write(requestBody);
      req.end();
    });

    if (result.status !== 200) {
      const msg = result.body?.error?.message || "API error " + result.status;
      return { statusCode: 500, headers, body: JSON.stringify({ error: { message: msg } }) };
    }

    const textBlock = result.body.content && result.body.content.find(b => b.type === "text");
    if (!textBlock || !textBlock.text) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: { message: "No response from AI. Please try again." } }) };
    }

    // Parse the JSON verdict
    const cleaned = textBlock.text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const verdict = JSON.parse(cleaned);

    return { statusCode: 200, headers, body: JSON.stringify(verdict) };

  } catch(err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: { message: err.message || "Verification failed. Please try again." } })
    };
  }
};
    
