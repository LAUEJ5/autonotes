const path = require("path");
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.disable("x-powered-by");

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
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

function listenWithFallback(preferredPort, maxAttempts = 10) {
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

listenWithFallback(PORT);

