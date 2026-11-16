// Storage: data/articles.jsonl is the source of truth (one article per line, sorted by id,
// so git diffs stay small). Each run loads it into an in-memory SQLite DB and writes it back.
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_FILE = fileURLToPath(new URL("../data/articles.jsonl", import.meta.url));

export const COLUMNS = [
  "id",
  "url",
  "title",
  "summary",
  "date",
  "source",
  "scraped_at",
  "score",
  "score_reason",
] as const;

export interface ArticleRow {
  id: number;
  url: string;
  title: string;
  summary: string;
  date: string; // DD.MM.YYYY as published
  source: string; // Source.key
  scraped_at: number; // unix seconds
  score: number | null; // null = not scored yet
  score_reason: string | null;
}

export function openDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE,
    title TEXT,
    summary TEXT,
    date TEXT,
    source TEXT,
    scraped_at INTEGER,
    score INTEGER,
    score_reason TEXT
  )`);

  if (existsSync(DATA_FILE)) {
    const insert = db.prepare(
      `INSERT INTO articles (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`,
    );
    db.exec("BEGIN");
    for (const line of readFileSync(DATA_FILE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      insert.run(...COLUMNS.map((c) => row[c] ?? null));
    }
    db.exec("COMMIT");
  }
  return db;
}

export function saveDb(db: DatabaseSync): number {
  const rows = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM articles ORDER BY id`).all();
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  return rows.length;
}
