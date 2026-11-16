// Weekly digest HTML, used for the email and the GitHub Pages preview.
// One digest: Polish sources first (Polish summaries), then Czech and Slovak (English titles + summaries).
import type { DatabaseSync } from "node:sqlite";
import { COUNTRIES } from "./sources.ts";
import type { ArticleRow } from "./db.ts";

export const SCORE_THRESHOLD = 40;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const SOURCE_LABEL: Record<string, string> = Object.fromEntries(
  COUNTRIES.flatMap((c) => c.sources.map((s) => [s.key, s.label])),
);

export interface DigestItem extends ArticleRow {
  alsoFrom: string[]; // labels of other sources that published the same story
}

export function getDigestArticles(db: DatabaseSync, days = 7): DigestItem[] {
  const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const rows = db
    .prepare("SELECT * FROM articles WHERE score >= ? AND scraped_at >= ? ORDER BY score DESC, id ASC")
    .all(SCORE_THRESHOLD, since) as unknown as ArticleRow[];
  return dedupe(rows);
}

// The same press release is often published by two bodies (e.g. Ministry of Climate + NFOŚiGW).
// Treat titles as the same story when one normalised title equals or starts with the other.
function dedupe(rows: ArticleRow[]): DigestItem[] {
  const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  const kept: (DigestItem & { _n: string })[] = [];
  for (const row of rows) {
    const n = norm(row.title);
    const dup = kept.find((k) => k._n === n || (Math.min(k._n.length, n.length) >= 30 && (k._n.startsWith(n) || n.startsWith(k._n))));
    if (dup) {
      if (row.source !== dup.source) dup.alsoFrom.push(SOURCE_LABEL[row.source] ?? row.source);
      continue;
    }
    kept.push({ ...row, alsoFrom: [], _n: n });
  }
  return kept.map(({ _n, ...item }) => item);
}

function renderItem(a: DigestItem, english: boolean): string {
  const title = english && a.title_en ? a.title_en : a.title;
  const original = english && a.title_en ? `<div style="color:#999;font-size:12px;margin-top:2px">${esc(a.title)}</div>` : "";
  const also = a.alsoFrom.length ? ` · ${english ? "also" : "także"}: ${esc(a.alsoFrom.join(", "))}` : "";
  return `
    <div style="margin:0 0 18px">
      <a href="${esc(a.url)}" style="color:#1a73e8;text-decoration:none;font-size:15px;font-weight:600;line-height:1.35">${esc(title)}</a>
      ${original}
      <p style="color:#333;margin:4px 0 2px;font-size:14px;line-height:1.5">${esc(a.score_reason)}</p>
      <div style="color:#999;font-size:12px">${esc(a.date)} · ${esc(SOURCE_LABEL[a.source] ?? a.source)}${also} · score ${a.score}</div>
    </div>`;
}

export function renderDigestBody(items: DigestItem[]): string {
  let sections = "";
  for (const country of COUNTRIES) {
    const english = country.code !== "PL";
    const keys = new Set(country.sources.map((s) => s.key));
    const list = items.filter((a) => keys.has(a.source));
    const body = list.length
      ? list.map((a) => renderItem(a, english)).join("")
      : `<p style="color:#888;font-style:italic;font-size:14px">${english ? "No relevant articles this week." : "Brak istotnych artykułów w tym tygodniu."}</p>`;
    sections += `
      <h2 style="color:#1a1a1a;font-size:19px;margin:30px 0 14px;border-bottom:3px solid #1a73e8;padding-bottom:6px">${country.flag} ${esc(country.name)} <span style="color:#999;font-size:13px;font-weight:normal">(${list.length})</span></h2>
      ${body}`;
  }

  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px">
      <h1 style="color:#1a1a1a;font-size:22px;margin:0 0 4px">Ministry Monitor</h1>
      <p style="color:#888;font-size:13px;margin:0">${items.length} relevant articles this week · Poland, Czech Republic, Slovakia</p>
      ${sections}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px">
      <p style="color:#999;font-size:11px;line-height:1.5;margin:0">
        Articles from the last 7 days, scored by AI for relevance to district heating, local content, the Industrial Accelerator Act / NZIA, EU ETS &amp; CBAM, the Innovation Fund and EU funds for the energy transition. Polish summaries for Polish sources; Czech and Slovak titles and summaries translated into English.
      </p>
    </div>`;
}

export function renderPreviewPage(items: DigestItem[]): string {
  const updated = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ministry Monitor</title></head>
<body style="background:#f6f7f9;margin:0;padding:32px 16px">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    ${renderDigestBody(items)}
    <p style="font-family:sans-serif;color:#aaa;font-size:11px;padding:0 20px 20px;margin:0">Preview of the next digest (last 7 days). Updated ${updated}.</p>
  </div>
</body></html>
`;
}
