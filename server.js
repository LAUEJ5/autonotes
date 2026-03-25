const path = require("path");
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

function jsonError(res, status, error, details) {
  res.status(status).json({ ok: false, error, details: details ?? null });
}

async function fetchWikipediaPlaintext(title) {
  const apiUrl = new URL("https://en.wikipedia.org/w/api.php");
  apiUrl.searchParams.set("action", "query");
  apiUrl.searchParams.set("prop", "extracts");
  apiUrl.searchParams.set("explaintext", "1");
  apiUrl.searchParams.set("redirects", "1");
  apiUrl.searchParams.set("titles", title);
  apiUrl.searchParams.set("format", "json");

  const r = await fetch(apiUrl.toString(), {
    headers: {
      "User-Agent": "basic-chrome-search/0.1 (local dev)"
    }
  });
  const json = await r.json();
  if (!r.ok) {
    return { ok: false, status: r.status, error: "Wikipedia API error", details: json };
  }

  const pages = json?.query?.pages || {};
  const firstKey = Object.keys(pages)[0];
  const page = firstKey ? pages[firstKey] : null;
  const extract = page?.extract ? String(page.extract) : "";
  const normalizedTitle = page?.title ? String(page.title) : title;

  if (!extract.trim()) {
    return {
      ok: false,
      status: 404,
      error: "No article text found",
      details: { title: normalizedTitle }
    };
  }

  return { ok: true, title: normalizedTitle, text: extract };
}

async function summarizeWithOpenAI({ title, text }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error: "Missing OPENAI_API_KEY. Copy .env.example to .env and fill it in."
    };
  }

  const model = String(process.env.OPENAI_MODEL || "").trim() || "gpt-4o-mini";

  // Keep request size bounded.
  const MAX_CHARS = 40_000;
  const clipped = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

  const prompt = [
    "You are an automatic note-taker. Summarize the following Wikipedia article text as investigation notes.",
    "",
    "Requirements:",
    "- Start with 1-2 sentence TL;DR.",
    "- Then 8-14 bullet points of key facts (names, dates, events, definitions).",
    "- Include uncertainties/controversies if present.",
    "- Keep it concise, no fluff.",
    "",
    `Article title: ${title}`,
    "",
    "Article text:",
    clipped
  ].join("\n");

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 500
    })
  });

  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      error: json?.error?.message || "OpenAI API error",
      details: json
    };
  }

  const summary =
    String(json?.output_text || "").trim() ||
    String(
      Array.isArray(json?.output)
        ? json.output
            .flatMap((o) => (Array.isArray(o?.content) ? o.content : []))
            .filter((c) => c && (c.type === "output_text" || typeof c.text === "string"))
            .map((c) => String(c.text || ""))
            .join("")
        : ""
    ).trim();
  if (!summary) {
    return { ok: false, status: 500, error: "OpenAI returned empty summary", details: json };
  }

  return { ok: true, summary };
}

app.post("/api/auto-notes", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) return jsonError(res, 400, "Missing body param: title");

    const wiki = await fetchWikipediaPlaintext(title);
    if (!wiki.ok) return jsonError(res, wiki.status || 500, wiki.error, wiki.details);

    const sum = await summarizeWithOpenAI({ title: wiki.title, text: wiki.text });
    if (!sum.ok) return jsonError(res, sum.status || 500, sum.error, sum.details);

    const preview = wiki.text.slice(0, 200).replace(/\s+/g, " ").trim();
    res.json({
      ok: true,
      title: wiki.title,
      summary: sum.summary,
      source: {
        charsFetched: wiki.text.length,
        charsSentToOpenAI: Math.min(wiki.text.length, 40_000),
        preview
      }
    });
  } catch (e) {
    return jsonError(res, 500, "Unexpected server error", { message: e?.message ? String(e.message) : String(e) });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Missing query param: q" });

    const provider = String(process.env.SEARCH_PROVIDER || "").trim().toLowerCase() || "wikipedia";

    if (provider === "wikipedia" || provider === "wiki") {
      const apiUrl = new URL("https://en.wikipedia.org/w/api.php");
      apiUrl.searchParams.set("action", "query");
      apiUrl.searchParams.set("list", "search");
      apiUrl.searchParams.set("srsearch", q);
      apiUrl.searchParams.set("srlimit", "10");
      apiUrl.searchParams.set("utf8", "1");
      apiUrl.searchParams.set("format", "json");
      apiUrl.searchParams.set("origin", "*");

      const r = await fetch(apiUrl.toString(), {
        headers: {
          // Friendly UA is recommended for public Wikimedia APIs.
          "User-Agent": "basic-chrome-search/0.1 (local dev)"
        }
      });
      const json = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({
          error: "Wikipedia API error",
          details: json
        });
      }

      const results = Array.isArray(json?.query?.search) ? json.query.search : [];
      const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, "");

      return res.json({
        query: q,
        provider: "wikipedia",
        totalResults: json?.query?.searchinfo?.totalhits ? String(json.query.searchinfo.totalhits) : null,
        searchTime: null,
        items: results.map((it) => {
          const title = it?.title || "";
          const slug = encodeURIComponent(title.replaceAll(" ", "_"));
          const link = `/wiki/${slug}`;
          return {
            title,
            link,
            displayLink: "en.wikipedia.org",
            snippet: stripHtml(it?.snippet || "")
          };
        })
      });
    }

    if (provider === "bing") {
      const bingKey = process.env.BING_API_KEY;
      if (!bingKey) {
        return res.status(500).json({
          error: "Missing BING_API_KEY. Copy .env.example to .env and fill it in."
        });
      }

      const url = new URL("https://api.bing.microsoft.com/v7.0/search");
      url.searchParams.set("q", q);
      url.searchParams.set("textDecorations", "false");
      url.searchParams.set("textFormat", "Raw");

      const r = await fetch(url.toString(), {
        headers: { "Ocp-Apim-Subscription-Key": bingKey }
      });
      const json = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({
          error: json?.error?.message || "Bing Search API error",
          details: json
        });
      }

      const items = Array.isArray(json?.webPages?.value) ? json.webPages.value : [];
      return res.json({
        query: q,
        provider: "bing",
        totalResults: json?.webPages?.totalEstimatedMatches
          ? String(json.webPages.totalEstimatedMatches)
          : null,
        searchTime: null,
        items: items.map((it) => ({
          title: it.name || "",
          link: it.url || "",
          displayLink: it.displayUrl || "",
          snippet: it.snippet || ""
        }))
      });
    }

    // Default: Google Custom Search JSON API.
    const apiKey = process.env.GOOGLE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;
    if (!apiKey || !cseId) {
      return res.status(500).json({
        error:
          "Missing GOOGLE_API_KEY / GOOGLE_CSE_ID. If you’re a new Google Custom Search customer in 2026, Google no longer enables API access for new customers—use SEARCH_PROVIDER=bing instead.",
        details: { provider: "google" }
      });
    }

    const url = new URL("https://customsearch.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", cseId);
    url.searchParams.set("q", q);

    // Optional knobs (safe defaults).
    if (req.query.safe) url.searchParams.set("safe", String(req.query.safe));
    if (req.query.start) url.searchParams.set("start", String(req.query.start));

    const r = await fetch(url.toString());
    const json = await r.json();
    if (!r.ok) {
      const message = json?.error?.message || "Google Search API error";
      const forbiddenNoAccess =
        r.status === 403 &&
        typeof message === "string" &&
        message.toLowerCase().includes("does not have the access to custom search json api");

      return res.status(r.status).json({
        error: forbiddenNoAccess
          ? "Google Custom Search JSON API access is blocked for this project (Google docs: not available for new customers; discontinued Jan 1, 2027). Use SEARCH_PROVIDER=bing."
          : message,
        details: json
      });
    }

    const items = Array.isArray(json.items) ? json.items : [];
    return res.json({
      query: q,
      provider: "google",
      totalResults: json?.searchInformation?.formattedTotalResults || null,
      searchTime: json?.searchInformation?.searchTime || null,
      items: items.map((it) => ({
        title: it.title || "",
        link: it.link || "",
        displayLink: it.displayLink || "",
        snippet: it.snippet || ""
      }))
    });
  } catch (e) {
    res.status(500).json({
      error: "Unexpected server error",
      details: { message: e?.message ? String(e.message) : String(e) }
    });
  }
});

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// SPA-ish fallback (so /?q= works when refreshed)
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

function listenWithFallback(preferredPort, maxAttempts = 50) {
  // If PORT=0, let the OS pick an open port.
  if (preferredPort === 0) {
    const server = app.listen(0, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : 0;
      // eslint-disable-next-line no-console
      console.log(`Listening on http://localhost:${actualPort}`);
    });
    return;
  }

  const tryListen = (port, attempt) => {
    const server = app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Listening on http://localhost:${port}`);
    });

    server.on("error", (err) => {
      if (err && err.code === "EADDRINUSE" && attempt < maxAttempts) {
        const nextPort = port + 1;
        // eslint-disable-next-line no-console
        console.warn(`Port ${port} in use, trying ${nextPort}…`);
        server.close(() => tryListen(nextPort, attempt + 1));
        return;
      }

      // eslint-disable-next-line no-console
      console.error("Failed to start server:", err);
      process.exit(1);
    });
  };

  tryListen(preferredPort, 1);
}

listenWithFallback(PORT, 200);

