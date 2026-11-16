// Gemini relevance scoring. Ported unchanged from Val Town.
// TODO(gemini): new key (Val Town key hit "prepayment credits are depleted"), revisit prompt.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

const SYSTEM_PROMPT = `You are an analyst monitoring Polish government press releases for topics relevant to EU climate and industrial policy.

Your job is to score how relevant a government press release is to our key focus areas:

1. **ETS / Emissions Trading System** — EU ETS reforms, carbon pricing mechanisms, ETS2 (buildings & transport), free allowances phase-out, Carbon Border Adjustment Mechanism (CBAM), carbon market developments, ETS revenue allocation, impact on industry and energy sector.

2. **Innovation Fund** — EU Innovation Fund calls, projects funded by the Innovation Fund, large-scale demonstration of innovative low-carbon technologies, Polish applications or beneficiaries, synergies with ETS revenues.

3. **MFF (Multiannual Financial Framework)** — EU budget negotiations, MFF allocations for climate and energy, cohesion policy funding for green transition, Just Transition Fund, EU funding programs relevant to Poland's energy and climate goals.

4. **Industrial Acceleration Act** — EU Industrial Accelerator Act, Net-Zero Industry Act (NZIA), acceleration of clean technology manufacturing in Europe, permitting simplification for cleantech factories, EU industrial policy for strategic net-zero technologies, clean tech supply chain resilience.

Secondary relevance (lower scores): broader energy transition policy, renewable energy, decarbonization targets, green funding programs, carbon capture, hydrogen strategy, energy security measures with climate implications.

Score each article 0-100:
- 80-100: Directly about ETS/carbon pricing OR Innovation Fund OR MFF/EU budget for climate OR Industrial Acceleration Act / NZIA
- 60-79: Strongly related (e.g. EU funding allocations for energy transition, industrial policy for clean manufacturing)
- 40-59: Moderately related (broader energy/climate policy with indirect implications)
- 20-39: Tangentially related (general environmental policy)
- 0-19: Not relevant (e.g. forests, biodiversity, waste management, routine fuel prices, border control, health programs)

Respond in JSON only: {"score": <number>, "reason": "<1-2 sentences in English summarizing the article — key facts, decisions, amounts, people>"}`;

export interface ScoreResult {
  score: number;
  reason: string;
}

export async function scoreArticle(title: string, content: string): Promise<ScoreResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Article title: ${title}\n\nArticle content:\n${content.slice(0, 8000)}` }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(`Gemini error ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return parseScoreJson(text);
}

function parseScoreJson(text: string): ScoreResult {
  const attempts = [
    text,
    text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)?.[1]?.trim(),
    text.match(/\{[\s\S]*\}/)?.[0],
  ];
  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as ScoreResult;
    } catch { /* try next */ }
  }
  throw new Error(`Could not parse Gemini response as JSON: ${text.slice(0, 200)}`);
}
