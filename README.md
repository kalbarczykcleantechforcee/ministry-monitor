# Ministry Monitor

Weekly digest of Polish, Czech and Slovak ministry press releases for **CleanTech for CEE / FPT**. Every day it scrapes 17 ministries and public funds, scores each new article with Gemini for relevance to cleantech policy, and every Monday it emails one digest: Polish sources first (with Polish summaries), then Czech and Slovak (titles and summaries translated into English).

Focus areas: district heating · local content · EU Industrial Accelerator Act / NZIA · EU ETS, ETS2 & CBAM · Innovation Fund · EU funds for the transition (MFF, Modernisation Fund, JTF). Secondary topics: renewables, heat pumps, storage, hydrogen, CCS, clean air, science commercialisation, AI in energy.

Moved from Val Town in November 2026 (it merges the former CleanTech for CEE and Visegrad monitors).

## Sources

| | |
|---|---|
| 🇵🇱 | Ministry of Climate and Environment · Ministry of Energy · Ministry of Science · Ministry of Digitalization · Ministry of State Assets · NFOŚiGW |
| 🇨🇿 | MŽP · MPO · MŠMT · SFŽP · MF · DIA |
| 🇸🇰 | MŽP SR · MH SR · MŠVVaM SR · MIRRI SR · Envirofond |

## How it runs

| Workflow | When | What |
|---|---|---|
| `daily.yml` | 07:00 UTC daily | Scrape listings → score new articles → rebuild `docs/index.html` → commit `data/` |
| `weekly-digest.yml` | Monday 08:00 UTC | Email articles scoring ≥ 40 from the last 7 days |

Both can also be started by hand from the Actions tab. `daily.yml` takes an optional list of source keys, e.g. `klimat cz-mpo`.

- **Fetching:** Firecrawl (free plan, 1 credit per page, ~850 credits/month), using a proxy in each site's own country.
- **Scoring:** `gemini-3.8-flash`, one combined prompt, scores 0–100 with a 1–2 sentence summary.
- **Data:** `data/articles.jsonl`, one article per line. Only articles from the last 7 days are inserted and scored.

## Secrets (Settings → Secrets and variables → Actions)

`FIRECRAWL_API_KEY`, `GEMINI_API_KEY`, `DIGEST_EMAILS` (comma-separated recipients), plus the email sender's credentials (being switched from Gmail to Brevo: `BREVO_API_KEY`, `DIGEST_FROM`).

## Local runs

Node ≥ 22.18. Put the secrets in `.env` (gitignored), then:

```sh
npm ci
DRY_RUN=1 DUMP_DIR=debug npm run scrape -- klimat   # test one source, save nothing, cache the page
npm run score
npm run preview                                      # writes docs/index.html
```

For coding agents (and how to change parsers or the prompt without burning credits), see **[AGENTS.md](AGENTS.md)**.
