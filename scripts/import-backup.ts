// One-off: convert the Val Town export (api.ts ?all=true) into data/articles.jsonl.
// Full article text ("content") is dropped — it's only needed at scoring time.
// Usage: node scripts/import-backup.ts backup/articles-2026-11-16.json
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { COLUMNS, saveDb } from "../src/db.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/import-backup.ts <export.json>");
  process.exit(1);
}

const rows = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE articles (id INTEGER PRIMARY KEY, url TEXT UNIQUE, title TEXT, summary TEXT, date TEXT,
  source TEXT, scraped_at INTEGER, score INTEGER, score_reason TEXT, title_en TEXT)`);
const insert = db.prepare(`INSERT INTO articles (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`);
for (const r of rows) insert.run(...COLUMNS.map((c) => (r[c] ?? null) as string | number | null));

console.log(`Imported ${saveDb(db)} articles into data/articles.jsonl`);
