// Two ways to get a page:
//  - fetchMarkdown: Firecrawl /v2/scrape (1 credit per call). Used where sites need a real browser.
//  - fetchHtml:     plain fetch, free. Used wherever a site serves usable HTML.

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
// Free plan has a low per-minute limit; keep a gap between calls.
const MIN_GAP_MS = 7000;
const MAX_ATTEMPTS = 3;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastFirecrawlCall = 0;
export const stats = { firecrawlCalls: 0, plainFetches: 0 };

export async function fetchMarkdown(url: string): Promise<string> {
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
      }),
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

export async function fetchHtml(url: string): Promise<string> {
  stats.plainFetches++;
  const resp = await fetch(url, { redirect: "follow", headers: { "User-Agent": BROWSER_UA } });
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
