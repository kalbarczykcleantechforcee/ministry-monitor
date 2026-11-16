// Weekly digest email via the Brevo HTTP API.
//   node scripts/digest.ts            send to everyone in DIGEST_EMAILS
//   node scripts/digest.ts --test     send only to DIGEST_FROM (the sender itself)
//   node scripts/digest.ts --preview  write docs/index.html, send nothing
// Needs: BREVO_API_KEY, DIGEST_FROM (sender verified in Brevo), DIGEST_EMAILS (comma-separated).
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db.ts";
import { getDigestArticles, renderDigestBody, renderPreviewPage } from "../src/render.ts";

const SENDER_NAME = "Ministry Monitor";

const items = getDigestArticles(openDb());

if (process.argv.includes("--preview")) {
  const docsDir = fileURLToPath(new URL("../docs/", import.meta.url));
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(docsDir + "index.html", renderPreviewPage(items));
  console.log(`Preview written to docs/index.html (${items.length} articles).`);
  process.exit(0);
}

const test = process.argv.includes("--test");
if (items.length === 0 && !test) {
  console.log("No relevant articles this week, skipping digest.");
  process.exit(0);
}

const apiKey = process.env.BREVO_API_KEY;
const from = process.env.DIGEST_FROM?.trim();
const recipients = test
  ? [from ?? ""]
  : (process.env.DIGEST_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
if (!apiKey || !from || !recipients.length || !recipients[0]) {
  console.error("::error::BREVO_API_KEY, DIGEST_FROM and DIGEST_EMAILS must all be set.");
  process.exit(1);
}

const today = new Date();
const subject = `${test ? "[TEST] " : ""}Ministry Monitor · ${String(today.getUTCDate()).padStart(2, "0")}.${String(today.getUTCMonth() + 1).padStart(2, "0")}.${today.getUTCFullYear()}`;
const html = renderDigestBody(items);

// One email per recipient, so nobody sees the rest of the list.
let sent = 0;
for (const to of recipients) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: SENDER_NAME, email: from }, to: [{ email: to }], subject, htmlContent: html }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    console.error(`::error::Brevo ${resp.status} for recipient #${sent + 1}: ${(await resp.text()).slice(0, 300)}`);
    continue;
  }
  sent++;
}

console.log(`Digest${test ? " (TEST)" : ""} sent to ${sent}/${recipients.length} recipient(s) with ${items.length} articles.`);
if (sent < recipients.length) process.exit(1);
