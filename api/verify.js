const https = require("https");

function post(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: "POST", headers }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(new Error("Parse error")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error("Request timed out — please try again")); });
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
  if (!apiKey) return res.status(500).json({ error: { message: "API key not configured." } });

  const { brand, model, imei, imeiOk, price, currency, notes, photos } = req.body;
  if (!brand || !model || !imei) return res.status(400).json({ error: { message: "Brand, model and IMEI are required." } });

  const tac = imei.substring(0, 8);
  const photoCount = Array.isArray(photos) ? photos.filter(p => p && p.b64).length : 0;

  const userContent = [];

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

  userContent.push({
    type: "text",
    text: `You are SimuScan, Kenya's most trusted phone verification AI.

PHONE SUBMITTED:
Brand: ${brand}
Model: ${model}
IMEI: ${imei}
IMEI Luhn: ${imeiOk ? "PASSED" : "FAILED - major red flag"}
TAC (first 8 digits): ${tac}
Price: ${price ? price + " " + currency : "not provided"}
Notes: ${notes || "none"}
Photos: ${photoCount}

REAL PHONES - NEVER FLAG AS NON-EXISTENT OR FAKE:
Samsung S21, S22, S23, S24, S25, S25 Ultra, S25 Edge, S26 (all real)
Samsung A05, A06, A07, A15, A16, A17, A25, A35, A55 (all real 2024-2025)
iPhone 13, 14, 15, 16, 16 Pro, 16 Pro Max, 17 (all real)
Tecno Camon 20, 30, 40, 40 Pro (all real)
Infinix Note 40, Hot 40, Smart 8 (all real)
Redmi 12C, 13C, 15C, Note 13, Note 14 (all real)
Benco S1, S1 Plus, V60, Y40 (all real - Vmobile Kenya)
Nothing Phone 2a, 3a (real - UK brand in Kenya)
Neon phones by Safaricom (real - Kenya branded Android)
Honor X6, X8, X8b (real - spun off from Huawei)
Huawei Nova, P, Mate series (all real)

KENYA GENUINE PRICES 2025:
Samsung S25 Ultra: KES 155,000-185,000
Samsung S25: KES 110,000-135,000
Samsung S24: KES 95,000-120,000
Samsung A55: KES 38,000-48,000
Samsung A35: KES 26,000-34,000
Samsung A25: KES 18,000-24,000
Samsung A17: KES 13,000-17,000
Samsung A15: KES 11,000-15,000
Samsung A07: KES 10,000-16,000
Samsung A06: KES 9,000-12,000
Samsung A05: KES 8,000-11,000
iPhone 16 Pro Max: KES 175,000-210,000
iPhone 16 Pro: KES 145,000-175,000
iPhone 16: KES 115,000-140,000
iPhone 15: KES 95,000-120,000
iPhone 14: KES 75,000-95,000
iPhone 13: KES 55,000-75,000
Tecno Camon 40 Pro: KES 28,000-35,000
Tecno Camon 30 Pro: KES 22,000-28,000
Infinix Note 40 Pro: KES 24,000-30,000
Redmi Note 14: KES 18,000-26,000
Redmi Note 13: KES 16,000-22,000
Redmi 15C: KES 12,000-16,000
Benco S1 Plus: KES 7,000-10,000
Nothing Phone 3a: KES 32,000-40,000
Honor X8b: KES 16,000-22,000

FAKE PATTERNS:
- U-FM sold as Tecno Camon 40 Pro under KES 15,000 = clone
- iPhone under KES 40,000 = fake
- Samsung S series under KES 40,000 = fake
- IMEI Luhn FAIL = very likely fake
- Storage fraud: claims 256GB but actually 8-16GB
- TAC: Samsung 35xxxxxx, Apple 01/35xxxxxx, Transsion 86xxxxxx, Benco 86xxxxxx

SCORING: Start 85. Luhn fail -35. Model truly does not exist -50. TAC wrong brand -30. Price 40% below market -20. Visual fake -20. Clone brand -30.
GENUINE=75+, SUSPICIOUS=45-74, FAKE=below 45

${photoCount > 0 ? "Analyse ALL photos carefully for logo, box, specs, build quality, clone brands." : ""}

Reply ONLY with this JSON:
{"score":85,"verdict":"GENUINE","headline":"This phone appears genuine.","confidence":"HIGH","imei_result":{"passed":true,"detail":"IMEI passes Luhn check."},"tac_result":{"passed":true,"detail":"TAC matches brand."},"model_result":{"exists":true,"release_year":"2024","detail":"Model is legitimate."},"price_result":{"realistic":true,"genuine_range_kes":"KES 7,000-10,000","detail":"Price is realistic."},"visual_result":{"detail":"No photo provided."},"storage_warning":false,"storage_warning_detail":"","clone_warning":false,"clone_warning_detail":"","red_flags":[],"green_flags":["IMEI valid","Model verified","Price realistic"],"physical_checks":["Dial *#06# confirm IMEI matches box","Copy large file to test storage","Check logo font carefully"],"advice":"No major red flags found. Verify physically before paying.","service_centre":"Visit brand authorised service centre in Nairobi.","certificate_note":"Show this SimuScan result if dispute arises."}`
  });

  const requestBody = JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: "You are SimuScan — Kenya phone authentication AI. Be accurate. Never flag real phones as fake. Respond ONLY with pure JSON.",
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
        "Content-Length": Buffer.byteLength(requestBody)
      },
      requestBody
    );

    if (result.status !== 200) {
      return res.status(500).json({ error: { message: result.body?.error?.message || "API error " + result.status } });
    }

    const textBlock = result.body.content && result.body.content.find(b => b.type === "text");
    if (!textBlock || !textBlock.text) {
      return res.status(500).json({ error: { message: "No AI response. Please try again." } });
    }

    const cleaned = textBlock.text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const verdict = JSON.parse(cleaned);
    return res.status(200).json(verdict);

  } catch(err) {
    return res.status(500).json({ error: { message: err.message || "Verification failed. Try again." } });
  }
}
