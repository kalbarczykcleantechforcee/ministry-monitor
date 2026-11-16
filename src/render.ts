// Weekly digest HTML, used both for the email and for the GitHub Pages preview.
import type { DatabaseSync } from "node:sqlite";
import { COUNTRIES } from "./sources.ts";
import type { ArticleRow } from "./db.ts";

export const SCORE_THRESHOLD = 40;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function getDigestArticles(db: DatabaseSync, days = 7): ArticleRow[] {
  const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  return db
    .prepare("SELECT * FROM articles WHERE score >= ? AND scraped_at >= ? ORDER BY source, score DESC, date DESC")
    .all(SCORE_THRESHOLD, since) as unknown as ArticleRow[];
}

export function renderDigestBody(articles: ArticleRow[]): string {
  const grouped: Record<string, ArticleRow[]> = {};
  for (const a of articles) (grouped[a.source] ??= []).push(a);

  let sections = "";
  for (const country of COUNTRIES) {
    sections += `
      <h2 style="color:#1a1a1a;font-size:20px;margin:32px 0 16px;border-bottom:3px solid #1a73e8;padding-bottom:8px">${country.flag} ${esc(country.name)}</h2>`;
    for (const source of country.sources) {
      const items = grouped[source.key] || [];
      const list = items.length
        ? items
          .map(
            (a) => `
            <div style="margin-bottom:20px">
              <a href="${esc(a.url)}" style="color:#1a73e8;text-decoration:none;font-size:15px;font-weight:600">${esc(a.title)}</a>
              <p style="color:#333;margin:4px 0 0;font-size:14px;line-height:1.5">${esc(a.score_reason)}</p>
            </div>`,
          )
          .join("")
        : `<p style="color:#888;font-style:italic">No relevant articles this week.</p>`;
      sections += `
        <h3 style="color:#444;font-size:16px;margin:20px 0 8px">${esc(source.label)}</h3>
        ${list}`;
    }
  }

  return `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:20px">
      <h1 style="color:#1a1a1a;font-size:22px;margin-bottom:4px">Visegrad Ministry Monitor</h1>
      <p style="color:#888;font-size:13px;margin-top:0">${articles.length} relevant articles this week</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0 8px">
      ${sections}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px">
      <p style="color:#999;font-size:11px">
        Articles scored by AI for relevance to district heating, local content requirements, and carbon pricing.
      </p>
    </div>`;
}

export function renderPreviewPage(articles: ArticleRow[]): string {
  const updated = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visegrad Ministry Monitor</title></head>
<body style="background:#f9f9f9;margin:0;padding:40px 16px">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    ${renderDigestBody(articles)}
    <p style="font-family:sans-serif;color:#aaa;font-size:11px;padding:0 20px 20px;margin:0">Preview of the next digest (last 7 days). Updated ${updated}.</p>
  </div>
</body></html>
`;
}
