# AGENTS.md

Guidance for coding agents working in this repo. Read this before changing anything.

## What this is

A weekly policy digest for **CleanTech for CEE / FPT**. Every day it scrapes press-release listings from 17 Polish, Czech and Slovak ministries and public funds, scores each new article with Gemini for relevance to cleantech policy, and every Monday emails the relevant ones as one digest (Polish sources first, then Czech/Slovak). It was migrated from two Val Town vals in November 2026 (`jakubkalbarczyk/ministry-monitoring` = CleanTech for CEE, `jakubkalbarczyk/visegrad-ministry-monitor` = Visegrad); Val Town shuts down on 2027-01-10.

## Layout

```
src/sources.ts     The 17 sources (key, label, url, parser kind), grouped by country PL → CZ → SK
src/fetcher.ts     ALL network access: Firecrawl /v2/scrape only (no plain fetch). Rate gap, retries, DUMP_DIR cache
src/parsers.ts     Pure parsers: page text → {title, url, date DD.MM.YYYY, summary}. One per site layout
src/scraper.ts     Maps each source kind → fetch mode + parser; article-text fetching for scoring
src/scorer.ts      Gemini prompt + call (JSON schema response)
src/db.ts          data/articles.jsonl ⇄ in-memory node:sqlite
src/render.ts      Digest HTML (email + docs/index.html preview)
scripts/scrape.ts  Daily step 1: listings → insert new articles (unscored)
scripts/score.ts   Daily step 2: fetch article text → Gemini score + summary
scripts/digest.ts  Weekly email; `--preview` writes docs/index.html
scripts/import-backup.ts, scripts/merge-cleantech.ts   One-off Val Town imports (already run; keep for history)
data/articles.jsonl  The database. Committed by the daily workflow
.github/workflows/daily.yml          07:00 UTC daily: scrape → score → preview → commit data/ + docs/
.github/workflows/weekly-digest.yml  Monday 08:00 UTC: send digest
```

Runtime: **Node ≥ 22.18**, TypeScript run directly via Node's type stripping (no build step, no tsc). Use only erasable TS syntax (no `enum`, no parameter properties, no namespaces) and import local files with the `.ts` extension. `node:sqlite` prints an ExperimentalWarning; that's expected.

## Data model

`data/articles.jsonl`: one JSON object per line, sorted by `id`, so git diffs stay small. Fields: `id, url (unique), title, summary, date (DD.MM.YYYY as published), source (Source.key), scraped_at (unix s), score (0-100 | null = unscored), score_reason, title_en`.

- `score_reason` is **Polish** for PL sources and **English** for CZ/SK. `title_en` is an English title translation for CZ/SK only.
- Full article text is **never stored**; it's fetched at scoring time only.
- Always go through `openDb()` / `saveDb()`. Never hand-edit the JSONL, and never run two writers at once (scrape and score both rewrite the whole file).

## Pipeline rules (deliberate decisions)

- **7-day cutoffs:** `scrape.ts` skips articles published more than 7 days ago (`SCRAPE_MAX_AGE_DAYS`); `score.ts` only scores articles scraped in the last 7 days (`SCORE_MAX_AGE_DAYS`). This stops pages that list a whole year (e.g. MF) from flooding the digest.
- **Digest:** score ≥ 40 (`SCORE_THRESHOLD` in render.ts), `scraped_at` within the last 7 days, PL first then CZ, SK.
- **Model:** `gemini-3.8-flash`, pinned on purpose (an auto-updating alias would shift scores silently). Override with `GEMINI_MODEL`. One combined prompt covers both former monitors' focus areas; edit `SYSTEM_PROMPT` in `src/scorer.ts`.
- **Firecrawl only.** Every request (listings and article text) goes through Firecrawl, by the owner's choice. Don't reintroduce plain `fetch` for pages.
- **Proxy location per TLD** (`locationFor` in fetcher.ts). gov.pl rejects foreign proxies (`ERR_TUNNEL_CONNECTION_FAILED`). Keep `location` set.

## Credit budget (important)

Firecrawl is on the **free plan: 1,000 credits/month**, 1 credit per call. Normal use is ~17 listing calls a day plus 1 per new article (~850/month). Testing burns the same budget, so:

- **Never run a full live scrape just to test.** Test one source: `DRY_RUN=1 DUMP_DIR=debug npm run scrape -- klimat`
- `DUMP_DIR=debug` caches every fetched page in `debug/` (gitignored) and reuses it on later runs (0 credits), so you can re-tune a parser repeatedly offline.
- Use `FIRECRAWL_ATTEMPTS=1` while testing so failures don't retry (each retry costs a credit).
- Gemini is prepaid and cheap (~5 s per call), but don't loop over hundreds of articles without asking.

## Parser notes

Each site has its own markdown layout, and they drift. When a source suddenly parses 0 articles (the scrape step prints a `::warning::`), fetch it once with `DUMP_DIR=debug`, read the cached `.md`, and adjust that one parser. Known quirks:

- Firecrawl escapes dots after numbers: `16\. listopadu 2026`. Date regexes must allow `\\?\.`
- **gov.pl** (6 PL sources): the listing parser handles both "date line / link line" and inline list items. `aktywa` has no listing page, so it uses the homepage "## Aktualności" section (no summaries).
- **MPO:** the index links to the newest `stranka-NNN` page; we fetch that (2 calls).
- **MF:** use `/media/tiskove-zpravy`. `/media/vydali-jsme` is a feed of job ads and price bulletins.
- **MŠMT:** a card grid, `**Title**` → date → summary → `](url)`.
- **SFŽP:** undated links are nav/footer junk and are dropped.
- **minzp.sk:** ~200 articles on one page; fetched as Firecrawl `rawHtml` and parsed as HTML.
- `parseMfsrPage` (MF SR) exists but isn't wired up.

## Secrets

GitHub Actions secrets (never commit them; `.env` is gitignored and holds the same values for local runs):

| Secret | Used by |
|---|---|
| `FIRECRAWL_API_KEY` | scrape, score |
| `GEMINI_API_KEY` | score (scoring is skipped cleanly if missing) |
| `DIGEST_EMAILS` | digest, comma-separated recipients (keep out of the repo) |
| `BREVO_API_KEY`, `DIGEST_FROM` | digest, via the Brevo HTTP API with a verified sender |

⚠️ **In progress (Nov 2026):** `scripts/digest.ts` still sends through Gmail/nodemailer (`GMAIL_USER`, `GMAIL_APP_PASSWORD`). It's being switched to Brevo because Gmail app passwords aren't available on the sender account. Keep the workflow and README in sync when that lands.

The repo is **public**: never print secrets in logs, and don't add `pull_request`/`push` workflow triggers that would run with secrets.

## Commands

```sh
npm ci
DRY_RUN=1 DUMP_DIR=debug npm run scrape -- klimat cz-mpo   # test sources, save nothing
npm run scrape                                            # live, all sources (spends ~17 credits)
npm run score                                             # score unscored articles from the last 7 days
npm run preview                                           # docs/index.html
npm run digest                                            # SENDS EMAIL to all recipients — don't run casually
```

Workflows can be started by hand: `gh workflow run "Daily scrape + score" -f sources="klimat"`.

## Conventions

- Keep parsers pure (text in, articles out) and side-effect free; all I/O lives in fetcher/scraper/scripts.
- One source failing must not fail the run. Log it and continue; only total failure exits non-zero.
- Before adding a source: add it to `src/sources.ts`, write or reuse a parser, dry-run it with `DUMP_DIR=debug`, and check dates parse to `DD.MM.YYYY`.
- Don't send the real digest while testing. Send a test only to the sender address.
