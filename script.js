'use strict';

const el = (id) => document.getElementById(id);

const toast    = el("toast");
const titleEl  = el("toast-title");
const subEl    = el("toast-sub");
const imgEl    = el("toast-img");
const controls = el("toast-controls");
const hotspot  = el("toast-hotspot");

const bgA = document.getElementById("bgA");
const bgB = document.getElementById("bgB");

let lastTrackId = null;
let lastToastData = null;
let timer;
let hideAfterHoverTimer = null;
let bgFlip = false;

/* -------------------------------
   Spotify token refresher (PKCE)
-------------------------------- */
async function getAccessToken() {
  const exp = +localStorage.getItem("sp_expires_at") || 0;
  if (Date.now() < exp) return localStorage.getItem("sp_access_token");

  const refresh = localStorage.getItem("sp_refresh_token");
  if (!refresh) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: "f5792dc487ef45d2a16dc2e21dbf427e"
  });

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) return null;

  const tok = await r.json();
  localStorage.setItem("sp_access_token", tok.access_token);
  localStorage.setItem("sp_expires_at", String(Date.now() + (tok.expires_in - 60) * 1000));
  return tok.access_token;
}

/* -------------------------------
   Background helpers
-------------------------------- */
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function setBgLayer(elm, url) {
  const x = rand(20, 80);
  const y = rand(20, 80);
  elm.style.backgroundImage = `url("${url}")`;
  elm.style.backgroundPosition = `${x}% ${y}%`;
}

function updateBackground(artUrl) {
  if (!artUrl || !(bgA && bgB)) return;
  const img = new Image();
  img.onload = () => {
    const next = bgFlip ? bgA : bgB;
    const prev = bgFlip ? bgB : bgA;
    setBgLayer(next, artUrl);
    next.classList.remove("hidden");
    prev.classList.add("hidden");
    bgFlip = !bgFlip;
  };
  img.src = artUrl;
}

/* -------------------------------
   Spotify polling + toast
-------------------------------- */
async function poll() {
  const token = await getAccessToken();
  if (!token) return;

  const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (r.status === 204) return;
  if (!r.ok) return;

  const data = await r.json();
  if (!data?.item || !data.is_playing) return;

  const id = data.item.id;
  const isStart = id !== lastTrackId && (data.progress_ms ?? 0) < 2500;
  if (isStart) {
    lastTrackId = id;
    showToast({
      title: data.item.name,
      artists: data.item.artists.map(a => a.name).join(", "),
      art: data.item.album.images?.[0]?.url || ""
    });
  }
}

function showToast({ title, artists, art }) {
  lastToastData = { title, artists, art };
  titleEl.textContent = title;
  subEl.textContent = artists;
  imgEl.src = art;
  updateBackground(art);

  toast.style.display = "flex";
  toast.style.opacity = 0;
  controls.style.display = "none";
  toast.animate(
    [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 180, fill: "forwards" }
  );
  clearTimeout(timer);
  timer = setTimeout(() => {
    toast
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" })
      .onfinish = () => (toast.style.display = "none");
  }, 5000);
}

function forceShowToast(data) {
  if (!data) return;
  titleEl.textContent = data.title;
  subEl.textContent = data.artists;
  imgEl.src = data.art || "";
  updateBackground(data.art);

  toast.style.display = "flex";
  toast.style.opacity = 0;
  toast.animate(
    [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 150, fill: "forwards" }
  );
  controls.style.display = "flex";
}

/* hover-to-recall behavior */
if (hotspot) {
  hotspot.addEventListener("mouseenter", () => {
    if (lastToastData) forceShowToast(lastToastData);
  });
}
if (toast) {
  toast.addEventListener("mouseenter", () => {
    clearTimeout(hideAfterHoverTimer);
    controls.style.display = "flex";
  });
  toast.addEventListener("mouseleave", () => {
    hideAfterHoverTimer = setTimeout(() => {
      controls.style.display = "none";
      toast.style.display = "none";
    }, 600);
  });
}

setInterval(poll, 2500);

/* -------------------------------
   Spotify playback controls
-------------------------------- */
async function spotifyControl(endpoint, method = "POST", query = "") {
  const token = await getAccessToken();
  if (!token) return false;
  const url = `https://api.spotify.com/v1/me/player/${endpoint}${query}`;
  const r = await fetch(url, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
  });
  return r.ok;
}

async function restartTrack()     { return spotifyControl("seek", "PUT", "?position_ms=0"); }
async function nextTrack()        { return spotifyControl("next", "POST"); }

async function togglePlayPause() {
  const token = await getAccessToken();
  if (!token) return false;
  const stateRes = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!stateRes.ok) return false;
  const data = await stateRes.json();
  return data && data.is_playing
    ? spotifyControl("pause", "PUT")
    : spotifyControl("play", "PUT");
}

el("btn-restart")?.addEventListener("click", restartTrack);
el("btn-playpause")?.addEventListener("click", togglePlayPause);
el("btn-next")?.addEventListener("click", nextTrack);

/* -------------------------------
   PKCE auth (Connect Spotify)
-------------------------------- */
const CLIENT_ID = "f5792dc487ef45d2a16dc2e21dbf427e";
const REDIRECT_URI = "https://uiohjo.github.io/uiohjio-s-Unblocked-games/callback/";
const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state"
].join(" ");

const connectBtn = el("spotify-connect");
connectBtn?.addEventListener("click", async () => {
  const verifier  = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = await pkceChallenge(verifier);
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("sp_redirect_uri", REDIRECT_URI);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);
  location.href = authUrl.toString();
});

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(digest));
}

/* -------------------------------
   Gold title + (optional) Oliver
   (Safe: only runs if element exists)
-------------------------------- */
function setGoldState(isGold) {
  const title  = el('title');
  const rarity = el('rarity');
  if (!title || !rarity) return;
  if (isGold) {
    title.classList.add('title--gold');
    title.textContent = 'GOLDEN Plumet Tournament';
    rarity.style.display = 'block';
  } else {
    title.classList.remove('title--gold');
    title.textContent = 'Plumet Tournament';
    rarity.style.display = 'none';
  }
}

function spinNameOnce(target, finalText) {
  if (!target || target.dataset.spun === 'true') return;

  const pool = ['Olivi~r', 'Oliver', 'Ol1ver', 'Olivia', '0liver', 'O-L-I-V-E-R', 'Revilo', 'O.G.', 'Oll—', 'Olive?', 'Oli..', 'Oliver Oil'];
  const duration = 2500;
  const interval = 70;
  let i = 0;

  target.classList.add('slotting');
  target.dataset.spun = 'true';

  const t = setInterval(() => { target.textContent = pool[i++ % pool.length]; }, interval);

  setTimeout(() => {
    clearInterval(t);
    target.textContent = finalText;
    target.classList.remove('slotting');
    target.classList.add('slot-complete');
    target.setAttribute('aria-label', finalText);
    /* password reveal removed */
  }, duration);
}

/* -------------------------------
   DOM Ready
-------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  // Rare gold title (1-in-50)
  const isGold = Math.floor(Math.random() * 50) === 0;
  setGoldState(isGold);

  // Oliver easter egg (safe if element missing)
  const oliver = el('player-oliver');
  if (oliver) {
    oliver.addEventListener('click', () => spinNameOnce(oliver, 'Ollie G'));
    oliver.setAttribute('tabindex', '0');
    oliver.setAttribute('role', 'button');
    oliver.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        spinNameOnce(oliver, 'Ollie G');
      }
    });
  }

  // about:blank launcher (uses current HTML game when available)
  document.getElementById("open-blank")?.addEventListener("click", () => {
    const newPage = window.open("about:blank", "_blank");
    if (!newPage) return alert("Popup blocked! Allow popups for this site.");
    newPage.document.write(`
      <!DOCTYPE html><html><head><title>Classroom</title>
      <style>html,body{margin:0;padding:0;overflow:hidden;background:black}iframe{width:100vw;height:100vh;border:none}</style>
      </head><body><iframe src="https://binglover.github.io/"></iframe></body></html>
    `);
    newPage.document.close();
  });
});

/* -------------------------------
   Games catalog + player
-------------------------------- */
const GAME_JSON = "games/games.json";
let GAMES = [];
let currentGame = null;

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

async function loadCatalog() {
  try {
    const r = await fetch(GAME_JSON, { cache: "no-store" });
    if (!r.ok) throw new Error("catalog fetch failed");
    GAMES = await r.json();
    renderSidebar(GAMES);
    if (GAMES.length) selectGame(GAMES[0].slug);
  } catch (e) {
    console.warn("Failed to load games.json:", e);
    selectGame("plumet2");
  }
}

function renderSidebar(list) {
  const ul = el("game-list");
  if (!ul) return;
  ul.innerHTML = "";
  for (const g of list) {
    const li = document.createElement("li");
    li.role = "option";
    li.dataset.slug = g.slug;
    li.textContent = g.title;
    if (currentGame && currentGame.slug === g.slug) li.setAttribute("aria-selected", "true");
    li.addEventListener("click", () => selectGame(g.slug));
    ul.appendChild(li);
  }
}

function selectGame(slug) {
  const g = GAMES.find(x => x.slug === slug) || null;
  currentGame = g;
  $all("#game-list li").forEach(li => {
    li.setAttribute("aria-selected", li.dataset.slug === slug ? "true" : "false");
  });
  if (!g) {
    loadSwfOrIframe({ type: "swf", path: "Plumet2.swf", title: "Plumet 2" });
    return;
  }
  loadSwfOrIframe(g);
}

function loadSwfOrIframe(game) {
  const frame  = el("game-frame");
  const iframe = el("game-iframe");
  if (!frame) return;

  if (game.type === "html") {
    if (iframe) {
      frame.style.display = "grid";
      iframe.style.display = "block";
      iframe.src = game.path;
    }
    return;
  }

  if (game.type === "swf") {
    if (window.RufflePlayer && frame) {
      const r = window.RufflePlayer.newest();
      const player = r.createPlayer();
      frame.innerHTML = "";
      frame.appendChild(player);
      player.load(game.path);
      return;
    }
    if (iframe) iframe.src = "about:blank";
  }
}

function wireSearch() {
  const input = el("game-search");
  if (!input) return;
  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    const list = !q ? GAMES : GAMES.filter(g =>
      g.title.toLowerCase().includes(q) ||
      (g.tags || []).some(t => t.toLowerCase().includes(q))
    );
    renderSidebar(list);
  });
}

/* Open-blank -> current HTML game if available */
(function patchOpenBlank() {
  const btn = el("open-blank");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const target = (currentGame && currentGame.type === "html") ? currentGame.path : "https://binglover.github.io/";
    const w = window.open("about:blank", "_blank", "noopener,noreferrer");
    if (!w) return alert("Popup blocked! Allow popups for this site.");
    w.opener = null;
    w.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Classroom</title>
          <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data: blob:; frame-src *; connect-src *; img-src * data: blob:; media-src *;">
          <style>html,body{margin:0;padding:0;background:black;overflow:hidden}iframe{width:100vw;height:100vh;border:none}</style>
        </head>
        <body><iframe src="${target}"></iframe></body>
      </html>
    `);
    w.document.close();
  }, { once: true });
})();

/* Boot catalog */
window.addEventListener("DOMContentLoaded", () => {
  wireSearch();
  loadCatalog();
});
