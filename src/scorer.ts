// Gemini relevance scoring: one combined prompt for the CleanTech for CEE / Visegrad digest.
// Polish articles get a Polish summary; Czech/Slovak articles get an English summary and an
// English translation of the title.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const SYSTEM_PROMPT = `You are a policy analyst for CleanTech for CEE, a cleantech advocacy organisation working in Central & Eastern Europe. You read press releases from Polish, Czech and Slovak ministries and public funds and score how relevant each one is to our work.

PRIMARY focus areas (80-100 when the article is directly about one of them):
1. District heating (ciepłownictwo systemowe / dálkové vytápění / centrálne zásobovanie teplom): decarbonisation of heating networks, large heat pumps, heat storage, waste-heat use, modernisation of heating infrastructure, heating-sector regulation and tariffs, funding for heating transformation.
2. Local content / local value: requirements or incentives for local manufacturing and supply chains of clean technologies (heat pumps, PV, wind, batteries, grid equipment) in PL/CZ/SK/CEE, local-content criteria in subsidies, auctions or public procurement.
3. EU Industrial Accelerator Act / Net-Zero Industry Act (NZIA): clean-tech manufacturing in Europe, permitting for cleantech factories, strategic net-zero technologies, supply-chain resilience.
4. EU ETS and carbon pricing: ETS reforms, ETS2 (buildings & transport), free allowances, CBAM, carbon market developments, use of ETS revenues, impact on industry and heating.
5. EU Innovation Fund: calls, funded projects, national applicants or beneficiaries.
6. EU funds for the climate/energy transition: MFF negotiations and allocations, Modernisation Fund, Just Transition Fund, cohesion policy and RRF money for decarbonisation.

SECONDARY topics (score lower): broader energy-transition policy, renewables, heat pumps and building energy efficiency, energy storage, grids, hydrogen, CCS/CCUS, clean air, green funding programmes, decarbonisation targets, commercialisation of science and R&D for clean technologies, AI applied to energy, climate or industry.

Scoring scale 0-100:
- 80-100: directly about a primary focus area
- 60-79: strongly related (e.g. funding for energy transition, industrial policy for clean manufacturing)
- 40-59: moderately related (broader energy/climate policy with indirect implications)
- 20-39: tangentially related (general environmental policy)
- 0-19: not relevant (forests, biodiversity, waste with no cleantech angle, routine or maximum fuel price announcements, culture, sport, education, health, defence, border control)

Respond in JSON only, following the language instruction given with the article.`;

export type Language = "pl" | "en";

export interface ScoreResult {
  score: number;
  reason: string;
  title_en: string | null;
}

export async function scoreArticle(title: string, content: string, language: Language): Promise<ScoreResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const instruction = language === "pl"
    ? `Language: write "reason" in Polish (1-2 sentences summarising the article: key facts, decisions, amounts, people). Set "title_en" to an empty string.`
    : `Language: write "reason" in English (1-2 sentences summarising the article: key facts, decisions, amounts, people). Set "title_en" to a natural English translation of the article title.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${instruction}\n\nArticle title: ${title}\n\nArticle content:\n${content.slice(0, 8000)}` }],
        }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              score: { type: "INTEGER" },
              reason: { type: "STRING" },
              title_en: { type: "STRING" },
            },
            required: ["score", "reason", "title_en"],
          },
        },
      }),
      signal: AbortSignal.timeout(90000),
    },
  );

  if (!resp.ok) {
    throw new Error(`Gemini error ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Empty Gemini response (finishReason: ${data.candidates?.[0]?.finishReason})`);

  const parsed = parseJson(text);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
  if (!Number.isFinite(score)) throw new Error(`Bad score in Gemini response: ${text.slice(0, 200)}`);
  return {
    score,
    reason: String(parsed.reason ?? "").trim(),
    title_en: language === "en" && parsed.title_en ? String(parsed.title_en).trim() : null,
  };
}

function parseJson(text: string): Record<string, unknown> {
  for (const candidate of [text, text.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch { /* try next */ }
  }
  throw new Error(`Could not parse Gemini response as JSON: ${text.slice(0, 200)}`);
}
