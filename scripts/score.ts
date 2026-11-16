// Daily: fetch content for unscored articles and score them with Gemini.
// Skips cleanly if GEMINI_API_KEY is not set (scoring is set up separately).
import { openDb, saveDb } from "../src/db.ts";
import { scrapeArticleContent } from "../src/scraper.ts";
import { type Language, scoreArticle } from "../src/scorer.ts";
import { stats } from "../src/fetcher.ts";
import { COUNTRIES } from "../src/sources.ts";

const BATCH_SIZE = Number(process.env.SCORE_BATCH_SIZE || 50);
// Only score recent articles; older ones can't reach the weekly digest anyway.
const MAX_AGE_DAYS = Number(process.env.SCORE_MAX_AGE_DAYS || 7);

// Polish sources → Polish summary; Czech/Slovak → English summary + English title.
const LANGUAGE_BY_SOURCE: Record<string, Language> = Object.fromEntries(
  COUNTRIES.flatMap((c) => c.sources.map((s) => [s.key, c.code === "PL" ? "pl" : "en"] as const)),
);

if (!process.env.GEMINI_API_KEY) {
  console.log("GEMINI_API_KEY not set — skipping scoring.");
  process.exit(0);
}

// Pages that only contain cookie consent / privacy policy junk
const JUNK_MARKERS = [
  "cookie", "cookies", "süti", "soubory cookie", "súbory cookie",
  "dbamy o twoją prywatność", "polityka cookies", "zásady ochrany",
  "nastavení souborů", "ochrana osobných údajov",
];

function isJunkContent(content: string): boolean {
  if (!content || content.length < 50) return true;
  const lower = content.toLowerCase();
  const hits = JUNK_MARKERS.filter((m) => lower.includes(m)).length;
  if (content.length < 500 && hits >= 2) return true;
  if (hits >= 3 && content.length < 1500) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const db = openDb();
const since = Math.floor(Date.now() / 1000) - MAX_AGE_DAYS * 24 * 60 * 60;
const rows = db
  .prepare(
    "SELECT id, url, title, summary, source FROM articles WHERE score IS NULL AND scraped_at >= ? ORDER BY scraped_at ASC LIMIT ?",
  )
  .all(since, BATCH_SIZE) as { id: number; url: string; title: string; summary: string; source: string }[];

if (rows.length === 0) {
  console.log(`No unscored articles from the last ${MAX_AGE_DAYS} days.`);
  process.exit(0);
}

console.log(`Scoring ${rows.length} articles...`);
const update = db.prepare("UPDATE articles SET score = ?, score_reason = ?, title_en = ? WHERE id = ?");
let scored = 0;
let consecutiveFailures = 0;

for (const [i, row] of rows.entries()) {
  if (i > 0) await sleep(3000);

  let content = "";
  try {
    content = await scrapeArticleContent(row.url);
  } catch (err) {
    console.error(`[${row.source}] content fetch failed for ${row.url}: ${err instanceof Error ? err.message : err}`);
  }
  const usable = isJunkContent(content) ? "" : content;
  if (!usable) console.log(`[${row.source}] no usable page text (${content.length} chars) — scoring title + summary`);
  const text = usable || `${row.title}\n\n${row.summary}`;

  try {
    const result = await scoreArticle(row.title, text, LANGUAGE_BY_SOURCE[row.source] ?? "en");
    update.run(result.score, result.reason, result.title_en, row.id);
    scored++;
    consecutiveFailures = 0;
    console.log(`[${row.source}] ${result.score}: ${(result.title_en || row.title).slice(0, 70)}`);
  } catch (err) {
    // Leave score NULL so it is retried next run.
    console.error(`[${row.source}] scoring failed: ${err instanceof Error ? err.message : err}`);
    if (++consecutiveFailures >= 3) {
      console.error("::error::3 scoring failures in a row — stopping (check GEMINI_API_KEY / billing).");
      break;
    }
  }
}

saveDb(db);
const left = (db.prepare("SELECT COUNT(*) AS n FROM articles WHERE score IS NULL").get() as { n: number }).n;
console.log(`Scored ${scored}. ${left} still unscored. Firecrawl calls: ${stats.firecrawlCalls}.`);
if (scored === 0) process.exit(1);
