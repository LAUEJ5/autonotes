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

// Variant B: Evidence board (toggleable, like Notes in upstream)
const notesToggleBtn = document.getElementById("notesToggleBtn");
const notesCloseBtn = document.getElementById("notesCloseBtn");
const notesPanel = document.getElementById("notesPanel");
const evidenceListEl = document.getElementById("evidenceList");
const clearBoardBtn = document.getElementById("clearBoardBtn");

const EVIDENCE_STORAGE_KEY = "evidenceBoard.v2";

let lastResults = [];
let evidence = loadEvidence();
let dragCardId = null;

function setNotesOpen(open) {
  const isOpen = Boolean(open);
  document.body.classList.toggle("notesOpen", isOpen);
  notesToggleBtn?.setAttribute("aria-expanded", String(isOpen));
  notesPanel?.setAttribute("aria-hidden", String(!isOpen));
  if (notesToggleBtn) notesToggleBtn.hidden = isOpen;
}

function toggleNotes() {
  setNotesOpen(!document.body.classList.contains("notesOpen"));
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

function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function toEvidenceUrl(link) {
  const href = String(link || "");
  if (href.startsWith("/wiki/")) return `https://en.wikipedia.org${href}`;
  return href;
}

function loadEvidence() {
  const raw = localStorage.getItem(EVIDENCE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvidence() {
  localStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(evidence));
}

function deleteCard(cardId) {
  evidence = evidence.filter((c) => c.id !== cardId);
  saveEvidence();
  renderEvidence();
}

function addEvidenceFromItem(item) {
  const cardId = uid("card");
  const card = {
    id: cardId,
    title: String(item?.title || ""),
    snippet: String(item?.snippet || ""),
    url: toEvidenceUrl(item?.link || ""),
    timestamp: new Date().toISOString()
  };
  evidence.unshift(card);
  saveEvidence();
  renderEvidence();
}

function getCardIdAfterDrop(containerEl, clientY) {
  const cards = [...containerEl.querySelectorAll(".boardCard")].filter((el) => !el.classList.contains("dragging"));
  let closest = { offset: Number.NEGATIVE_INFINITY, el: null };
  for (const el of cards) {
    const box = el.getBoundingClientRect();
    const offset = clientY - (box.top + box.height / 2);
    if (offset < 0 && offset > closest.offset) closest = { offset, el };
  }
  return closest.el ? closest.el.dataset.cardId : null;
}

function moveCard(cardId, beforeCardId) {
  if (!cardId) return;
  const fromIdx = evidence.findIndex((c) => c.id === cardId);
  if (fromIdx < 0) return;
  const [card] = evidence.splice(fromIdx, 1);

  if (!beforeCardId) {
    evidence.push(card);
    return;
  }

  const toIdx = evidence.findIndex((c) => c.id === beforeCardId);
  if (toIdx < 0) evidence.push(card);
  else evidence.splice(toIdx, 0, card);
}

function renderEvidence() {
  if (!evidenceListEl) return;
  evidenceListEl.innerHTML = "";

  for (const card of evidence) {
    const cardEl = document.createElement("article");
    cardEl.className = "boardCard";
    cardEl.draggable = true;
    cardEl.dataset.cardId = card.id;

    const top = document.createElement("div");
    top.className = "boardCardTop";

    const a = document.createElement("a");
    a.className = "boardCardTitle";
    a.href = card.url || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = card.title || "(untitled)";

    const del = document.createElement("button");
    del.className = "boardIconBtn";
    del.type = "button";
    del.textContent = "×";
    del.title = "Delete card";
    del.dataset.action = "delete";
    del.dataset.cardId = card.id;

    top.appendChild(a);
    top.appendChild(del);

    const snip = document.createElement("div");
    snip.className = "boardCardSnippet";
    snip.textContent = card.snippet || "";

    const meta = document.createElement("div");
    meta.className = "boardCardMeta";

    const url = document.createElement("div");
    url.className = "boardCardUrl";
    url.textContent = card.url || "";

    const time = document.createElement("time");
    time.className = "boardCardTime";
    time.setAttribute("datetime", card.timestamp);
    time.textContent = formatTime(card.timestamp);

    meta.appendChild(url);
    meta.appendChild(time);

    cardEl.appendChild(top);
    cardEl.appendChild(snip);
    cardEl.appendChild(meta);

    cardEl.addEventListener("dragstart", (e) => {
      dragCardId = card.id;
      cardEl.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    cardEl.addEventListener("dragend", () => {
      cardEl.classList.remove("dragging");
      dragCardId = null;
      evidenceListEl.classList.remove("dropActive");
    });

    evidenceListEl.appendChild(cardEl);
  }
}

function renderResults(items) {
  lastResults = Array.isArray(items) ? items : [];
  resultsEl.innerHTML = "";
  if (!items.length) {
    resultsEl.innerHTML = `<div class="result"><div class="snippet">No results.</div></div>`;
    return;
  }

  const html = items
    .map((it, idx) => {
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
          <div class="resultActionsRow">
            <button class="btn evidenceAddBtn" type="button" data-idx="${idx}">Add to evidence board</button>
          </div>
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
  handleRoute();
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
clearBoardBtn?.addEventListener("click", () => {
  evidence = [];
  saveEvidence();
  renderEvidence();
});

evidenceListEl?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.("button[data-action='delete']");
  if (!btn) return;
  const cardId = btn.dataset.cardId;
  if (cardId) deleteCard(cardId);
});

evidenceListEl?.addEventListener("dragover", (e) => {
  if (!dragCardId) return;
  e.preventDefault();
  evidenceListEl.classList.add("dropActive");
  e.dataTransfer.dropEffect = "move";
});

evidenceListEl?.addEventListener("dragleave", () => {
  evidenceListEl.classList.remove("dropActive");
});

evidenceListEl?.addEventListener("drop", (e) => {
  if (!dragCardId) return;
  e.preventDefault();
  evidenceListEl.classList.remove("dropActive");
  const beforeCardId = getCardIdAfterDrop(evidenceListEl, e.clientY);
  if (beforeCardId === dragCardId) return;
  moveCard(dragCardId, beforeCardId);
  saveEvidence();
  renderEvidence();
});

window.addEventListener("popstate", () => {
  handleRoute();
});

// In-app Wikipedia navigation (keep notes available)
resultsEl?.addEventListener("click", (e) => {
  const addBtn = e.target?.closest?.("button.evidenceAddBtn");
  if (addBtn) {
    e.preventDefault();
    const idx = Number(addBtn.dataset.idx);
    const item = lastResults[idx];
    if (item) addEvidenceFromItem(item);
    return;
  }

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
renderEvidence();
handleRoute();

