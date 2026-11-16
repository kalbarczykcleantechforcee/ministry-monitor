// Weekly digest email, or (with --preview) write docs/index.html for GitHub Pages.
// Email needs: GMAIL_USER, GMAIL_APP_PASSWORD, DIGEST_EMAILS (comma-separated).
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { openDb } from "../src/db.ts";
import { getDigestArticles, renderDigestBody, renderPreviewPage } from "../src/render.ts";

const db = openDb();
const articles = getDigestArticles(db);

if (process.argv.includes("--preview")) {
  const docsDir = fileURLToPath(new URL("../docs/", import.meta.url));
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(docsDir + "index.html", renderPreviewPage(articles));
  console.log(`Preview written to docs/index.html (${articles.length} articles).`);
  process.exit(0);
}

if (articles.length === 0) {
  console.log("No relevant articles this week, skipping digest.");
  process.exit(0);
}

const recipients = (process.env.DIGEST_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD;
if (!recipients.length || !user || !pass) {
  console.error("::error::DIGEST_EMAILS, GMAIL_USER and GMAIL_APP_PASSWORD must all be set.");
  process.exit(1);
}

const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
const html = renderDigestBody(articles);

for (const to of recipients) {
  await transport.sendMail({ from: `Visegrad Ministry Monitor <${user}>`, to, subject: "Visegrad Ministry Monitor", html });
}
console.log(`Digest sent to ${recipients.length} recipients with ${articles.length} articles.`);
