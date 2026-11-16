// Every page is fetched through Firecrawl /v2/scrape (1 credit per call), from a proxy in the
// site's own country (gov.pl blocks foreign proxies). Three modes:
//  - fetchMarkdown:        whole page as markdown (listing pages; parsers stop at footers themselves)
//  - fetchHtml:            whole page as raw HTML (minzp.sk, whose parser reads HTML)
//  - fetchArticleMarkdown: main content only (article text for scoring: no menus or cookie banners)
// With DUMP_DIR set (e.g. DUMP_DIR=debug), every fetched page is saved there and reused on
// later runs, so parsers can be re-tuned offline without spending credits.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
// Free plan has a low per-minute limit; keep a gap between calls.
const MIN_GAP_MS = 7000;
const MAX_ATTEMPTS = Number(process.env.FIRECRAWL_ATTEMPTS || 3);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastFirecrawlCall = 0;
export const stats = { firecrawlCalls: 0 };

type Mode = { format: "markdown" | "rawHtml"; onlyMainContent: boolean; ext: string };
const LISTING_MD: Mode = { format: "markdown", onlyMainContent: false, ext: "md" };
const LISTING_HTML: Mode = { format: "rawHtml", onlyMainContent: false, ext: "html" };
const ARTICLE_MD: Mode = { format: "markdown", onlyMainContent: true, ext: "main.md" };

export const fetchMarkdown = (url: string) => cached(url, LISTING_MD);
export const fetchHtml = (url: string) => cached(url, LISTING_HTML);
export const fetchArticleMarkdown = (url: string) => cached(url, ARTICLE_MD);

async function cached(url: string, mode: Mode): Promise<string> {
  const dir = process.env.DUMP_DIR;
  const path = dir
    ? join(dir, url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.-]+/g, "_").slice(0, 150) + "." + mode.ext)
    : null;
  if (path && existsSync(path)) {
    console.log(`  [cache] ${path}`);
    return readFileSync(path, "utf8");
  }
  const text = await firecrawl(url, mode);
  if (path) {
    mkdirSync(dir!, { recursive: true });
    writeFileSync(path, text);
  }
  return text;
}

function locationFor(url: string): { country: string; languages: string[] } | null {
  const host = new URL(url).hostname;
  if (host.endsWith(".pl")) return { country: "PL", languages: ["pl"] };
  if (host.endsWith(".cz")) return { country: "CZ", languages: ["cs"] };
  if (host.endsWith(".sk")) return { country: "SK", languages: ["sk"] };
  return null;
}

async function firecrawl(url: string, mode: Mode): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  const location = locationFor(url);

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
        formats: [mode.format],
        onlyMainContent: mode.onlyMainContent,
        maxAge: 0, // always fetch live: listing pages change daily
        timeout: 90000,
        ...(location && { location }),
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
    return body.data?.[mode.format] ?? "";
  }
  throw new Error(`Firecrawl gave up on ${url}: ${lastError}`);
}
