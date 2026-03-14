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

/* =========================================
   Ambient site music (fallback when no Spotify)
   ========================================= */
const AMBIENT_TRACKS = [
  // TODO: replace with your files/paths
  "audio/Wii_U_Menu_Music_-_Mii Maker_(Part 2).mp3",
  "audio/03_-_System_Music_-_First_Time_Setup_(TV).mp3",
   "audio/Transfer_Menu.mp3", 
   "audio/eShop_Menu_(Track 1).mp3",
   "audio/WiiU_Chat_Lobby_(TV).mp3",
   "audio/eShop_Menu_(Track 6).mp3",
   "audio/Registration_Method_(Gamepad).mp3"
];
const AMBIENT_PREF_KEY = "ambient_pref"; // "on" | "off"
const AMBIENT_VOL_KEY  = "ambient_vol";  // "0.0".."1.0"

const ambient = {
  audio: null,
  idx: 0,
  fadeTimer: null,
  ui: null,
  isEnabled: true,     // default: ON (user can toggle)
  isVisible: false,    // button visible only when Spotify is NOT connected
  volume: 0.35,

  ensureUIButton() {
    // try to find existing button; if not, create one next to spotify button
    let btn = document.getElementById('ambient-toggle');
    if (!btn) {
      const sibling = document.getElementById('spotify-connect');
      btn = document.createElement('button');
      btn.id = 'ambient-toggle';
      btn.hidden = true;
      btn.textContent = "🔈 Site Music";
      // place right after the spotify button if we can
      sibling?.parentNode?.insertBefore(btn, sibling.nextSibling);
    }
    return btn;
  },

  init(){
    this.ui = this.ensureUIButton();
    if (!this.ui) return;

    // restore prefs
    const pref = localStorage.getItem(AMBIENT_PREF_KEY);
    if (pref) this.isEnabled = pref === "on";
    const v = parseFloat(localStorage.getItem(AMBIENT_VOL_KEY) || "0.35");
    if (!Number.isNaN(v)) this.volume = Math.min(1, Math.max(0, v));

    // prepare audio element
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.loop = false;
    this.audio.volume = 0;
    this.audio.addEventListener("ended", () => this.next());
    this.pickSource();

    // UI wiring
    this.ui.addEventListener("click", () => {
      if (!this.isEnabled) {
        this.isEnabled = true;
        localStorage.setItem(AMBIENT_PREF_KEY, "on");
        this.playWithGesture();
      } else {
        this.isEnabled = false;
        localStorage.setItem(AMBIENT_PREF_KEY, "off");
        this.fadeOut(220);
      }
      this.updateUI();
    });

    // first-gesture bootstrap (for autoplay policies)
    const oneTimeStart = () => {
      if (this.isVisible && this.isEnabled && this.audio?.paused) {
        this.playWithGesture();
      }
      window.removeEventListener("pointerdown", oneTimeStart, {capture:true});
      window.removeEventListener("keydown", oneTimeStart, {capture:true});
    };
    window.addEventListener("pointerdown", oneTimeStart, {capture:true, once:true});
    window.addEventListener("keydown", oneTimeStart, {capture:true, once:true});

    this.updateUI();
  },

  setVisible(show){
    this.isVisible = !!show;
    if (!this.ui) return;
    this.ui.hidden = !show;
    if (!show) {
      this.fadeOut(200);
    } else {
      this.updateUI();
    }
  },

  updateUI(){
    if (!this.ui) return;
    this.ui.setAttribute("aria-pressed", String(this.isEnabled));
    this.ui.textContent = this.isEnabled ? "🔊 Site Music" : "🔈 Site Music";
  },

  pickSource(){
    if (!AMBIENT_TRACKS.length || !this.audio) return;
    if (this.idx >= AMBIENT_TRACKS.length) this.idx = 0;
    this.audio.src = AMBIENT_TRACKS[this.idx];
  },

  next(){
    this.idx = (this.idx + 1) % AMBIENT_TRACKS.length;
    this.pickSource();
    if (this.isEnabled) this.safePlay();
  },

  async playWithGesture(){
    await this.safePlay();
    this.fadeTo(this.volume, 250);
  },

  async safePlay(){
    try { await this.audio.play(); } catch { /* blocked until next gesture */ }
  },

  fadeTo(target, ms=250){
    if (!this.audio) return;
    clearInterval(this.fadeTimer);
    const start = this.audio.volume;
    const delta = target - start;
    const steps = Math.max(1, Math.round(ms / 16));
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i++;
      const v = start + (delta * (i/steps));
      this.audio.volume = Math.min(1, Math.max(0, v));
      if (i >= steps) clearInterval(this.fadeTimer);
    }, 16);
  },

  fadeOut(ms=200){
    this.fadeTo(0, ms);
    setTimeout(() => { try { this.audio.pause(); } catch {} }, ms + 20);
  }
};

/* ===== Idle / Screensaver handles ===== */
const idleOverlay = el('idle-overlay');
const idleArt     = el('idle-art');
const idleTitle   = el('idle-title');
const idleArtist  = el('idle-artist');

let idleTimer = null;
const IDLE_TIMEOUT_MS = 60000;

function updateIdleOverlayFromTrack(title, artistsCsv, artUrl) {
  if (idleTitle)  idleTitle.textContent  = title || 'Nothing playing';
  if (idleArtist) idleArtist.textContent = artistsCsv || '—';
  if (idleArt && artUrl) idleArt.src = artUrl;
}
function enterIdle() {
  if (document.body.classList.contains('idle')) return;
  if (lastToastData) {
    updateIdleOverlayFromTrack(lastToastData.title, lastToastData.artists, lastToastData.art);
  }
  document.body.classList.add('idle');
  idleOverlay?.classList.add('is-visible');
}
function exitIdle() {
  if (!document.body.classList.contains('idle')) return;
  document.body.classList.remove('idle');
  idleOverlay?.classList.remove('is-visible');
}
function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const iframe = document.getElementById('game-iframe');
    const overGame = iframe && iframe.offsetParent !== null && document.activeElement === iframe;
    if (!overGame) enterIdle();
  }, IDLE_TIMEOUT_MS);
}
function resetIdle() {
  exitIdle();
  scheduleIdle();
}

/* -------------------------------
   Jamie Page motif logic (robust)
-------------------------------- */
const JAMIE_PAGE_TITLES = new Set([
  "dyad","not quite there","rot for clout","i wish that i could fall",
  "cadmium colors","breeze blows","liaison","object of affection","clouddrop",
  "my darling my companion","machine love","birdbrain","shiny chariot",
  "strawberry","manifesto","dance delightful"
]);
const JAMIE_MOTIF =
  "baby do you know what you wanna hear, cause you can hear the word make it oh so clear";

function norm(s){ return (s||"").toLowerCase().trim(); }

function isJamieArtist(artistsArr){
  return (artistsArr || []).some(a => /\bjamie\s+pa(i)?ge\b/i.test(a?.name || ""));
}
function isJamieTrack(spotifyItem){
  const title = norm(spotifyItem?.name);
  return isJamieArtist(spotifyItem?.artists) && JAMIE_PAGE_TITLES.has(title);
}
function setPlayHeading(motifOn){
  const playH2 = document.querySelector('.card__header .card__title');
  if(!playH2) return;
  if (!playH2.dataset.defaultText) playH2.dataset.defaultText = playH2.textContent;
  playH2.textContent = motifOn ? JAMIE_MOTIF : playH2.dataset.defaultText;
  playH2.classList.toggle('motif', !!motifOn);
}
function applyMotifFromNowPlayingItem(item){
  setPlayHeading(!!item && isJamieTrack(item));
}

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

  if (r.status === 204) { setPlayHeading(false); return; }
  if (!r.ok) return;

  const data = await r.json();
  if (!data?.item || !data.is_playing) { setPlayHeading(false); return; }

  applyMotifFromNowPlayingItem(data.item);

  const id = data.item.id;
  const isNewTrack = id !== lastTrackId;

  if (isNewTrack) {
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

  updateIdleOverlayFromTrack(title, artists, art);

  applyMotifFromNowPlayingItem({
    name: title,
    artists: (artists || "").split(", ").map(n => ({ name: n }))
  });

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

  updateIdleOverlayFromTrack(data.title, data.artists, data.art || "");

  titleEl.textContent = data.title;
  subEl.textContent = data.artists;
  imgEl.src = data.art || "";
  updateBackground(data.art);

  applyMotifFromNowPlayingItem({
    name: data.title,
    artists: (data.artists || "").split(", ").map(n => ({ name:n }))
  });

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

setInterval(poll, 1500);

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
const REDIRECT_URI = "https://uiohjo.github.io/uiohjio-s-g-a-m-e-s/callback/";
const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-recently-played",
  "user-top-read",
  "playlist-read-private",
  "playlist-read-collaborative"
].join(" ");

const connectBtn = el("spotify-connect");
connectBtn?.addEventListener("click", async () => {
  // hide ambient immediately (polish)
  ambient.setVisible(false);

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

// === On-load init: if connected & playing, show toast immediately ===
async function initSpotifyOnLoad() {
  const token = await getAccessToken();

  // show/hide ambient based on connection state
  if (!token) {
    ambient.setVisible(true);
    return; // nothing else to do (no Spotify yet)
  } else {
    ambient.setVisible(false);
  }

  const btn = el('spotify-connect');
  if (btn) {
    btn.textContent = 'Spotify Connected';
    btn.disabled = true;
    btn.style.opacity = '0.85';
    btn.style.cursor = 'default';
  }

  const panelBtn = el('sp-panel-open');
  if (panelBtn) panelBtn.style.display = 'block';

  try {
    const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.status === 204 || !r.ok) { setPlayHeading(false); return; }

    const data = await r.json();
    if (data?.item && data.is_playing) {
      applyMotifFromNowPlayingItem(data.item);

      updateIdleOverlayFromTrack(
        data.item.name,
        data.item.artists.map(a => a.name).join(", "),
        data.item.album.images?.[0]?.url || ""
      );

      lastTrackId = data.item.id;

      showToast({
        title: data.item.name,
        artists: data.item.artists.map(a => a.name).join(", "),
        art: data.item.album.images?.[0]?.url || ""
      });
    } else {
      setPlayHeading(false);
    }
  } catch (_) {
    // ignore; polling will catch up
  }
}

/* -------------------------------
   Gold title + (optional) Oliver
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
  }, duration);
}

/* -------------------------------
   DOM Ready
-------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  ambient.init();          // 🌊 init ambient music toggle

  initSpotifyOnLoad();
  const isGold = Math.floor(Math.random() * 50) === 0;
  setGoldState(isGold);

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

  // about:blank launcher (kept but safe)
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

  /* --- Idle mode activity listeners --- */
  const activityEvents = ['pointerdown','mousemove','keydown','wheel','touchstart','scroll'];
  activityEvents.forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }));
  scheduleIdle();
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

/* ===== Favorites ===== */
const FAV_KEY = "fav_games";
function getFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveFavs(set) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
}
function toggleFav(slug) {
  const favs = getFavs();
  favs.has(slug) ? favs.delete(slug) : favs.add(slug);
  saveFavs(favs);
  renderSidebar(currentSearchList());
}
function currentSearchList() {
  const input = el("game-search");
  const q = input?.value.toLowerCase().trim() || "";
  return !q ? GAMES : GAMES.filter(g =>
    g.title.toLowerCase().includes(q) ||
    (g.tags || []).some(t => t.toLowerCase().includes(q))
  );
}

function renderSidebar(list) {
  const ul = el("game-list");
  if (!ul) return;
  ul.innerHTML = "";

  const favs = getFavs();

  const sorted = [...list].sort((a, b) => {
    const af = favs.has(a.slug), bf = favs.has(b.slug);
    if (af && !bf) return -1;
    if (!af && bf) return 1;
    return 0;
  });

  for (const g of sorted) {
    const isFav = favs.has(g.slug);
    const li = document.createElement("li");
    li.role = "option";
    li.dataset.slug = g.slug;
    if (currentGame && currentGame.slug === g.slug) li.setAttribute("aria-selected", "true");

    const nameSpan = document.createElement("span");
    nameSpan.className = "sidebar-game-name";
    nameSpan.textContent = g.title;

    const starBtn = document.createElement("button");
    starBtn.className = "fav-btn" + (isFav ? " fav-btn--on" : "");
    starBtn.setAttribute("aria-label", isFav ? "Unfavorite" : "Favorite");
    starBtn.textContent = isFav ? "\u2605" : "\u2606";
    starBtn.addEventListener("click", e => {
      e.stopPropagation();
      toggleFav(g.slug);
    });

    li.appendChild(nameSpan);
    li.appendChild(starBtn);
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
    if (q === "mejiro mcqueen") {
      input.value = "";
      renderSidebar(currentSearchList());
      triggerMcQueenCurse();
      return;
    }
    renderSidebar(currentSearchList());
  });
}

/* ============================================================
   MEJIRO MCQUEEN CURSE — You searched for this. You did this.
   ============================================================ */
function triggerMcQueenCurse() {
  const overlay = el("mcqueen-overlay");
  const loader  = el("mcqueen-loader");
  const videoWrap = el("mcqueen-video-wrap");
  const video   = el("mcqueen-video");
  if (!overlay || !video) return;

  // Handlers we'll need to remove later
  const killKey     = e => {
    const blocked = ["Escape","F11","F12"];
    const devTools = (e.ctrlKey || e.metaKey) && e.shiftKey && ["I","J","C","U"].includes(e.key.toUpperCase());
    const ctrlU    = (e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "U";
    if (blocked.includes(e.key) || devTools || ctrlU) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  };
  const killContext = e => e.preventDefault();
  const reFullscreen = () => {
    if (!document.fullscreenElement && overlay.style.display !== "none") {
      overlay.requestFullscreen().catch(() => {});
    }
  };

  // Show overlay
  overlay.style.display = "flex";
  loader.style.display  = "flex";
  videoWrap.style.display = "none";

  // Lock everything down
  document.addEventListener("keydown",       killKey,     true);
  document.addEventListener("contextmenu",   killContext, true);
  document.addEventListener("fullscreenchange", reFullscreen);

  // Fake loading screen — fills for ~4 seconds, then boom
  const bar = el("mcqueen-bar");
  const statusText = el("mcqueen-status");
  const fakeSteps = [
    [300,  5,  "Initializing search index..."],
    [700,  20, "Fetching game catalog..."],
    [500,  38, "Resolving query..."],
    [600,  55, "Cross-referencing database..."],
    [400,  72, "Almost there..."],
    [500,  89, "Loading results..."],
    [600,  100,"Done!"],
  ];
  let stepIdx = 0;
  function runStep() {
    if (stepIdx >= fakeSteps.length) {
      // Switch to video
      setTimeout(() => {
        loader.style.display    = "none";
        videoWrap.style.display = "flex";
        overlay.requestFullscreen().catch(() => {});
        // iframe autoplays via Google Drive preview — no .play() needed

        // Clean up after 11:04 (664 seconds)
        setTimeout(() => {
          document.removeEventListener("keydown",          killKey,      true);
          document.removeEventListener("contextmenu",      killContext,  true);
          document.removeEventListener("fullscreenchange", reFullscreen);
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          overlay.style.display = "none";
        }, 664000);
      }, 300);
      return;
    }
    const [delay, pct, msg] = fakeSteps[stepIdx++];
    setTimeout(() => {
      bar.style.width    = pct + "%";
      statusText.textContent = msg;
      runStep();
    }, delay);
  }
  runStep();

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
/* ============================================================
   SPOTIFY PANEL — append this to the bottom of script.js
   Also update your SCOPES constant (around line 436) to:

   const SCOPES = [
     "user-read-currently-playing",
     "user-read-playback-state",
     "user-modify-playback-state",
     "user-read-recently-played",
     "user-top-read",
     "playlist-read-private",
     "playlist-read-collaborative"
   ].join(" ");

   Users who already connected will need to hit "Reconnect Spotify"
   once to grant the new scopes.
   ============================================================ */

/* -------------------------------
   Spotify Panel
-------------------------------- */
const spotifyPanel = {
  isOpen: false,
  loaded: false,

  async open() {
    const panel    = el('sp-panel');
    const backdrop = el('sp-panel-backdrop');
    if (!panel) return;
    panel.classList.add('is-open');
    backdrop?.classList.add('is-visible');
    panel.setAttribute('aria-hidden', 'false');
    this.isOpen = true;
    if (!this.loaded) await this.loadAll();
    else await this.loadNowPlaying(await getAccessToken()); // refresh NP on re-open
  },

  close() {
    const panel    = el('sp-panel');
    const backdrop = el('sp-panel-backdrop');
    panel?.classList.remove('is-open');
    backdrop?.classList.remove('is-visible');
    panel?.setAttribute('aria-hidden', 'true');
    this.isOpen = false;
  },

  async loadAll() {
    this.loaded = true;
    const token = await getAccessToken();
    if (!token) {
      ['sp-now-playing','sp-recent','sp-playlists','sp-top-artists'].forEach(id => {
        const s = el(id); if (s) s.innerHTML = '<p class="sp-empty">Not connected to Spotify.</p>';
      });
      return;
    }
    await Promise.allSettled([
      this.loadNowPlaying(token),
      this.loadRecentlyPlayed(token),
      this.loadPlaylists(token),
      this.loadTopArtists(token),
    ]);
  },

  async loadNowPlaying(token) {
    const section = el('sp-now-playing');
    if (!section || !token) return;
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r.status === 204 || !r.ok) {
        section.innerHTML = '<p class="sp-empty">Nothing playing right now.</p>';
        return;
      }
      const data = await r.json();
      if (!data?.item) { section.innerHTML = '<p class="sp-empty">Nothing playing right now.</p>'; return; }

      const item     = data.item;
      const art      = item.album.images?.[1]?.url || item.album.images?.[0]?.url || '';
      const progress = data.progress_ms || 0;
      const duration = item.duration_ms || 1;
      const pct      = Math.round((progress / duration) * 100);
      const fmt      = ms => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

      section.innerHTML = `
        <div class="sp-now-card">
          <img class="sp-now-art" src="${art}" alt="${escHtml(item.name)}" />
          <div class="sp-now-info">
            <div class="sp-now-title">${escHtml(item.name)}</div>
            <div class="sp-now-artist">${escHtml(item.artists.map(a => a.name).join(', '))}</div>
            <div class="sp-now-album">${escHtml(item.album.name)}</div>
            <div class="sp-progress-bar"><div class="sp-progress-fill" style="width:${pct}%"></div></div>
            <div class="sp-progress-time"><span>${fmt(progress)}</span><span>${fmt(duration)}</span></div>
          </div>
        </div>`;
    } catch {
      section.innerHTML = '<p class="sp-empty">Could not load.</p>';
    }
  },

  async loadRecentlyPlayed(token) {
    const section = el('sp-recent');
    if (!section) return;
    section.innerHTML = Array(4).fill(`<div class="sp-skeleton"><div class="sp-skeleton-art"></div><div class="sp-skeleton-lines"><div class="sp-skeleton-line"></div><div class="sp-skeleton-line sp-skeleton-line--short"></div></div></div>`).join('');
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=8', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { this.handleScopeError(r, section, 'recently played'); return; }
      const data = await r.json();

      // dedupe by track id
      const seen = new Set();
      const tracks = data.items.filter(i => {
        if (seen.has(i.track.id)) return false;
        seen.add(i.track.id); return true;
      });

      section.innerHTML = tracks.map(i => {
        const t   = i.track;
        const art = t.album.images?.[2]?.url || t.album.images?.[0]?.url || '';
        return `<div class="sp-track-row">
          ${art ? `<img class="sp-track-art" src="${art}" alt="" />` : '<div class="sp-track-art sp-art-placeholder"></div>'}
          <div class="sp-track-info">
            <div class="sp-track-name">${escHtml(t.name)}</div>
            <div class="sp-track-sub">${escHtml(t.artists.map(a => a.name).join(', '))}</div>
          </div>
          <button class="sp-play-btn" data-uri="${t.uri}" aria-label="Play ${escHtml(t.name)}">▶</button>
        </div>`;
      }).join('');

      section.querySelectorAll('.sp-play-btn').forEach(btn =>
        btn.addEventListener('click', e => { e.stopPropagation(); this.playUri(btn.dataset.uri); })
      );
    } catch {
      section.innerHTML = '<p class="sp-empty">Could not load.</p>';
    }
  },

  async loadPlaylists(token) {
    const section = el('sp-playlists');
    if (!section) return;
    section.innerHTML = Array(4).fill(`<div class="sp-skeleton"><div class="sp-skeleton-art"></div><div class="sp-skeleton-lines"><div class="sp-skeleton-line"></div><div class="sp-skeleton-line sp-skeleton-line--short"></div></div></div>`).join('');
    try {
      const r = await fetch('https://api.spotify.com/v1/me/playlists?limit=12', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { this.handleScopeError(r, section, 'playlists'); return; }
      const data = await r.json();

      section.innerHTML = data.items.map(p => {
        const art = p.images?.[0]?.url || '';
        return `<div class="sp-track-row">
          ${art ? `<img class="sp-track-art" src="${art}" alt="" />` : '<div class="sp-track-art sp-art-placeholder"></div>'}
          <div class="sp-track-info">
            <div class="sp-track-name">${escHtml(p.name)}</div>
            <div class="sp-track-sub">${p.tracks.total} tracks</div>
          </div>
          <button class="sp-play-btn" data-context="${p.uri}" aria-label="Play ${escHtml(p.name)}">▶</button>
        </div>`;
      }).join('');

      section.querySelectorAll('.sp-play-btn').forEach(btn =>
        btn.addEventListener('click', e => { e.stopPropagation(); this.playUri(null, btn.dataset.context); })
      );
    } catch {
      section.innerHTML = '<p class="sp-empty">Could not load.</p>';
    }
  },

  async loadTopArtists(token) {
    const section = el('sp-top-artists');
    if (!section) return;
    section.innerHTML = Array(4).fill(`<div class="sp-skeleton"><div class="sp-skeleton-art" style="border-radius:50%"></div><div class="sp-skeleton-lines"><div class="sp-skeleton-line"></div><div class="sp-skeleton-line sp-skeleton-line--short"></div></div></div>`).join('');
    try {
      const r = await fetch('https://api.spotify.com/v1/me/top/artists?limit=6&time_range=short_term', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { this.handleScopeError(r, section, 'top artists'); return; }
      const data = await r.json();

      section.innerHTML = data.items.map(a => {
        const art = a.images?.[2]?.url || a.images?.[0]?.url || '';
        return `<div class="sp-track-row sp-track-row--no-btn">
          ${art ? `<img class="sp-track-art sp-track-art--circle" src="${art}" alt="" />` : '<div class="sp-track-art sp-track-art--circle sp-art-placeholder"></div>'}
          <div class="sp-track-info">
            <div class="sp-track-name">${escHtml(a.name)}</div>
            <div class="sp-track-sub">${escHtml(a.genres.slice(0, 2).join(', ') || 'Artist')}</div>
          </div>
        </div>`;
      }).join('');
    } catch {
      section.innerHTML = '<p class="sp-empty">Could not load.</p>';
    }
  },

  async playUri(trackUri, contextUri) {
    const token = await getAccessToken();
    if (!token) return;
    const body = contextUri ? { context_uri: contextUri } : { uris: [trackUri] };
    const r = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 403) alert('Spotify Premium is required to control playback remotely.');
    if (r.status === 404) alert('No active Spotify device found. Open Spotify on any device first.');
  },

  handleScopeError(r, section, label) {
    if (r.status === 401 || r.status === 403) {
      section.innerHTML = `<p class="sp-empty">
        New permissions needed for ${label}.<br/>
        <button class="sp-reauth-btn" id="sp-reauth-${label.replace(/\s/g,'-')}">Reconnect Spotify</button>
      </p>`;
      section.querySelector('.sp-reauth-btn')?.addEventListener('click', () => {
        ['sp_access_token','sp_refresh_token','sp_expires_at'].forEach(k => localStorage.removeItem(k));
        el('spotify-connect')?.click();
      });
    } else {
      section.innerHTML = `<p class="sp-empty">Could not load ${label}.</p>`;
    }
  }
};

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* Wire up panel open/close */
window.addEventListener('DOMContentLoaded', () => {
  el('sp-panel-open')?.addEventListener('click', () => spotifyPanel.open());
  el('sp-panel-close')?.addEventListener('click', () => spotifyPanel.close());
  el('sp-panel-backdrop')?.addEventListener('click', () => spotifyPanel.close());

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && spotifyPanel.isOpen) spotifyPanel.close();
  });
});
