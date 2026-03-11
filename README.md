# Basic Chrome-like Search Page

A tiny “Chrome new tab”-style search page that calls a backend `/api/search` endpoint.

This project uses a **search provider API** because building a real web search engine (crawling, indexing, ranking) isn’t something you can reasonably build inside an app like this.

## Variant B: Auto-Capture Evidence Board

Instead of a manual notebook, this variant includes an **evidence board** (right side) where you can capture search result snippets as cards:

- Click **Add to evidence board** on any result to capture **title, snippet, URL, timestamp**
- Cards can be **rearranged**, **grouped**, and **deleted**
- Board state persists in `localStorage`

## Run it

```bash
npm install
cp .env.example .env
npm run dev
```

Then open `http://localhost:3000`.

## Simplest mode: Wikipedia-only (no keys, no subscriptions)

This is the default and requires **no API keys**.

In `.env`:

```dotenv
SEARCH_PROVIDER=wikipedia
```

## Choose a provider

Set `SEARCH_PROVIDER` in `.env`:

- `SEARCH_PROVIDER=wikipedia` (free, simple, Wikipedia-only)
- `SEARCH_PROVIDER=bing` (recommended: works for new projects)
- `SEARCH_PROVIDER=google` (only works if your Google project has access)

## Google Search API (why you’re getting 403)

If you see:

> “This project does not have the access to Custom Search JSON API.”

That’s because Google’s own docs now say the **Custom Search JSON API is not available for new customers** (and it’s scheduled for discontinuation on **Jan 1, 2027**). If your project is “new,” Google will keep returning 403 even if you configured `cx` and an API key correctly.

If you already have access (existing customer), here’s the setup.

## Get the Google Search API (step-by-step)

You need **two things**:

- **`GOOGLE_API_KEY`**: a Google Cloud API key
- **`GOOGLE_CSE_ID`**: a Programmable Search Engine ID (often called `cx`)

### 1) Create a Programmable Search Engine (gets you `cx`)

1. Go to Google Programmable Search Engine.
2. Create a new search engine.
3. When asked what to search:
   - If you want “web-like” results: choose **Search the entire web** (sometimes labeled “Search the web”).
   - If you restrict to certain sites, you’ll only get results from those sites.
4. Copy the **Search engine ID** — that is your **`GOOGLE_CSE_ID`** (`cx`).

### 2) Enable the Custom Search JSON API + create an API key (gets you `key`)

1. Go to Google Cloud Console.
2. Create/select a project.
3. Enable **Custom Search API** (Custom Search JSON API).
4. Create an **API key** (Credentials → API key).
5. Put it into `.env` as **`GOOGLE_API_KEY`**.

#### Important notes

- **Quota/billing**: the Custom Search JSON API has quotas and may require billing depending on your usage and current Google policies.
- **Key security**: treat your API key like a secret; keep it server-side (this app does that).

## What the app can/can’t “build”

### What we can build locally (this repo)

- A good-looking search homepage and results page
- Query handling, pagination UI (if you want it), “I’m Feeling Lucky”
- Local features like search history, recent searches, keyboard shortcuts

### What you *cannot* realistically build yourself (you need external APIs)

- **Web crawling and indexing**: discovering pages, fetching them, handling robots.txt/sitemaps, parsing HTML, deduping
- **Ranking at Google scale**: relevance scoring, link graph, anti-spam, freshness
- **SERP enrichments**: knowledge panels, “People also ask”, entity cards, etc.
- **High-quality spell correction / synonyms / intent understanding** at web scale

So the normal architecture is: your UI + your backend + **a search provider API**.

## Other APIs you may want for “basic search” features

Depending on what you consider “basic”, here are common add-ons:

- **Autocomplete / query suggestions**
  - Options: Bing Autosuggest API, Algolia (if you’re searching your own content), Meilisearch + your own suggestion dictionary
  - Note: scraping Google’s suggestions endpoint is unreliable and can violate terms.

- **Image search**
  - Google Custom Search supports `searchType=image` (still quota-limited)
  - Alternatives: Bing Image Search API

- **News search**
  - Bing News Search API or a dedicated news provider

- **Safe-search / content moderation**
  - Some search APIs provide a `safe` flag
  - For extra moderation, use a content moderation API for thumbnails/snippets

## How the wiring works in this project

- Frontend: `public/index.html`, `public/app.js`
- Backend: `server.js`
  - Calls your configured provider server-to-server (`SEARCH_PROVIDER`)
  - Returns a simplified JSON payload to the frontend

### Backend endpoint

- `GET /api/search?q=YOUR_QUERY`

## Troubleshooting

- If you see: “Server is missing GOOGLE_API_KEY / GOOGLE_CSE_ID”
  - Ensure you have `.env` (not `.env.example`) and it contains both values.

- If Google returns an error JSON
  - The UI will show the API error and details. Common causes are:
    - API not enabled in Cloud Console
    - Wrong `cx` (CSE ID)
    - Quota exceeded / billing not set up

## Bing Web Search API (recommended)

1. Create an Azure account/subscription.
2. In Azure Portal, create a **Bing Search v7** resource (Bing Web Search).
3. Copy one of the “Keys” from the resource.
4. Put it into `.env`:

```dotenv
SEARCH_PROVIDER=bing
BING_API_KEY=your_key_here
```

