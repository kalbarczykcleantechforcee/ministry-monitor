// Two ways to get a page:
//  - fetchMarkdown: Firecrawl /v2/scrape (1 credit per call). Used where sites need a real browser.
//  - fetchHtml:     plain fetch, free. Used wherever a site serves usable HTML.
// With DUMP_DIR set (e.g. DUMP_DIR=debug), every fetched page is saved there and reused on
// later runs, so parsers can be re-tuned offline without spending credits.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
// Free plan has a low per-minute limit; keep a gap between calls.
const MIN_GAP_MS = 7000;
const MAX_ATTEMPTS = Number(process.env.FIRECRAWL_ATTEMPTS || 3);

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastFirecrawlCall = 0;
export const stats = { firecrawlCalls: 0, plainFetches: 0 };

function dumpPath(url: string, ext: "md" | "html"): string | null {
  const dir = process.env.DUMP_DIR;
  if (!dir) return null;
  mkdirSync(dir, { recursive: true });
  return join(dir, url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.-]+/g, "_").slice(0, 150) + "." + ext);
}

async function cached(url: string, ext: "md" | "html", fetchLive: () => Promise<string>): Promise<string> {
  const path = dumpPath(url, ext);
  if (path && existsSync(path)) {
    console.log(`  [cache] ${path}`);
    return readFileSync(path, "utf8");
  }
  const text = await fetchLive();
  if (path) writeFileSync(path, text);
  return text;
}

export function fetchMarkdown(url: string): Promise<string> {
  return cached(url, "md", () => fetchMarkdownLive(url));
}

export function fetchHtml(url: string): Promise<string> {
  return cached(url, "html", () => fetchHtmlLive(url));
}

function locationFor(url: string): { country: string; languages: string[] } | null {
  const host = new URL(url).hostname;
  if (host.endsWith(".pl")) return { country: "PL", languages: ["pl"] };
  if (host.endsWith(".cz")) return { country: "CZ", languages: ["cs"] };
  if (host.endsWith(".sk")) return { country: "SK", languages: ["sk"] };
  return null;
}

async function fetchMarkdownLive(url: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const wait = lastFirecrawlCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastFirecrawlCall = Date.now();
    stats.firecrawlCalls++;

    const resp = await fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: false, // parsers expect the whole page and stop at footer markers themselves
        maxAge: 0, // always fetch live: listing pages change daily
        timeout: 90000,
        // gov.pl blocks foreign proxies — fetch each site from its own country.
        ...(locationFor(url) && { location: locationFor(url) }),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (resp.status === 429 || resp.status >= 500) {
      lastError = `Firecrawl ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
      console.warn(`[firecrawl] ${lastError} (attempt ${attempt}/${MAX_ATTEMPTS}) ${url}`);
      await sleep(15000 * attempt);
      continue;
    }
    if (!resp.ok) {
      throw new Error(`Firecrawl ${resp.status} for ${url}: ${(await resp.text()).slice(0, 300)}`);
    }

    const body = await resp.json();
    if (!body.success) throw new Error(`Firecrawl failed for ${url}: ${JSON.stringify(body).slice(0, 300)}`);
    return body.data?.markdown ?? "";
  }
  throw new Error(`Firecrawl gave up on ${url}: ${lastError}`);
}

async function fetchHtmlLive(url: string): Promise<string> {
  stats.plainFetches++;
  const resp = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

export function htmlToText(html: string, maxChars = 10000): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}
