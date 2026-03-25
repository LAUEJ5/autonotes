const hero = document.getElementById("hero");
const resultsWrap = document.getElementById("resultsWrap");

const searchForm = document.getElementById("searchForm");
const qInput = document.getElementById("q");

const searchFormTop = document.getElementById("searchFormTop");
const qTop = document.getElementById("qTop");

const metaEl = document.getElementById("meta");
const resultsEl = document.getElementById("results");
const articleEl = document.getElementById("article");
const articleTitleEl = document.getElementById("articleTitle");
const articleExternalEl = document.getElementById("articleExternal");
const articleFrameEl = document.getElementById("articleFrame");
const errorEl = document.getElementById("error");

// Notes panel (upstream behavior)
const notesToggleBtn = document.getElementById("notesToggleBtn");
const notesCloseBtn = document.getElementById("notesCloseBtn");
const notesPanel = document.getElementById("notesPanel");
const notesEditor = document.getElementById("notesEditor");
const NOTES_STORAGE_KEY = "investigationNotes.v2";
const selectionSearchBtn = document.getElementById("selectionSearchBtn");
const autoNotesBtn = document.getElementById("autoNotesBtn");
const autoNotesStatus = document.getElementById("autoNotesStatus");
let lastSelectionText = "";

let autoNotes = {
  running: false,
  abortController: null,
  timeoutId: null
};

function setAutoNotesUi({ running, statusText }) {
  if (autoNotesBtn) autoNotesBtn.setAttribute("aria-pressed", String(Boolean(running)));
  if (autoNotesBtn) autoNotesBtn.textContent = running ? "Stop auto notes" : "Auto notes (30s)";
  if (autoNotesStatus) autoNotesStatus.textContent = statusText || "";
}

function stopAutoNotes(reasonText) {
  if (autoNotes.timeoutId) clearTimeout(autoNotes.timeoutId);
  autoNotes.timeoutId = null;

  if (autoNotes.abortController) {
    try {
      autoNotes.abortController.abort();
    } catch {
      // ignore
    }
  }
  autoNotes.abortController = null;
  autoNotes.running = false;
  setAutoNotesUi({ running: false, statusText: reasonText || "" });
}

function appendToNotes(block) {
  if (!notesEditor) return;
  const existing = notesEditor.textContent || "";
  const next = existing ? `${existing}\n\n${block}` : block;
  notesEditor.textContent = next;
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, notesEditor.textContent || "");
  } catch {
    // ignore
  }
}

async function runAutoNotes() {
  const wikiTitle = getWikiTitleFromPath();
  if (!wikiTitle) {
    setAutoNotesUi({ running: false, statusText: "Open a Wikipedia article first." });
    return;
  }

  // Start a 30s run
  stopAutoNotes("");
  autoNotes.running = true;
  autoNotes.abortController = new AbortController();
  setAutoNotesUi({ running: true, statusText: "Summarizing…" });

  autoNotes.timeoutId = setTimeout(() => {
    stopAutoNotes("Timed out.");
  }, 30_000);

  const r = await fetch("/api/auto-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: wikiTitle }),
    signal: autoNotes.abortController.signal
  }).catch((e) => {
    if (e?.name === "AbortError") return null;
    throw e;
  });

  if (!r) return; // aborted

  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json?.ok) {
    stopAutoNotes("");
    setAutoNotesUi({ running: false, statusText: json?.error || "Summarize failed." });
    return;
  }

  const when = new Date().toLocaleString();
  const prettyTitle = String(json.title || wikiTitle).replaceAll("_", " ");
  const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(String(json.title || wikiTitle))}`;
  const summary = String(json.summary || "").trim();

  if (summary) {
    appendToNotes(`[${when}] ${prettyTitle}\n${articleUrl}\n\n${summary}`);
  }

  stopAutoNotes("Done.");
  // Auto-clear status after a moment
  setTimeout(() => {
    if (!autoNotes.running) setAutoNotesUi({ running: false, statusText: "" });
  }, 2000);
}

function setNotesOpen(open) {
  const isOpen = Boolean(open);
  document.body.classList.toggle("notesOpen", isOpen);
  notesToggleBtn?.setAttribute("aria-expanded", String(isOpen));
  notesPanel?.setAttribute("aria-hidden", String(!isOpen));
  if (notesToggleBtn) notesToggleBtn.hidden = isOpen;
  if (isOpen) {
    setTimeout(() => notesEditor?.focus(), 0);
  }
}

function toggleNotes() {
  setNotesOpen(!document.body.classList.contains("notesOpen"));
}

function hideSelectionSearch() {
  if (!selectionSearchBtn) return;
  selectionSearchBtn.hidden = true;
  lastSelectionText = "";
}

function selectionIsInsideNotes() {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return false;
  const anchorNode = sel.anchorNode;
  const focusNode = sel.focusNode;
  if (!notesEditor) return false;
  return (
    (anchorNode && notesEditor.contains(anchorNode)) ||
    (focusNode && notesEditor.contains(focusNode))
  );
}

function showSelectionSearchNearSelection() {
  if (!selectionSearchBtn) return;
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return hideSelectionSearch();
  if (!selectionIsInsideNotes()) return hideSelectionSearch();

  const text = String(sel.toString() || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return hideSelectionSearch();

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return hideSelectionSearch();

  lastSelectionText = text;
  selectionSearchBtn.hidden = false;

  const btnRect = selectionSearchBtn.getBoundingClientRect();
  const margin = 8;
  const top = Math.max(8, rect.top - btnRect.height - margin);
  const left = Math.min(
    window.innerWidth - btnRect.width - 8,
    Math.max(8, rect.left + rect.width / 2 - btnRect.width / 2)
  );

  selectionSearchBtn.style.top = `${top}px`;
  selectionSearchBtn.style.left = `${left}px`;
}

function setMode(mode) {
  const isHome = mode === "home";
  const isResults = mode === "results";
  const isArticle = mode === "article";

  hero.hidden = !isHome;
  resultsWrap.hidden = isHome;

  if (resultsEl) resultsEl.hidden = !isResults;
  if (articleEl) articleEl.hidden = !isArticle;
}

function setError(message, details) {
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = details ? `${message}\n\n${details}` : message;
}

function formatMeta(totalResults, searchTime) {
  const parts = [];
  if (totalResults) parts.push(`About ${totalResults} results`);
  if (typeof searchTime === "number") parts.push(`(${searchTime.toFixed(2)} seconds)`);
  return parts.join(" ");
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResults(items) {
  resultsEl.innerHTML = "";
  if (!items.length) {
    resultsEl.innerHTML = `<div class="result"><div class="snippet">No results.</div></div>`;
    return;
  }

  const html = items
    .map((it) => {
      const title = escapeHtml(it.title || "");
      const link = escapeHtml(it.link || "");
      const displayLink = escapeHtml(it.displayLink || "");
      const snippet = escapeHtml(it.snippet || "");
      const isInternalWiki = link.startsWith("/wiki/");
      const targetAttrs = isInternalWiki ? "" : ` target="_blank" rel="noopener noreferrer"`;
      return `
        <article class="result">
          <div class="displayLink">${displayLink}</div>
          <a class="title" href="${link}"${targetAttrs}>${title}</a>
          <div class="snippet">${snippet}</div>
        </article>
      `;
    })
    .join("");

  resultsEl.innerHTML = html;
}

function getQueryFromUrl() {
  const u = new URL(window.location.href);
  return (u.searchParams.get("q") || "").trim();
}

function setQueryInUrl(q) {
  const u = new URL(window.location.origin + "/");
  if (q) u.searchParams.set("q", q);
  else u.searchParams.delete("q");
  window.history.pushState({}, "", u.toString());
}

function getWikiTitleFromPath() {
  const path = window.location.pathname || "/";
  if (!path.startsWith("/wiki/")) return null;
  const slug = path.slice("/wiki/".length);
  if (!slug) return null;
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function navigateTo(path) {
  window.history.pushState({}, "", path);
  // Some embeds/browsers can lag updating location after pushState; defer routing.
  setTimeout(() => {
    handleRoute();
  }, 0);
}

async function loadWikipediaArticle(title) {
  setError("");
  const pretty = title.replaceAll("_", " ");
  metaEl.textContent = `Wikipedia: ${pretty}`;
  if (articleTitleEl) articleTitleEl.textContent = pretty;

  // Use Wikipedia's own page rendering so assets/layout work (images, CSS, etc.).
  const slug = title.replaceAll(" ", "_");
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`;
  const mobileUrl = `https://en.m.wikipedia.org/wiki/${encodeURIComponent(slug)}`;

  if (articleExternalEl) articleExternalEl.href = wikiUrl;
  if (articleFrameEl) {
    // Some browsers don't reliably load a lazy iframe that becomes visible after SPA navigation.
    // Reset then set ensures a fresh navigation without requiring a manual reload.
    articleFrameEl.src = "about:blank";
    setTimeout(() => {
      articleFrameEl.src = mobileUrl;
    }, 0);
  }
}

async function runSearch(q, { lucky = false } = {}) {
  const query = String(q || "").trim();
  if (!query) return;

  setMode("results");
  setError("");
  metaEl.textContent = "Searching…";
  resultsEl.innerHTML = "";
  if (articleEl) articleEl.innerHTML = "";

  qTop.value = query;
  setQueryInUrl(query);

  const url = new URL("/api/search", window.location.origin);
  url.searchParams.set("q", query);

  const r = await fetch(url.toString());
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    metaEl.textContent = "";
    renderResults([]);
    setError(json?.error || "Search failed", json?.details ? JSON.stringify(json.details, null, 2) : "");
    return;
  }

  metaEl.textContent = formatMeta(json.totalResults, json.searchTime);
  renderResults(json.items || []);

  if (lucky && Array.isArray(json.items) && json.items[0]?.link) {
    window.location.href = json.items[0].link;
  }
}

function onSubmit(e, { lucky = false } = {}) {
  e.preventDefault();
  const q = (e?.target?.elements?.q?.value ?? "").toString();
  runSearch(q, { lucky });
}

searchForm.addEventListener("submit", (e) => onSubmit(e));
searchFormTop.addEventListener("submit", (e) => onSubmit(e));

notesToggleBtn?.addEventListener("click", toggleNotes);
notesCloseBtn?.addEventListener("click", () => setNotesOpen(false));
autoNotesBtn?.addEventListener("click", () => {
  if (autoNotes.running) {
    stopAutoNotes("Stopped.");
    return;
  }
  runAutoNotes();
});
selectionSearchBtn?.addEventListener("click", () => {
  const q = lastSelectionText;
  if (!q) return;
  qInput.value = q;
  qTop.value = q;
  hideSelectionSearch();
  runSearch(q);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("notesOpen")) {
    setNotesOpen(false);
  }
});

document.addEventListener("selectionchange", () => {
  if (!document.body.classList.contains("notesOpen")) return;
  setTimeout(showSelectionSearchNearSelection, 0);
});

notesEditor?.addEventListener("scroll", () => {
  if (!selectionSearchBtn?.hidden) showSelectionSearchNearSelection();
});

window.addEventListener("resize", () => {
  if (!selectionSearchBtn?.hidden) showSelectionSearchNearSelection();
});

// Persist notes locally (very basic autosave)
try {
  const saved = localStorage.getItem(NOTES_STORAGE_KEY);
  if (saved && notesEditor) notesEditor.textContent = saved;
} catch {
  // ignore
}

let saveT;
notesEditor?.addEventListener("input", () => {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, notesEditor.textContent || "");
    } catch {
      // ignore
    }
  }, 250);
});

window.addEventListener("popstate", () => {
  handleRoute();
});

// In-app Wikipedia navigation (keep notes available)
resultsEl?.addEventListener("click", (e) => {
  const a = e.target?.closest?.("a.title");
  const href = a?.getAttribute?.("href") || "";
  if (href.startsWith("/wiki/")) {
    e.preventDefault();
    navigateTo(href);
  }
});

async function handleRoute() {
  const wikiTitle = getWikiTitleFromPath();
  if (wikiTitle) {
    setMode("article");
    await loadWikipediaArticle(wikiTitle);
    return;
  }

  const q = getQueryFromUrl();
  if (q) {
    runSearch(q);
    return;
  }

  setMode("home");
  metaEl.textContent = "";
  if (resultsEl) resultsEl.innerHTML = "";
  if (articleFrameEl) articleFrameEl.src = "about:blank";
  if (articleTitleEl) articleTitleEl.textContent = "";
  setError("");
}

// Initial load
setNotesOpen(false);
setAutoNotesUi({ running: false, statusText: "" });
handleRoute();

