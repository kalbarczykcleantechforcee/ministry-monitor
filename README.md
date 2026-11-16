# Visegrad Ministry Monitor

Watches press releases from 17 Polish, Czech and Slovak ministries and funds, scores each one with Gemini for relevance to EU climate and industrial policy (ETS/CBAM, Innovation Fund, MFF, NZIA), and emails a weekly digest. Moved from Val Town in November 2026.

## How it runs

| Workflow | When | What |
|---|---|---|
| `daily.yml` | 07:00 UTC daily | Scrape listings → score new articles → rebuild `docs/index.html` → commit `data/` |
| `weekly-digest.yml` | Tue 08:00 UTC | Email articles scored ≥ 40 from the last 7 days |

Both can also be started by hand from the Actions tab. `daily.yml` takes an optional list of source keys, e.g. `klimat cz-mpo`.

- **Data:** `data/articles.jsonl`, one article per line. Each run loads it into an in-memory SQLite DB and writes it back.
- **Fetching:** Firecrawl (free plan, 1 credit per page) for sites that need a browser; plain `fetch` for minzp.sk and all CZ/SK article pages. The scrape log prints the number of Firecrawl calls.
- **Preview:** `docs/index.html` (enable GitHub Pages from `/docs` to get a link).

## Secrets (Settings → Secrets and variables → Actions)

| Secret | Used by |
|---|---|
| `FIRECRAWL_API_KEY` | scrape, score |
| `GEMINI_API_KEY` | score (scoring is skipped if missing) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | digest (Gmail app password, not the account password) |
| `DIGEST_EMAILS` | digest, comma-separated recipients |

## Local runs

Requires Node ≥ 22.18. Put the secrets in `.env` (gitignored), then:

```sh
npm ci
npm run scrape -- klimat          # one source; no args = all
npm run score
npm run preview                   # writes docs/index.html
```
