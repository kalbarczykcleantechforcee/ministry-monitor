// Picks the fetch method + parser for each source kind.
import { fetchArticleMarkdown, fetchHtml, fetchMarkdown } from "./fetcher.ts";
import type { Source } from "./sources.ts";
import {
  type Article,
  cleanGovPlArticle,
  findLatestMpoPage,
  parseCzechPage,
  parseEnvirofondPage,
  parseGovPlHomepage,
  parseGovPlListing,
  parseMfPressPage,
  parseMhsrPage,
  parseMineduPage,
  parseMinzpHtml,
  parseMirriPage,
  parseMsmtPage,
  parseSfzpPage,
} from "./parsers.ts";

export type { Article };

export async function scrapeSource(source: Source): Promise<Article[]> {
  switch (source.kind) {
    case "govpl-listing":
      return parseGovPlListing(await fetchMarkdown(`${source.url}?page=1&size=10`));
    case "govpl-homepage":
      return parseGovPlHomepage(await fetchMarkdown(source.url));
    case "czech":
      return parseCzechPage(await fetchMarkdown(source.url), source.url);
    case "mpo": {
      const index = await fetchMarkdown(source.url);
      const latest = findLatestMpoPage(index, source.url);
      if (!latest) return parseCzechPage(index, source.url);
      console.log(`[${source.key}] Latest page: ${latest}`);
      return parseCzechPage(await fetchMarkdown(latest), latest);
    }
    case "mf":
      return parseMfPressPage(await fetchMarkdown(source.url));
    case "msmt":
      return parseMsmtPage(await fetchMarkdown(source.url));
    case "sfzp":
      return parseSfzpPage(await fetchMarkdown(source.url));
    case "minzp":
      return parseMinzpHtml(await fetchHtml(source.url));
    case "mhsr":
      return parseMhsrPage(await fetchMarkdown(source.url));
    case "minedu":
      return parseMineduPage(await fetchMarkdown(source.url));
    case "mirri":
      return parseMirriPage(await fetchMarkdown(source.url));
    case "envirofond":
      return parseEnvirofondPage(await fetchMarkdown(source.url));
  }
}

// Article text for scoring: Firecrawl main-content markdown, images and footers stripped.
export async function scrapeArticleContent(articleUrl: string): Promise<string> {
  return cleanGovPlArticle(await fetchArticleMarkdown(articleUrl)).slice(0, 10000);
}
