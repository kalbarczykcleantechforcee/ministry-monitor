// Daily: fetch content for unscored articles and score them with Gemini.
// Skips cleanly if GEMINI_API_KEY is not set (scoring is set up separately).
import { openDb, saveDb } from "../src/db.ts";
import { scrapeArticleContent } from "../src/scraper.ts";
import { scoreArticle } from "../src/scorer.ts";
import { stats } from "../src/fetcher.ts";

const BATCH_SIZE = Number(process.env.SCORE_BATCH_SIZE || 50);

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
const rows = db
  .prepare("SELECT id, url, title, summary, source FROM articles WHERE score IS NULL ORDER BY scraped_at ASC LIMIT ?")
  .all(BATCH_SIZE) as { id: number; url: string; title: string; summary: string; source: string }[];

if (rows.length === 0) {
  console.log("No unscored articles.");
  process.exit(0);
}

console.log(`Scoring ${rows.length} articles...`);
const update = db.prepare("UPDATE articles SET score = ?, score_reason = ? WHERE id = ?");
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
  const text = usable || `${row.title}\n\n${row.summary}`;

  try {
    const result = await scoreArticle(row.title, text);
    update.run(result.score, result.reason, row.id);
    scored++;
    consecutiveFailures = 0;
    console.log(`[${row.source}] ${result.score}: ${row.title.slice(0, 70)}`);
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
