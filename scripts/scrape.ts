// Daily: fetch every source's listing and insert new articles (unscored).
// Usage: node scripts/scrape.ts [sourceKey ...]   (no args = all sources)
// DRY_RUN=1: print parsed articles, save nothing. Add DUMP_DIR=debug to cache fetched pages.
import { openDb, saveDb } from "../src/db.ts";
import { ALL_SOURCES } from "../src/sources.ts";
import { scrapeSource } from "../src/scraper.ts";
import { stats } from "../src/fetcher.ts";

const only = process.argv.slice(2);
const sources = only.length ? ALL_SOURCES.filter((s) => only.includes(s.key)) : ALL_SOURCES;
if (only.length && sources.length !== only.length) {
  console.error(`Unknown source key(s). Valid: ${ALL_SOURCES.map((s) => s.key).join(", ")}`);
  process.exit(1);
}

const db = openDb();
const insert = db.prepare(
  "INSERT OR IGNORE INTO articles (url, title, summary, date, source, scraped_at) VALUES (?, ?, ?, ?, ?, ?)",
);

// Ignore articles published long ago (e.g. MF lists the whole year): they'd otherwise be
// inserted as "new" the first time we see them and flood the digest.
const MAX_AGE_DAYS = 30;
function isTooOld(dmy: string): boolean {
  const m = dmy.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return false; // unknown date: keep
  const published = Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return Date.now() - published > MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

let totalNew = 0;
const failed: string[] = [];
const empty: string[] = [];

for (const source of sources) {
  try {
    const parsed = await scrapeSource(source);
    const articles = parsed.filter((a) => !isTooOld(a.date));
    if (parsed.length !== articles.length) {
      console.log(`[${source.key}] skipped ${parsed.length - articles.length} older than ${MAX_AGE_DAYS} days`);
    }
    if (process.env.DRY_RUN) {
      if (articles.length === 0) empty.push(source.key);
      console.log(`[${source.key}] parsed ${articles.length}`);
      for (const a of articles) {
        console.log(`  ${a.date || "??.??.????"} | ${a.title.slice(0, 80)} | ${a.url}${a.summary ? "" : " | (no summary)"}`);
      }
      continue;
    }
    let added = 0;
    const now = Math.floor(Date.now() / 1000);
    for (const a of articles) {
      if (!a.url || !a.title) continue;
      added += Number(insert.run(a.url, a.title, a.summary, a.date, source.key, now).changes);
    }
    totalNew += added;
    if (articles.length === 0) empty.push(source.key);
    console.log(`[${source.key}] parsed ${articles.length}, new ${added}`);
  } catch (err) {
    failed.push(source.key);
    console.error(`[${source.key}] ERROR: ${err instanceof Error ? err.message : err}`);
  }
}

if (process.env.DRY_RUN) {
  console.log(`Dry run, nothing saved. Firecrawl calls: ${stats.firecrawlCalls}, plain fetches: ${stats.plainFetches}.`);
  if (empty.length) console.log(`Parsed 0 from: ${empty.join(", ")}`);
  if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
  process.exit(0);
}
const total = saveDb(db);
console.log(
  `Done. ${totalNew} new articles (${total} total). Firecrawl calls: ${stats.firecrawlCalls}, plain fetches: ${stats.plainFetches}.`,
);
if (empty.length) console.warn(`::warning::Parsed 0 articles from: ${empty.join(", ")} (parser may need re-tuning)`);
if (failed.length) console.warn(`::warning::Failed sources: ${failed.join(", ")}`);
// Only fail the workflow if everything broke; partial failures are warnings.
if (failed.length === sources.length) process.exit(1);
