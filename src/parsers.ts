// Pure parsers: markdown/HTML text in, articles out. Ported unchanged from the Val Town
// version, where they were tuned to Cloudflare Browser Rendering markdown.
// TODO(firecrawl): re-tune each parser against Firecrawl's markdown output.

export interface Article {
  title: string;
  url: string;
  date: string; // DD.MM.YYYY
  summary: string;
}

// Markers that indicate page footer/noise on gov.pl — stop collecting here
export const FOOTER_MARKERS = ["## stopka", "Na skróty", "Dbamy o Twoją prywatność", "Polityka cookies"];

// Czech month names → numeric month (nominative + genitive forms)
const CZ_MONTHS: Record<string, string> = {
  "leden": "01", "ledna": "01", "únor": "02", "února": "02",
  "březen": "03", "března": "03", "duben": "04", "dubna": "04",
  "květen": "05", "května": "05", "červen": "06", "června": "06",
  "červenec": "07", "července": "07", "srpen": "08", "srpna": "08",
  "září": "09", "říjen": "10", "října": "10",
  "listopad": "11", "listopadu": "11", "prosinec": "12", "prosince": "12",
};

// Slovak month names (genitive) → numeric month
const SK_MONTHS: Record<string, string> = {
  "januára": "01", "februára": "02", "marca": "03", "apríla": "04",
  "mája": "05", "júna": "06", "júla": "07", "augusta": "08",
  "septembra": "09", "októbra": "10", "novembra": "11", "decembra": "12",
};

// ---------------------------------------------------------------- Poland (gov.pl)

function normalizeGovPlUrl(rawUrl: string): string {
  // Relative links can come back with the listing path glued on, e.g.
  // "?page=1&size=10/web/klimat/article-slug". Take the last /web/... segment.
  const allMatches = [...rawUrl.matchAll(/(\/web\/[^\s?#]*[^\s?#/])/g)];
  if (allMatches.length > 0) {
    return `https://www.gov.pl${allMatches[allMatches.length - 1][1]}`;
  }
  if (rawUrl.startsWith("http")) return rawUrl;
  return `https://www.gov.pl${rawUrl}`;
}

// gov.pl listing page ("wiadomosci" / "aktualnosci")
export function parseGovPlListing(markdown: string): Article[] {
  const articles: Article[] = [];
  const lines = markdown.split("\n");

  const dateRegex = /^(\d{2}\.\d{2}\.\d{4})$/;
  const linkRegex = /^\[([^\]]+)\]\(([^)]+)\)/;
  // Inline list item: "- ![Alt](img)DD.MM.YYYY [Title](url) Summary"
  const inlineRegex = /^-\s+(?:!\[[^\]]*\]\([^)]*\)\s*)?(\d{2}\.\d{2}\.\d{4})\s+\[([^\]]+)\]\(([^)]+)\)\s*(.*)/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (FOOTER_MARKERS.some((m) => line.startsWith(m))) break;

    const inlineMatch = line.match(inlineRegex);
    if (inlineMatch) {
      articles.push({
        date: inlineMatch[1],
        title: inlineMatch[2].trim(),
        url: normalizeGovPlUrl(inlineMatch[3].trim()),
        summary: inlineMatch[4].trim().slice(0, 500),
      });
      i++;
      continue;
    }

    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      const date = dateMatch[1];
      i++;
      while (i < lines.length && lines[i].trim() === "") i++;

      if (i < lines.length) {
        const linkMatch = lines[i].trim().match(linkRegex);
        if (linkMatch) {
          const title = linkMatch[1].trim();
          const url = normalizeGovPlUrl(linkMatch[2].trim());
          i++;
          while (i < lines.length && lines[i].trim() === "") i++;

          const summaryLines: string[] = [];
          while (i < lines.length) {
            const nextLine = lines[i].trim();
            if (dateRegex.test(nextLine)) break;
            if (FOOTER_MARKERS.some((m) => nextLine.startsWith(m))) break;
            if (nextLine.startsWith("![") || nextLine.startsWith("* ![")) {
              i++;
              continue;
            }
            if (nextLine !== "") summaryLines.push(nextLine);
            i++;
          }

          articles.push({ title, url, date, summary: summaryLines.join(" ").slice(0, 500) });
          continue;
        }
      }
    }
    i++;
  }
  return articles;
}

// gov.pl ministry homepage, "## Aktualności" section (MAP has no standard listing page)
export function parseGovPlHomepage(markdown: string): Article[] {
  const articles: Article[] = [];
  const lines = markdown.split("\n");

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "## Aktualności") {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return articles;

  const dateRegex = /^\s*(\d{2}\.\d{2}\.\d{4})\s*$/;
  const linkRegex = /\[\s*([^\]]+?)\s*\]\(([^)]+)\)/;
  const inlineRegex = /^-\s+(?:!\[[^\]]*\]\([^)]*\)\s*)?(\d{2}\.\d{2}\.\d{4})\s+\[([^\]]+)\]\(([^)]+)\)/;

  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("## ") && trimmed !== "## Aktualności") break;

    const inlineMatch = trimmed.match(inlineRegex);
    if (inlineMatch) {
      articles.push({
        date: inlineMatch[1],
        title: inlineMatch[2].trim(),
        url: normalizeGovPlUrl(inlineMatch[3].trim()),
        summary: "",
      });
      continue;
    }

    const dateMatch = trimmed.match(dateRegex);
    if (dateMatch) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length) {
        const linkMatch = lines[j].match(linkRegex);
        if (linkMatch) {
          articles.push({
            date: dateMatch[1],
            title: linkMatch[1].trim(),
            url: normalizeGovPlUrl(linkMatch[2].trim()),
            summary: "",
          });
          i = j;
        }
      }
    }
  }
  return articles;
}

// ---------------------------------------------------------------- Czech Republic

// MŽP / MPO / MF / DIA: "### [Title](url)" then "DD. M. YYYY" or "DD. monthname YYYY"
export function parseCzechPage(markdown: string, baseUrl?: string): Article[] {
  const articles: Article[] = [];
  const lines = markdown.split("\n");

  const linkRegex = /^###\s*\[(.+?)\]\((.+?)\)/;
  const numDateRegex = /(\d{1,2})\\?\.\s*(\d{1,2})\\?\.\s*(\d{4})/;
  const czDateRegex = /(\d{1,2})\.\s*(\S+)\s+(\d{4})/;

  let baseOrigin = "";
  if (baseUrl) {
    try {
      baseOrigin = new URL(baseUrl).origin;
    } catch { /* ignore */ }
  }

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("## Patička")) break;

    const linkMatch = trimmed.match(linkRegex);
    if (linkMatch) {
      const title = linkMatch[1].trim();
      let url = linkMatch[2].trim();
      if (!url.startsWith("http") && baseOrigin) url = `${baseOrigin}${url}`;
      i++;

      let date = "";
      let summary = "";
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        const numMatch = lines[j].match(numDateRegex);
        if (numMatch) {
          date = `${numMatch[1].padStart(2, "0")}.${numMatch[2].padStart(2, "0")}.${numMatch[3]}`;
          const afterDate = lines[j].replace(numDateRegex, "").replace(/^\s*-\s*/, "").trim();
          if (afterDate) summary = afterDate.slice(0, 500);
          i = j + 1;
          break;
        }
        const czMatch = lines[j].match(czDateRegex);
        if (czMatch) {
          const monthStr = CZ_MONTHS[czMatch[2].toLowerCase()];
          if (monthStr) {
            date = `${czMatch[1].padStart(2, "0")}.${monthStr}.${czMatch[3]}`;
            const afterDate = lines[j].replace(czDateRegex, "").replace(/^\s*-\s*/, "").trim();
            if (afterDate) summary = afterDate.slice(0, 500);
            i = j + 1;
            break;
          }
        }
      }

      articles.push({ title, url, date, summary });
      continue;
    }
    i++;
  }
  return articles;
}

// MPO index page links to its newest "stranka-NNN" page; return that page's URL (or null).
export function findLatestMpoPage(indexMarkdown: string, baseUrl: string): string | null {
  const matches = [...indexMarkdown.matchAll(/stranka-(\d+)/g)];
  if (matches.length === 0) return null;
  const latest = Math.max(...matches.map((m) => parseInt(m[1])));
  return `${baseUrl.replace(/\/+$/, "")}/stranka-${latest}`;
}

// SFŽP: "[Title](https://...)" then "DD.MM.YYYY" then summary
export function parseSfzpPage(markdown: string): Article[] {
  const articles: Article[] = [];
  const lines = markdown.split("\n");

  const linkRegex = /^\[([^\]]+)\]\((https:\/\/[^)]+)\)$/;
  const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;

  let i = 0;
  while (i < lines.length) {
    const linkMatch = lines[i].trim().match(linkRegex);
    if (linkMatch) {
      const title = linkMatch[1].trim();
      const url = linkMatch[2].trim();
      if (!title || url.includes('"')) {
        i++;
        continue;
      }
      i++;

      while (i < lines.length && lines[i].trim() === "") i++;
      let date = "";
      if (i < lines.length) {
        const dateMatch = lines[i].trim().match(dateRegex);
        if (dateMatch) {
          date = `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}`;
          i++;
        }
      }

      while (i < lines.length && lines[i].trim() === "") i++;
      const summaryLines: string[] = [];
      while (i < lines.length) {
        const line = lines[i].trim();
        if (line === "") {
          i++;
          break;
        }
        if (line.startsWith("[")) break;
        summaryLines.push(line);
        i++;
      }

      articles.push({ title, url, date, summary: summaryLines.join(" ").slice(0, 500) });
      continue;
    }
    i++;
  }
  return articles;
}

// MŠMT: "### [Title](url)" ... preview ... "[Celý článek](...) Weekday, DD. month YYYY"
export function parseMsmtPage(markdown: string): Article[] {
  const articles: Article[] = [];
  const lines = markdown.split("\n");

  const linkRegex = /^###\s*\[(.+?)\]\((.+?)\)/;
  const dateRegex = /(\d{1,2})\.\s*(\S+)\s+(\d{4})/;

  let i = 0;
  while (i < lines.length) {
    const linkMatch = lines[i].trim().match(linkRegex);
    if (linkMatch) {
      const title = linkMatch[1].trim();
      const url = linkMatch[2].trim();
      i++;

      const summaryLines: string[] = [];
      let date = "";
      while (i < lines.length) {
        const line = lines[i].trim();
        if (line.match(linkRegex)) break;
        if (line.startsWith("[Celý článek]")) {
          const dateMatch = line.match(dateRegex);
          if (dateMatch) {
            const month = CZ_MONTHS[dateMatch[2].toLowerCase()] || "01";
            date = `${dateMatch[1].padStart(2, "0")}.${month}.${dateMatch[3]}`;
          }
          i++;
          break;
        }
        if (!line.startsWith("![") && line !== "") summaryLines.push(line);
        i++;
      }

      articles.push({ title, url, date, summary: summaryLines.join(" ").slice(0, 500) });
      continue;
    }
    i++;
  }
  return articles;
}

// ---------------------------------------------------------------- Slovakia

// minzp.sk HTML (plain fetch):
// <div class="news_content"><a href="..."><h4>Title</h4></a>...<span class="news_date">DD.MM.YYYY</span>
export function parseMinzpHtml(html: string): Article[] {
  const articles: Article[] = [];
  const itemRegex =
    /<div class="news_content">\s*<a\s+href="([^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*([^<]+?)(?:\s*<[^>]*>)*\s*<\/a>[\s\S]*?<span class="news_date">(\d{2}\.\d{2}\.\d{4})<\/span>/gi;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    let url = match[1].trim();
    const title = match[2].trim();
    if (!url.startsWith("http")) url = `https://www.minzp.sk${url}`;
    if (title) articles.push({ title, url, date: match[3], summary: "" });
  }
  return articles;
}

// MH SR: "DD. MM. YYYY" → "# Title" → summary → "[Čítať viac](url)"
export function parseMhsrPage(markdown: string): Article[] {
  const articles: Article[] = [];
  const lines = markdown.split("\n");

  const dateRegex = /(\d{2})\\?\.\s*(\d{2})\\?\.\s*(\d{4})/;
  const linkRegex = /\[.*?Čítať viac.*?\]\((https?:\/\/[^)]+)\)/;
  const isDateOnly = (s: string) => dateRegex.test(s) && s.replace(dateRegex, "").trim() === "";

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const dateMatch = trimmed.match(dateRegex);
    if (dateMatch && isDateOnly(trimmed)) {
      const date = `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}`;
      i++;
      while (i < lines.length && lines[i].trim() === "") i++;

      let title = "";
      if (i < lines.length && lines[i].trim().startsWith("# ")) {
        title = lines[i].trim().replace(/^#+\s*/, "");
        i++;
      }

      while (i < lines.length && lines[i].trim() === "") i++;
      const summaryLines: string[] = [];
      let url = "";
      while (i < lines.length) {
        const line = lines[i].trim();
        const linkMatch = line.match(linkRegex);
        if (linkMatch) {
          url = linkMatch[1];
          i++;
          break;
        }
        if (isDateOnly(line)) break;
        if (line !== "" && !line.startsWith("![")) summaryLines.push(line);
        i++;
      }

      if (title && url) articles.push({ title, url, date, summary: summaryLines.join(" ").slice(0, 500) });
      continue;
    }
    i++;
  }
  return articles;
}

// MŠVVaM SR: "DD.MM.YYYY \- Category" → "## [Title](url)" → summary
export function parseMineduPage(markdown: string): Article[] {
  const articles: Article[] = [];
  const lines = markdown.split("\n");

  const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})\s*\\?-/;
  const linkRegex = /^##\s*\[(.+?)\]\((.+?)\)/;

  let i = 0;
  while (i < lines.length) {
    const dateMatch = lines[i].trim().match(dateRegex);
    if (dateMatch) {
      const date = `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}`;
      i++;
      while (i < lines.length && lines[i].trim() === "") i++;

      let title = "";
      let url = "";
      if (i < lines.length) {
        const linkMatch = lines[i].trim().match(linkRegex);
        if (linkMatch) {
          title = linkMatch[1].trim();
          url = linkMatch[2].trim();
          i++;
        }
      }

      while (i < lines.length && lines[i].trim() === "") i++;
      const summaryLines: string[] = [];
      while (i < lines.length) {
        const line = lines[i].trim();
        if (line === "" || line.startsWith("![") || line.match(dateRegex)) break;
        summaryLines.push(line);
        i++;
      }

      if (title && url) articles.push({ title, url, date, summary: summaryLines.join(" ").slice(0, 500) });
      continue;
    }
    i++;
  }
  return articles;
}

// MIRRI SR: "DD.M.YYYY [ CATEGORY ](url)" → "[Title](url "title")"
export function parseMirriPage(markdown: string): Article[] {
  const articles: Article[] = [];
  const lines = markdown.split("\n");

  const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/;
  const titleLinkRegex = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)/;

  let i = 0;
  while (i < lines.length) {
    const dateMatch = lines[i].trim().match(dateRegex);
    if (dateMatch) {
      const date = `${dateMatch[1].padStart(2, "0")}.${dateMatch[2].padStart(2, "0")}.${dateMatch[3]}`;
      i++;
      while (i < lines.length && lines[i].trim() === "") i++;

      if (i < lines.length) {
        const linkMatch = lines[i].trim().match(titleLinkRegex);
        if (linkMatch) {
          const title = linkMatch[1].trim();
          const url = linkMatch[2].trim().replace(/"$/, "");
          if (title) articles.push({ title, url, date, summary: "" });
        }
      }
      i++;
      continue;
    }
    i++;
  }
  return articles;
}

// Envirofond: "### [Title](url)" → summary → "[Čítať viac](url)" → "DD. monthname YYYY"
export function parseEnvirofondPage(markdown: string): Article[] {
  const articles: Article[] = [];
  const lines = markdown.split("\n");

  const h3LinkRegex = /^###\s*\[(.+?)\]\((.+?)\)/;
  const skDateRegex = /(\d{1,2})\\?\.\s*(\S+)\s+(\d{4})/;

  let i = 0;
  while (i < lines.length) {
    const linkMatch = lines[i].trim().match(h3LinkRegex);
    if (linkMatch) {
      const title = linkMatch[1].trim();
      const url = linkMatch[2].trim();
      i++;

      const summaryLines: string[] = [];
      while (i < lines.length) {
        const line = lines[i].trim();
        if (line.startsWith("[Čítať viac]") || line.match(h3LinkRegex)) break;
        if (line !== "" && !line.startsWith("[Aktuality]")) summaryLines.push(line);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith("[Čítať viac]")) i++;

      let date = "";
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        const dateMatch = lines[j].match(skDateRegex);
        if (dateMatch) {
          const monthStr = SK_MONTHS[dateMatch[2].toLowerCase()];
          if (monthStr) {
            date = `${dateMatch[1].padStart(2, "0")}.${monthStr}.${dateMatch[3]}`;
            i = j + 1;
            break;
          }
        }
      }

      if (title) articles.push({ title, url, date, summary: summaryLines.join(" ").slice(0, 500) });
      continue;
    }
    i++;
  }
  return articles;
}

// MF SR (mfsr.sk) — NOT wired up (JS-rendered page). Kept from the Val Town version for later.
// Format: "* DD.MM.YYYY[Title](url)"
export function parseMfsrPage(markdown: string): Article[] {
  const articles: Article[] = [];
  const itemRegex = /^\*\s*(\d{2})\.(\d{2})\.(\d{4})\[(.+?)\]\((https?:\/\/[^)]+)\)/;
  for (const line of markdown.split("\n")) {
    const m = line.trim().match(itemRegex);
    if (m) articles.push({ title: m[4].trim(), url: m[5].trim(), date: `${m[1]}.${m[2]}.${m[3]}`, summary: "" });
  }
  return articles;
}

// ---------------------------------------------------------------- article content

export function cleanGovPlArticle(markdown: string): string {
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (FOOTER_MARKERS.some((m) => trimmed.startsWith(m))) break;
    if (trimmed.startsWith("![") || trimmed.startsWith("* ![")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}
