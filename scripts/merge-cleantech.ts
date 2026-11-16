// One-off: merge the CleanTech for CEE monitor's Val Town export into data/articles.jsonl.
// - EU sources are dropped (no longer monitored).
// - Rows where Gemini failed (score 0 + empty reason) count as unscored.
// - For URLs we already have, a real CleanTech score + Polish summary replaces ours
//   (the combined digest shows Polish summaries for Polish sources).
// Usage: node scripts/merge-cleantech.ts backup/cleantech-articles-2026-11-16.json
import { readFileSync } from "node:fs";
import { openDb, saveDb } from "../src/db.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/merge-cleantech.ts <export.json>");
  process.exit(1);
}

type Row = {
  url: string; title: string; summary: string; date: string; source: string;
  scraped_at: number; score: number | null; score_reason: string | null;
};
const rows = (JSON.parse(readFileSync(file, "utf8")) as Row[]).filter((r) => !r.source.startsWith("eu-"));
const hasRealScore = (r: Row) => r.score !== null && (r.score_reason ?? "").trim() !== "";

const db = openDb();
const find = db.prepare("SELECT id FROM articles WHERE url = ?");
const insert = db.prepare(
  "INSERT INTO articles (url, title, summary, date, source, scraped_at, score, score_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
const rescore = db.prepare("UPDATE articles SET score = ?, score_reason = ?, title_en = NULL WHERE id = ?");

let added = 0, replaced = 0, kept = 0;
db.exec("BEGIN");
for (const r of rows) {
  const existing = find.get(r.url) as { id: number } | undefined;
  if (!existing) {
    insert.run(r.url, r.title, r.summary ?? "", r.date ?? "", r.source, r.scraped_at,
      hasRealScore(r) ? r.score : null, hasRealScore(r) ? r.score_reason : null);
    added++;
  } else if (hasRealScore(r)) {
    rescore.run(r.score, r.score_reason, existing.id);
    replaced++;
  } else {
    kept++;
  }
}
db.exec("COMMIT");

console.log(`Merged ${rows.length} Polish rows: ${added} added, ${replaced} re-scored with CleanTech's Polish summary, ${kept} left as-is.`);
console.log(`Total articles: ${saveDb(db)}`);
