"use strict";

/* ====================== CONFIG ====================== */
const CONFIG = {
  APP_NAME: "Fabdia",
  FULL_NAME: "Fabdia Media",
  // Your published Floot backend. Change this if you ever move it to a custom domain.
  API_BASE: "https://fabsocialmeta.floot.app/_api",
  MAX_VIDEO_SECONDS: 40,
  // Bump this AND version.json together on every release; the Update screen appears when they differ.
  VERSION: "10",
};
// Uploaded photos and videos are served from the backend's own address.
const ORIGIN = new URL(CONFIG.API_BASE).origin;
const VIDEO_TOLERANCE_SECONDS = 0.5; // encoders round lengths a little
const UPLOAD_MAX_BYTES = 95 * 1024 * 1024; // the server accepts up to 100 MB
const CONVERT_MAX_BYTES = 250 * 1024 * 1024; // bigger than this can't be converted on a phone
const FFMPEG_SCRIPT = "https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js";
const FFMPEG_CORE = "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js";
const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "mkv", "avi", "wmv", "flv", "3gp", "3gpp", "3g2", "mpg", "mpeg", "mts", "m2ts", "ts", "ogv", "qt"];

class UserError extends Error {}

/* ====================== helpers ====================== */
const memoryStore = {};
const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return memoryStore[key] ?? null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { memoryStore[key] = value; }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch { delete memoryStore[key]; }
  },
};

// Tiny DOM builder. Text is always inserted as text nodes, so user content can't inject HTML.
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, value);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  friends: '<circle cx="8" cy="8" r="3.2"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.8"/><path d="M13.5 13.2A4.8 4.8 0 0 1 21.5 20"/>',
  bell: '<path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5 12.5V20h14v-7.5"/><path d="M10 20v-4.5h4V20"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  heart: '<path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 21.8l8.8-8.8a5.2 5.2 0 0 0 0-7.4z"/>',
  comment: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  video: '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5a6.5 6.5 0 0 1 3 5.5"/>',
  share: '<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  games: '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="18" cy="13.5" r=".9"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  hangup: '<path d="M2.5 14.6c5.6-5 13.4-5 19 0l-2.3 2.6a1.6 1.6 0 0 1-2 .3l-2.2-1.2a1.6 1.6 0 0 1-.8-1.5l.1-1.2a10 10 0 0 0-4.6 0l.1 1.2a1.6 1.6 0 0 1-.8 1.5l-2.2 1.2a1.6 1.6 0 0 1-2-.3z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
  micoff: '<path d="M2 2l20 20"/><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.8"/><path d="M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v4"/>',
  reply: '<path d="m9 14-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  tick1: '<path d="M4.5 12.5 10 18 20.5 6.5"/>',
  tick2: '<path d="M1.5 12.5 7 18 17 7.5"/><path d="M10 16.5l1.5 1.5L22 7"/>',
};
function icon(name, size = 22) {
  const span = document.createElement("span");
  span.style.display = "inline-flex";
  // static strings defined above, never user input
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span;
}

// Turns plain text into text + tappable links. Only http(s) links are ever made clickable.
function linkify(text) {
  const out = [];
  const re = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  const str = String(text ?? "");
  let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    let raw = m[0];
    let trail = "";
    // punctuation right after a link belongs to the sentence, not the link
    while (/[.,!?;:)\]}'"]$/.test(raw)) {
      if (raw.endsWith(")") && (raw.match(/\(/g) || []).length >= (raw.match(/\)/g) || []).length) break;
      trail = raw.slice(-1) + trail;
      raw = raw.slice(0, -1);
    }
    if (m.index > last) out.push(str.slice(last, m.index));
    const href = raw ? safeUrl(/^https?:\/\//i.test(raw) ? raw : "https://" + raw) : null;
    if (href) {
      out.push(h("a", {
        class: "text-link", href, target: "_blank", rel: "noopener noreferrer nofollow ugc",
        onclick: (e) => e.stopPropagation(),
      }, raw));
    } else {
      out.push(raw);
    }
    if (trail) out.push(trail);
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch { return null; }
}

// Uploaded files come back as "/_cdn/..." paths on the backend's address.
function resolveMedia(url) {
  if (!url) return null;
  if (url.startsWith("/_cdn/")) return ORIGIN + url;
  return safeUrl(url);
}

function timeAgo(input) {
  const then = new Date(input).getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const hr = Math.floor(m / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clockTime(input) {
  return new Date(input).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function avatar(name, src, size = 40, opts = {}) {
  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || "").toUpperCase()).join("") || "?";
  const url = resolveMedia(src);
  const el = h("span", { class: "avatar", style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px` });
  if (url) {
    const img = h("img", { src: url, alt: name || "", loading: "lazy" });
    img.addEventListener("error", () => { img.remove(); el.textContent = initials; });
    el.append(img);
  } else {
    el.textContent = initials;
  }
  if (opts.userId != null) {
    const dot = h("span", { class: "presence-dot", hidden: !presence.isOnline(opts.userId) });
    presence.watch(opts.userId, (online) => { dot.hidden = !online; });
    el.append(dot);
  }
  return el;
}

function toast(message, kind = "info") {
  const el = h("div", { class: `toast ${kind === "error" ? "error" : ""}` }, message);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), 4500);
}

// single tap and double tap on the same element (double tap likes a photo)
function onTap(el, { single, double }) {
  let last = 0;
  let timer = null;
  el.addEventListener("click", (e) => {
    const now = Date.now();
    if (now - last < 300) {
      clearTimeout(timer);
      last = 0;
      double(e);
    } else {
      last = now;
      timer = setTimeout(() => { last = 0; single(e); }, 300);
    }
  });
}

function openLightbox(url) {
  const dialog = h("dialog", { class: "lightbox", "aria-label": "Photo" },
    h("img", { src: url, alt: "Photo" }),
    h("button", { class: "btn icon lightbox-close", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x")));
  dialog.addEventListener("click", (e) => { if (e.target === dialog || e.target.tagName === "IMG") dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

/* ====================== install as an app (PWA) ====================== */
let installEvent = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  updateInstallButtons();
});
window.addEventListener("appinstalled", () => {
  installEvent = null;
  updateInstallButtons();
  toast(`${CONFIG.APP_NAME} is installed. Open it from your home screen.`);
});

function canInstall() { return !isStandalone() && (installEvent !== null || isIOS); }

function updateInstallButtons() {
  document.querySelectorAll(".js-install").forEach((el) => { el.hidden = !canInstall(); });
}

async function promptInstall() {
  if (installEvent) {
    installEvent.prompt();
    try { await installEvent.userChoice; } catch { /* dismissed */ }
    installEvent = null;
    updateInstallButtons();
  } else if (isIOS) {
    const dialog = h("dialog", { class: "sheet", "aria-label": `Install ${CONFIG.APP_NAME}` },
      h("div", { class: "sheet-head" },
        h("h2", { class: "sheet-title" }, `Install ${CONFIG.APP_NAME} on your iPhone`),
        h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20))),
      h("div", { class: "sheet-body" },
        h("ol", { class: "steps" },
          h("li", {}, "Open this page in Safari."),
          h("li", {}, "Tap the Share button ", icon("share", 18), " at the bottom of the screen."),
          h("li", {}, "Scroll down and tap Add to Home Screen."),
          h("li", {}, "Tap Add. The app appears on your home screen.")),
        h("button", { class: "btn primary block", type: "button", onclick: () => dialog.close() }, "Got it")));
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }
}

function installButton(extraClass = "soft sm") {
  return h("button", { class: `btn ${extraClass} js-install`, type: "button", hidden: !canInstall(), onclick: promptInstall }, icon("download", 18), "Install app");
}

/* ====================== API ====================== */
// The host answers the browser's pre-flight check itself, so we only send "simple" requests:
// no custom headers, POST bodies as text/plain wrapped as {"json": ...}, and the login token
// in the URL as ?token=...
const state = { token: store.get("fabdia_token"), user: null, unread: 0, friendRequestCount: 0 };

function setSession(token, user) {
  state.token = token || null;
  state.user = user || null;
  if (token) store.set("fabdia_token", token); else store.del("fabdia_token");
  if (token && user) { realtime.start(); refreshUnread(); refreshFriendRequests(); presence.start(); setTimeout(maybeShowNotifyBanner, 1500); }
  else { realtime.stop(); state.unread = 0; state.friendRequestCount = 0; presence.stop(); }
}

function cleanMessage(message) {
  // the sign-up endpoint can return validation issues as a JSON array
  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed)) return parsed.map((i) => i.message).filter(Boolean).join(", ");
  } catch { /* not JSON */ }
  return message;
}

async function api(path, { method = "GET", query = {}, body, auth = true, quiet = false } = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) params.set(k, String(v));
  const sentToken = auth && state.token;
  if (sentToken) params.set("token", state.token);
  const qs = params.toString();
  const url = `${CONFIG.API_BASE}${path}${qs ? `?${qs}` : ""}`;

  let res;
  try {
    res = await fetch(url, method === "POST"
      ? { method, headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ json: body ?? {} }) }
      : { method });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }

  let payload = null;
  try { payload = JSON.parse(await res.text()).json; } catch { /* handled below */ }

  if (!res.ok) {
    if (res.status === 401 && sentToken) {
      setSession(null, null);
      if (!quiet) toast("Your session expired. Log in again.", "error");
    }
    const message = payload && (payload.error || payload.message);
    throw new Error(cleanMessage(message || `Something went wrong (${res.status}).`));
  }
  if (payload === null) throw new Error("The server sent an unexpected response.");
  return payload;
}

/* ====================== photos ====================== */
const fileExt = (name) => ((name || "").split(".").pop() || "").toLowerCase();
const isVideoFile = (file) => file.type.startsWith("video/") || VIDEO_EXTENSIONS.includes(fileExt(file.name));
const isImageFile = (file) => file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"].includes(fileExt(file.name));

// Shrinks big phone photos before upload (saves data and avoids the size limit).
async function prepareImage(file, { max = 1600, square = false } = {}) {
  if (file.type === "image/gif") return file;
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side;
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const hgt = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = hgt;
  canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, hgt);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
}

async function inspectImage(file, options) {
  return { kind: "image", file: await prepareImage(file, options), seconds: null };
}

/* ====================== videos: any format in, MP4 out ====================== */
function readVideoSeconds(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(url);
      Number.isFinite(d) ? resolve(d) : reject(new Error("unreadable"));
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    video.src = url;
  });
}

// Looks inside an MP4/MOV for its video codec tag without decoding anything.
async function sniffVideoCodec(file) {
  const CHUNK = 1.5 * 1024 * 1024;
  const parts = [file.slice(0, CHUNK)];
  if (file.size > CHUNK * 2) parts.push(file.slice(file.size - CHUNK));
  const find = (bytes, tag) => {
    const [a, b, c, d] = [...tag].map((ch) => ch.charCodeAt(0));
    for (let i = bytes.indexOf(a); i !== -1 && i < bytes.length - 3; i = bytes.indexOf(a, i + 1)) {
      if (bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return true;
    }
    return false;
  };
  let h264 = false;
  for (const part of parts) {
    const bytes = new Uint8Array(await part.arrayBuffer());
    if (["hvc1", "hev1", "av01", "vp09", "dvh1", "dvhe"].some((tag) => find(bytes, tag))) return "other";
    if (["avc1", "avc3"].some((tag) => find(bytes, tag))) h264 = true;
  }
  return h264 ? "h264" : "unknown";
}

async function needsConversion(file) {
  const ext = fileExt(file.name);
  const looksLikeMp4 = (ext === "mp4" || ext === "m4v") && (file.type === "video/mp4" || file.type === "" || file.type === "video/x-m4v");
  if (!looksLikeMp4) return true;
  if (file.size > UPLOAD_MAX_BYTES) return true;
  return (await sniffVideoCodec(file)) === "other"; // HEVC, AV1 and VP9 don't play everywhere
}

let ffmpegPromise = null;
let converting = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new UserError("Couldn't load the video converter. Check your connection and try again."));
    document.head.append(s);
  });
}

async function getFfmpeg(onStatus) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      onStatus("Downloading the video converter. This only happens once.");
      if (!window.FFmpeg) await loadScript(FFMPEG_SCRIPT);
      const ff = window.FFmpeg.createFFmpeg({ corePath: FFMPEG_CORE, log: false });
      try { await ff.load(); } catch { throw new UserError("Couldn't start the video converter on this device."); }
      return ff;
    })().catch((e) => { ffmpegPromise = null; throw e; });
  }
  return ffmpegPromise;
}

function cancelConversion() {
  const pending = ffmpegPromise;
  ffmpegPromise = null;
  converting = false;
  if (pending) pending.then((ff) => { try { ff.exit(); } catch { /* already stopped */ } }).catch(() => {});
}

function parseProbe(text) {
  const dur = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = text.match(/Stream #\d+:\d+[^\n]*Video:\s*([a-z0-9_]+)/i);
  const audio = text.match(/Stream #\d+:\d+[^\n]*Audio:\s*([a-z0-9_]+)/i);
  return {
    seconds: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    videoCodec: video ? video[1].toLowerCase() : null,
    hasAudio: Boolean(audio),
  };
}

const tooLong = (seconds) => new UserError(`Videos can be at most ${CONFIG.MAX_VIDEO_SECONDS} seconds. This one is ${Math.round(seconds)} seconds.`);

// Converts any video the converter understands into an H.264/AAC MP4 that plays on every phone.
async function convertToMp4(file, { onStatus, onProgress }) {
  if (file.size > CONVERT_MAX_BYTES) {
    throw new UserError("That video is too big to convert on a phone (over 250 MB). Trim it or pick a smaller one.");
  }
  if (converting) throw new UserError("Another video is still being converted. Wait for it to finish.");
  converting = true;
  const logs = [];
  let ff = null;
  const safeExt = fileExt(file.name).replace(/[^a-z0-9]/g, "") || "mov";
  const inName = `input.${safeExt}`;
  const outName = "output.mp4";
  try {
    ff = await getFfmpeg(onStatus);
    ff.setLogger(({ message }) => logs.push(message));
    ff.setProgress(({ ratio }) => { if (Number.isFinite(ratio)) onProgress(Math.max(0, Math.min(1, ratio))); });

    onStatus("Reading the video…");
    ff.FS("writeFile", inName, await window.FFmpeg.fetchFile(file));

    // a quick look at the file: length and codec (decodes 0.1 second into nothing)
    await ff.run("-i", inName, "-t", "0.1", "-f", "null", "-");
    const info = parseProbe(logs.join("\n"));
    if (!info.videoCodec) throw new UserError("That file doesn't contain a video this app can read.");
    if (info.seconds !== null && info.seconds > CONFIG.MAX_VIDEO_SECONDS + VIDEO_TOLERANCE_SECONDS) throw tooLong(info.seconds);

    const copyable = info.videoCodec === "h264" && ["mp4", "m4v", "mov", "3gp", "3gpp", "qt"].includes(safeExt);
    const baseArgs = ["-i", inName, "-map", "0:v:0", "-map", "0:a:0?"];
    const tail = ["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", "-f", "mp4", outName];
    const encodeArgs = [...baseArgs,
      "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", ...tail];

    let output = null;
    if (copyable) {
      // already H.264: just re-wrap it as MP4, which takes seconds
      onStatus("Converting to MP4…");
      try {
        await ff.run(...baseArgs, "-c:v", "copy", ...tail);
        output = ff.FS("readFile", outName);
        if (output.length > UPLOAD_MAX_BYTES) output = null;
      } catch { output = null; }
      try { ff.FS("unlink", outName); } catch { /* nothing to remove */ }
    }
    if (!output) {
      onStatus("Converting to MP4. Longer videos take a minute.");
      onProgress(0);
      await ff.run(...encodeArgs);
      output = ff.FS("readFile", outName);
      if (output.length > UPLOAD_MAX_BYTES) throw new UserError("That video is still too big after converting. Pick a shorter one.");
    }

    const baseName = (file.name || "video").replace(/\.[^.]+$/, "") || "video";
    return new File([output], `${baseName}.mp4`, { type: "video/mp4" });
  } catch (e) {
    if (!(e instanceof UserError)) {
      console.error("Video conversion failed:", e, logs.slice(-8).join("\n"));
      cancelConversion(); // start fresh next time
      throw new UserError("Couldn't convert that video. Try a different file, or a shorter or smaller one.");
    }
    throw e;
  } finally {
    converting = false;
    if (ff) {
      for (const name of [inName, outName]) { try { ff.FS("unlink", name); } catch { /* already gone */ } }
    }
  }
}

// Checks a chosen video and returns { file, seconds } where file is always an MP4.
async function prepareVideo(file, hooks) {
  let seconds = null;
  try { seconds = await readVideoSeconds(file); } catch { /* this browser can't read it; the converter will */ }
  if (seconds !== null && seconds > CONFIG.MAX_VIDEO_SECONDS + VIDEO_TOLERANCE_SECONDS) throw tooLong(seconds);

  if (seconds !== null && !(await needsConversion(file))) {
    return { file, seconds: Math.min(CONFIG.MAX_VIDEO_SECONDS, Math.max(0.1, Math.round(seconds * 10) / 10)) };
  }

  const converted = await convertToMp4(file, hooks);
  let finalSeconds;
  try { finalSeconds = await readVideoSeconds(converted); } catch { throw new UserError("The converted video can't be played on this device. Try a different file."); }
  if (finalSeconds > CONFIG.MAX_VIDEO_SECONDS + VIDEO_TOLERANCE_SECONDS) throw tooLong(finalSeconds);
  return { file: converted, seconds: Math.min(CONFIG.MAX_VIDEO_SECONDS, Math.max(0.1, Math.round(finalSeconds * 10) / 10)) };
}

/* ====================== uploads ====================== */
// Uploads straight to storage: ask the backend for a one-time upload link, then send the file to it.
async function uploadFile(kind, file, onProgress) {
  const slot = await api("/media/presign", { method: "POST", body: { kind, contentType: file.type, sizeBytes: file.size } });
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", slot.presignedUrl);
    for (const [name, value] of Object.entries(slot.headers || {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });
  return slot.url;
}

// Photo / video buttons plus a preview (or conversion progress) of what's attached.
function attachmentPicker(onChange, { compact = false } = {}) {
  let current = null;
  let busy = false;
  let ticket = 0;
  const photoInput = h("input", { type: "file", accept: "image/*", hidden: true });
  const videoInput = h("input", { type: "file", accept: `video/*,${VIDEO_EXTENSIONS.map((e) => "." + e).join(",")}`, hidden: true });
  const preview = h("div", { class: "attach-preview", hidden: true });
  const btnClass = compact ? "btn ghost icon" : "btn ghost sm";
  const photoBtn = h("button", { class: btnClass, type: "button", "aria-label": "Add a photo", onclick: () => photoInput.click() }, icon("image"), compact ? null : "Photo");
  const videoBtn = h("button", { class: btnClass, type: "button", "aria-label": `Add a video, up to ${CONFIG.MAX_VIDEO_SECONDS} seconds`, onclick: () => videoInput.click() }, icon("video"), compact ? null : "Video");
  const tools = h("div", { class: "attach-tools" }, photoBtn, videoBtn, photoInput, videoInput);

  function showProgress(text, ratio) {
    const bar = h("div", { class: `progress ${ratio == null ? "busy" : ""}` }, h("span", { style: `width:${Math.round((ratio ?? 0) * 100)}%` }));
    preview.replaceChildren(
      h("div", { class: "convert-box" },
        h("strong", {}, "Getting your video ready"),
        h("span", { class: "muted small" }, text),
        bar),
      h("button", { class: "btn ghost icon sm attach-remove", type: "button", "aria-label": "Cancel", onclick: () => clear() }, icon("x", 18)));
    preview.hidden = false;
  }

  async function choose(input) {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const mine = ++ticket;
    try {
      if (isImageFile(file) && !isVideoFile(file)) {
        set(await inspectImage(file));
      } else if (isVideoFile(file)) {
        busy = true;
        showProgress("Checking the video…", null);
        onChange();
        const result = await prepareVideo(file, {
          onStatus: (text) => { if (mine === ticket) showProgress(text, null); },
          onProgress: (ratio) => { if (mine === ticket) showProgress("Converting to MP4…", ratio); },
        });
        if (mine !== ticket) return; // cancelled while converting
        busy = false;
        set({ kind: "video", file: result.file, seconds: result.seconds });
      } else {
        throw new UserError("Choose a photo or a video.");
      }
    } catch (e) {
      if (mine !== ticket) return;
      busy = false;
      clear(true);
      toast(e.message, "error");
      onChange();
    }
  }
  photoInput.addEventListener("change", () => choose(photoInput));
  videoInput.addEventListener("change", () => choose(videoInput));

  function set(attachment) {
    clear(true);
    current = { ...attachment, previewUrl: URL.createObjectURL(attachment.file) };
    const media = attachment.kind === "image"
      ? h("img", { src: current.previewUrl, alt: "Selected photo" })
      : h("video", { src: current.previewUrl, controls: true, muted: true, playsinline: true, preload: "metadata" });
    preview.replaceChildren(media, h("button", { class: "btn ghost icon sm attach-remove", type: "button", "aria-label": "Remove attachment", onclick: () => clear() }, icon("x", 18)));
    preview.hidden = false;
    onChange();
  }
  function clear(silent) {
    ticket += 1; // abandons any conversion still running
    if (busy) { busy = false; cancelConversion(); }
    if (current) URL.revokeObjectURL(current.previewUrl);
    current = null;
    preview.hidden = true;
    preview.replaceChildren();
    if (!silent) onChange();
  }
  function setDisabled(disabled) {
    photoBtn.disabled = videoBtn.disabled = disabled;
    preview.querySelectorAll("button").forEach((b) => { b.disabled = disabled; });
  }

  return { tools, preview, clear, setDisabled, get value() { return current; }, get busy() { return busy; } };
}

/* ====================== shared UI ====================== */
function skeletons(n) {
  return Array.from({ length: n }, () => h("div", { class: "skeleton" }));
}

function stateBox(message, action) {
  return h("div", { class: "state" }, h("p", {}, message), action || null);
}

function badgeText() { return state.unread > 99 ? "99+" : String(state.unread); }

function navItems() {
  const items = [{ key: "home", href: "#/", icon: "home", label: "Home" }];
  if (state.user) {
    items.push(
      { key: "friends", href: "#/friends", icon: "friends", label: "Friends", friendBadge: true },
      { key: "store", href: "#/store", icon: "store", label: "Store" },
      { key: "games", href: "#/games", icon: "games", label: "Games" },
      { key: "messages", href: "#/messages", icon: "message", label: "Messages", badge: true },
      { key: "profile", href: `#/u/${state.user.id}`, icon: "user", label: "Profile" });
  } else {
    items.push({ key: "login", href: "#/login", icon: "user", label: "Log in" });
  }
  return items;
}

const chrome = { active: "home" };

function navIcon(item) {
  return h("span", { class: "icon-wrap" }, icon(item.icon, 24),
    item.badge ? h("span", { class: "badge msg-badge", hidden: !state.unread }, badgeText()) : null,
    item.friendBadge ? h("span", { class: "badge friend-badge", hidden: !state.friendRequestCount }, state.friendRequestCount > 99 ? "99+" : String(state.friendRequestCount)) : null);
}

function logoLink(withName) {
  return h("a", { class: "logo", href: "#/", "aria-label": `${CONFIG.FULL_NAME} home` },
    h("img", { src: "icons/icon-192.png", alt: "", width: "32", height: "32" }),
    withName ? h("span", {}, CONFIG.APP_NAME) : null);
}

function topbar() {
  return h("header", { class: "topbar" },
    h("div", { class: "topbar-in" },
      logoLink(true),
      h("div", { class: "topbar-actions" },
        installButton("soft sm"),
        state.user ? null : h("a", { class: "btn primary sm", href: "#/login" }, "Log in"))));
}

function tabbar() {
  return h("nav", { class: "tabbar", "aria-label": "Main" },
    navItems().map((item) =>
      h("a", { class: "tab-item", href: item.href, "aria-current": chrome.active === item.key ? "page" : null },
        navIcon(item), h("span", {}, item.label))));
}

function rail() {
  return h("nav", { class: "rail", "aria-label": "Main" },
    h("a", { class: "rail-logo", href: "#/", "aria-label": `${CONFIG.FULL_NAME} home` },
      h("img", { src: "icons/icon-192.png", alt: "", width: "42", height: "42" })),
    navItems().map((item) =>
      h("a", { class: "rail-item", href: item.href, "aria-current": chrome.active === item.key ? "page" : null, "aria-label": item.label },
        navIcon(item), h("span", { class: "rail-label" }, item.label))),
    state.user
      ? h("button", { class: "btn primary rail-post", type: "button", "aria-label": "New post", onclick: openComposer }, icon("plus", 22), h("span", { class: "rail-label" }, "Post"))
      : null,
    h("div", { class: "rail-foot" },
      installButton("soft sm"),
      state.user
        ? [
            h("a", { class: "rail-user", href: `#/u/${state.user.id}`, "aria-label": "Your profile" },
              avatar(state.user.displayName, state.user.avatarUrl, 40),
              h("span", { class: "who" }, h("strong", {}, state.user.displayName))),
            h("button", { class: "btn ghost sm", type: "button", "aria-label": "Log out", onclick: logout }, icon("logout", 18), h("span", { class: "rail-label" }, "Log out")),
          ]
        : null));
}

function aside() {
  return h("aside", { class: "aside" },
    h("div", { class: "aside-card" },
      h("h2", {}, CONFIG.FULL_NAME),
      h("p", {}, "Share photos and videos, follow friends and chat in real time."),
      installButton("primary sm")));
}

function shell(view, { active = "home", bare = false, fab = false } = {}) {
  chrome.active = active;
  return h("div", { class: `shell ${bare ? "bare" : ""}` },
    rail(),
    h("div", { class: "column" },
      topbar(),
      h("main", { class: "view", id: "main" }, view)),
    aside(),
    tabbar(),
    fab && state.user
      ? h("button", { class: "fab", type: "button", "aria-label": "New post", onclick: openComposer }, icon("plus", 28))
      : null);
}

function refreshChrome() {
  const swap = (selector, make) => { const el = document.querySelector(selector); if (el) el.replaceWith(make()); };
  swap(".rail", rail);
  swap(".topbar", topbar);
  swap(".tabbar", tabbar);
  swap(".aside", aside);
  updateInstallButtons();
}

function updateBadge() {
  document.querySelectorAll(".badge.msg-badge").forEach((el) => {
    el.textContent = badgeText();
    el.hidden = !state.unread;
  });
}

async function refreshUnread() {
  if (!state.user) return;
  try {
    const data = await api("/chat/conversations", { quiet: true });
    state.unread = data.conversations.reduce((n, c) => n + c.unread, 0);
    updateBadge();
  } catch { /* the badge just stays as it was */ }
}

function updateFriendBadge() {
  document.querySelectorAll(".badge.friend-badge").forEach((el) => {
    el.textContent = state.friendRequestCount > 99 ? "99+" : String(state.friendRequestCount);
    el.hidden = !state.friendRequestCount;
  });
}

async function refreshFriendRequests() {
  if (!state.user) return;
  try {
    const data = await api("/friends/list", { quiet: true });
    state.friendRequestCount = data.incoming.length;
    updateFriendBadge();
  } catch { /* badge just stays as it was */ }
}

/* ====================== presence (who's online) ====================== */
const presence = {
  status: {},
  watchers: new Map(),
  timer: null,
  watched: new Set(),

  isOnline(userId) {
    return !!this.status[userId];
  },

  watch(userId, cb) {
    if (!this.watchers.has(userId)) this.watchers.set(userId, new Set());
    this.watchers.get(userId).add(cb);
    this.watched.add(userId);
  },

  async poll() {
    if (!state.user || this.watched.size === 0) return;
    try {
      const ids = Array.from(this.watched);
      const data = await api("/presence/status", { query: { userIds: ids.join(",") }, quiet: true });
      for (const id of ids) {
        const online = !!data.status[id];
        if (this.status[id] !== online) {
          this.status[id] = online;
          const cbs = this.watchers.get(Number(id));
          if (cbs) cbs.forEach((cb) => cb(online));
        }
      }
    } catch { /* try again next tick */ }
  },

  async heartbeat() {
    if (!state.user) return;
    try { await api("/presence/heartbeat", { method: "POST", quiet: true }); } catch { /* ignore */ }
  },

  start() {
    if (this.timer) return;
    this.heartbeat();
    this.poll();
    this.timer = setInterval(() => { this.heartbeat(); this.poll(); }, 20000);
  },

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.status = {};
    this.watchers.clear();
    this.watched.clear();
  },
};

async function logout() {
  try { await api("/auth/logout", { method: "POST", quiet: true }); } catch { /* clearing locally anyway */ }
  setSession(null, null);
  if (location.hash === "#/" || location.hash === "") render(); else location.hash = "#/";
}

/* ====================== live chat connection ====================== */
// The active screen registers itself here so incoming messages go to the right place.
const live = { thread: null, list: null, feed: null, games: null, game: null };

function lastPreview(msg) {
  if (msg.deleted || msg.deletedAt) return "🚫 Message deleted";
  if (msg.body) return msg.body;
  return msg.mediaType === "video" ? "Sent a video" : "Sent a photo";
}

function onChatEvent(event) {
  if (!event || !state.user) return;
  const type = event.type;
  if (type === "call") { calls.onSignal(event); return; }
  if (type === "game") {
    const mineEvent = event.by === state.user.id;
    const watching = live.game && live.game.gameId === event.gameId;
    if (watching) live.game.reload();
    if (live.games) live.games.reload();
    if (!mineEvent && !watching) {
      const text = { challenge: "challenged you to a game", accepted: "accepted your challenge", declined: "declined your challenge", cancelled: "cancelled a challenge", resigned: "gave up. You win!", move: "played their move", finished: "finished your game" }[event.event];
      if (text) {
        api("/games/get", { query: { gameId: event.gameId }, quiet: true })
          .then((d) => toast(`${d.game.opponent.displayName} ${text}`))
          .catch(() => toast(`A friend ${text}`));
      }
    }
    return;
  }
  if (type === "typing" || type === "delivered" || type === "read" || type === "deleted") {
    if (live.thread && live.thread.conversationId === event.conversationId) live.thread.onEvent(event);
    if (type === "deleted" || type === "read") { refreshUnread(); if (live.list) live.list.reload(); }
    return;
  }
  if (type !== "message") return;
  const msg = event.message;
  if (live.thread && live.thread.conversationId === msg.conversationId) {
    live.thread.onMessage(msg);
    return;
  }
  if (msg.senderId !== state.user.id) {
    const name = event.from ? event.from.displayName : "New message";
    toast(`${name}: ${lastPreview(msg)}`);
  }
  refreshUnread();
  if (live.list) live.list.reload();
}

const realtime = {
  ws: null, delay: 500, timer: null, ping: null, closed: true, connectedOnce: false,
  start() {
    if (!this.closed || !state.user) return;
    this.closed = false;
    this.open();
  },
  stop() {
    this.closed = true;
    this.connectedOnce = false;
    clearTimeout(this.timer);
    clearInterval(this.ping);
    if (this.ws) { try { this.ws.close(); } catch { /* already closed */ } }
    this.ws = null;
  },
  async open() {
    if (this.closed || !state.user) return;
    let creds;
    try {
      creds = await api("/_realtime/token", { method: "POST", quiet: true });
    } catch { this.retry(); return; }
    if (this.closed) return;
    const sep = creds.wssEndpoint.includes("?") ? "&" : "?";
    const ws = new WebSocket(`${creds.wssEndpoint}${sep}token=${encodeURIComponent(creds.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.delay = 500;
      ws.send(JSON.stringify({ action: "subscribe", channel: `user:${state.user.id}` }));
      clearInterval(this.ping);
      this.ping = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ action: "ping" })); }, 8 * 60 * 1000);
      if (this.connectedOnce) {
        // we may have missed messages while offline
        refreshUnread();
        if (live.thread) live.thread.resync();
        if (live.list) live.list.reload();
        if (live.game) live.game.reload();
        if (live.games) live.games.reload();
      }
      this.connectedOnce = true;
    };
    ws.onmessage = (ev) => {
      let frame;
      try { frame = JSON.parse(ev.data); } catch { return; }
      if (frame && frame.data) onChatEvent(frame.data);
    };
    ws.onclose = () => { clearInterval(this.ping); if (!this.closed) this.retry(); };
    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
  },
  retry() {
    if (this.closed) return;
    const wait = Math.min(15000, this.delay) + Math.random() * 300;
    this.delay = Math.min(15000, this.delay * 2);
    this.timer = setTimeout(() => this.open(), wait);
  },
};
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || realtime.closed) return;
  if (!realtime.ws || realtime.ws.readyState > 1) { clearTimeout(realtime.timer); realtime.delay = 500; realtime.open(); }
});
window.addEventListener("online", () => {
  toast("You're back online.");
  if (!realtime.closed) { clearTimeout(realtime.timer); realtime.delay = 500; realtime.open(); }
});
window.addEventListener("offline", () => toast("You're offline. Some things won't load.", "error"));

/* ====================== posts ====================== */
// videos play (muted) while on screen and pause when scrolled away
const autoplayAllowed = () => !(navigator.connection && navigator.connection.saveData) && !matchMedia("(prefers-reduced-motion: reduce)").matches;
const videoObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          if (autoplayAllowed()) video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    }, { threshold: [0, 0.6] })
  : null;

function commentNode(c) {
  return h("div", { class: "comment" },
    avatar(c.author.displayName, c.author.avatarUrl, 32),
    h("div", { class: "comment-body" },
      h("div", { class: "comment-meta" },
        h("a", { href: `#/u/${c.author.id}` }, c.author.displayName),
        h("span", { class: "muted small" }, timeAgo(c.createdAt))),
      h("p", {}, linkify(c.content))));
}

// "Liked by" list: the author of a post (and the admin) can see who liked it
function likedWhen(date) {
  const t = timeAgo(date);
  if (t === "now") return "just now";
  return /^\d+[mhd]$/.test(t) ? `${t} ago` : `on ${t}`;
}

function openLikers(post) {
  const list = h("div", { class: "likers" }, ...skeletons(1));
  const more = h("button", { class: "btn outline sm", type: "button", hidden: true }, "Load more");
  const title = h("h2", { class: "sheet-title" }, "Liked by");
  const dialog = h("dialog", { class: "sheet", "aria-label": "People who liked this post" },
    h("div", { class: "sheet-head" },
      h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20)),
      title,
      h("span", { style: "width:36px" })),
    h("div", { class: "sheet-body" }, list, h("div", { class: "feed-footer" }, more)));
  let offset = 0;

  async function load(first) {
    more.disabled = true;
    try {
      const data = await api("/posts/likers", { query: { postId: post.id, offset, limit: 30 } });
      if (first) list.replaceChildren();
      title.textContent = `Liked by ${data.total}`;
      if (first && !data.likers.length) list.append(h("p", { class: "muted" }, "No likes yet."));
      data.likers.forEach((l) => list.append(
        h("a", { class: "liker", href: `#/u/${l.id}` },
          avatar(l.displayName, l.avatarUrl, 46),
          h("span", { class: "liker-who" },
            h("strong", {}, l.displayName),
            h("span", { class: "muted small" }, `Liked ${likedWhen(l.likedAt)}`)))));
      if (data.nextOffset != null) offset = data.nextOffset;
      more.hidden = data.nextOffset == null;
    } catch (e) {
      if (first) list.replaceChildren(h("p", { class: "muted" }, e.message)); else toast(e.message, "error");
    } finally {
      more.disabled = false;
    }
  }
  more.addEventListener("click", () => load(false));
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  load(true);
}

function postCard(initial, { onDeleted } = {}) {
  const post = { ...initial };
  let commentsLoaded = false;

  const likeCount = h("span");
  const commentCount = h("span");
  const likeBtn = h("button", { class: "act like", type: "button", onclick: toggleLike }, icon("heart"), likeCount);
  const commentBtn = h("button", { class: "act", type: "button", "aria-expanded": "false", "aria-label": "Comments", onclick: toggleComments }, icon("comment"), commentCount);
  const commentsBox = h("div", { class: "comments", hidden: true });
  const card = h("article", { class: "post" });
  const canSeeLikers = Boolean(state.user) && (state.user.id === post.author.id || state.user.role === "admin");
  const likersBtn = h("button", { class: "act", type: "button", "aria-label": "See who liked this post", onclick: () => openLikers(post) }, icon("users"), h("span", {}, "Who liked"));

  function sync() {
    likersBtn.hidden = !(canSeeLikers && post.likeCount > 0);
    likeBtn.classList.toggle("on", post.likedByMe);
    likeBtn.setAttribute("aria-pressed", String(post.likedByMe));
    likeBtn.setAttribute("aria-label", post.likedByMe ? "Unlike" : "Like");
    likeCount.textContent = post.likeCount;
    commentCount.textContent = post.commentCount;
  }

  async function setLiked(next) {
    if (!state.user) { location.hash = "#/login"; return; }
    if (post.likedByMe === next) return;
    const before = { likedByMe: post.likedByMe, likeCount: post.likeCount };
    post.likedByMe = next;
    post.likeCount = Math.max(0, post.likeCount + (next ? 1 : -1));
    sync();
    if (next) { likeBtn.classList.remove("pop"); void likeBtn.offsetWidth; likeBtn.classList.add("pop"); }
    try {
      const r = await api("/posts/like", { method: "POST", body: { postId: post.id, liked: next } });
      post.likeCount = r.likeCount;
      post.likedByMe = r.likedByMe;
    } catch (e) {
      Object.assign(post, before);
      toast(e.message, "error");
    }
    sync();
  }
  function toggleLike() { return setLiked(!post.likedByMe); }

  async function toggleComments() {
    const open = commentsBox.hidden;
    commentsBox.hidden = !open;
    commentBtn.classList.toggle("open", open);
    commentBtn.setAttribute("aria-expanded", String(open));
    if (!open || commentsLoaded) return;
    commentsBox.replaceChildren(h("p", { class: "muted small" }, "Loading comments…"));
    try {
      const data = await api("/comments/list", { query: { postId: post.id, limit: 100 } });
      commentsLoaded = true;
      drawComments(data.comments);
    } catch (e) {
      commentsBox.replaceChildren(h("p", { class: "muted small" }, e.message));
      commentsLoaded = false;
    }
  }

  function drawComments(comments) {
    const list = h("div", { class: "stack", style: "gap:10px" }, comments.map(commentNode));
    if (!comments.length) list.append(h("p", { class: "muted small" }, "No comments yet. Start the conversation."));
    commentsBox.replaceChildren(list);

    if (!state.user) {
      commentsBox.append(h("p", { class: "small" }, h("a", { href: "#/login", class: "linkish" }, "Log in"), " to comment."));
      return;
    }
    const input = h("input", { type: "text", placeholder: "Write a comment…", maxlength: "1000", "aria-label": "Write a comment", autocomplete: "off" });
    const send = h("button", { class: "btn primary sm", type: "submit", disabled: true }, "Reply");
    input.addEventListener("input", () => { send.disabled = !input.value.trim(); });
    const form = h("form", {
      class: "reply",
      onsubmit: async (e) => {
        e.preventDefault();
        const content = input.value.trim();
        if (!content) return;
        send.disabled = true;
        try {
          const r = await api("/comments/create", { method: "POST", body: { postId: post.id, content } });
          if (list.querySelector("p.muted")) list.replaceChildren();
          list.append(commentNode(r.comment));
          input.value = "";
          post.commentCount += 1;
          sync();
        } catch (err) {
          toast(err.message, "error");
          send.disabled = false;
        }
      },
    }, input, send);
    commentsBox.append(form);
  }

  // delete asks twice so a stray tap can't remove a post
  let deleteTimer = null;
  const deleteBtn = h("button", {
    class: "btn ghost icon sm", type: "button", "aria-label": "Delete post",
    onclick: async () => {
      if (deleteBtn.dataset.confirm !== "1") {
        deleteBtn.dataset.confirm = "1";
        deleteBtn.className = "btn danger sm";
        deleteBtn.replaceChildren("Delete?");
        deleteTimer = setTimeout(resetDelete, 4000);
        return;
      }
      clearTimeout(deleteTimer);
      deleteBtn.disabled = true;
      try {
        await api("/posts/delete", { method: "POST", body: { postId: post.id } });
        card.remove();
        if (onDeleted) onDeleted();
      } catch (e) {
        toast(e.message, "error");
        deleteBtn.disabled = false;
        resetDelete();
      }
    },
  }, icon("trash", 18));
  function resetDelete() {
    deleteBtn.dataset.confirm = "0";
    deleteBtn.className = "btn ghost icon sm";
    deleteBtn.replaceChildren(icon("trash", 18));
  }

  const canDelete = state.user && (state.user.id === post.author.id || state.user.role === "admin");
  const imageUrl = resolveMedia(post.imageUrl);
  const videoUrl = resolveMedia(post.videoUrl);

  let media = null;
  if (imageUrl) {
    const img = h("img", { class: "post-img", src: imageUrl, alt: "Photo in post", loading: "lazy", decoding: "async" });
    media = h("div", { class: "media" }, img);
    onTap(media, {
      single: () => openLightbox(imageUrl),
      double: () => {
        const burst = h("span", { class: "burst", "aria-hidden": "true" }, icon("heart", 96));
        media.append(burst);
        setTimeout(() => burst.remove(), 700);
        setLiked(true);
      },
    });
  } else if (videoUrl) {
    // "#t=0.1" makes iPhones show the first frame instead of a black box
    const video = h("video", { class: "post-video", src: `${videoUrl}#t=0.1`, controls: true, loop: true, muted: true, playsinline: true, preload: "metadata" });
    video.muted = true;
    media = h("div", { class: "media is-video" }, video);
    if (videoObserver) videoObserver.observe(video);
  }

  card.append(...[
    h("div", { class: "post-head" },
      h("a", { href: `#/u/${post.author.id}`, "aria-label": post.author.displayName, style: "display:inline-flex;border-radius:50%;text-decoration:none" },
        avatar(post.author.displayName, post.author.avatarUrl, 44)),
      h("div", { class: "post-who" },
        h("a", { class: "author", href: `#/u/${post.author.id}` }, post.author.displayName),
        h("span", { class: "muted small" }, timeAgo(post.createdAt))),
      canDelete ? deleteBtn : null),
    post.content ? h("p", { class: "post-text" }, linkify(post.content)) : null,
    media,
    h("div", { class: "actions" }, likeBtn, commentBtn, canSeeLikers ? likersBtn : null),
    commentsBox].filter(Boolean));
  sync();
  return card;
}

function createFeed({ scope, userId, empty }) {
  const list = h("div", { class: "feed" });
  const footer = h("div", { class: "feed-footer" });
  const box = h("div", {}, list, footer);
  let cursor = null;
  let loading = false;

  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) { list.replaceChildren(...skeletons(3)); cursor = null; }
    footer.replaceChildren();
    try {
      const data = await api("/posts/feed", {
        query: { scope, userId, limit: 20, before: cursor },
      });
      if (reset) list.replaceChildren();
      data.posts.forEach((p) => list.append(postCard(p, { onDeleted: checkEmpty })));
      cursor = data.nextCursor;
      checkEmpty();
      if (cursor) footer.append(h("button", { class: "btn outline", type: "button", onclick: () => load(false) }, "Load more"));
    } catch (e) {
      list.replaceChildren(stateBox(e.message, h("button", { class: "btn outline sm", type: "button", onclick: () => load(true) }, "Try again")));
    } finally {
      loading = false;
    }
  }

  function checkEmpty() {
    if (!list.children.length) list.append(stateBox(empty));
  }

  box.reload = () => load(true);
  load(true);
  return box;
}

/* ====================== stories ====================== */
const STORY_IMAGE_MS = 5000;
const seenStories = {
  read() { try { return JSON.parse(store.get("fabdia_seen_stories") || "{}"); } catch { return {}; } },
  mark(userId, storyId) {
    const s = this.read();
    if ((s[userId] || 0) < storyId) { s[userId] = storyId; store.set("fabdia_seen_stories", JSON.stringify(s)); }
  },
  isUnseen(group) { return (this.read()[group.user.id] || 0) < group.stories[group.stories.length - 1].id; },
};

function openStoryComposer(onDone) {
  if (!state.user) { location.hash = "#/login"; return; }
  let uploading = false;
  const caption = h("input", { type: "text", maxlength: "200", placeholder: "Add a caption (optional)", "aria-label": "Caption", autocomplete: "off" });
  const shareBtn = h("button", { class: "btn primary sm", type: "button", disabled: true }, "Share");
  const closeBtn = h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20));
  const att = attachmentPicker(refresh);
  const hint = h("p", { class: "muted small" }, `Add a photo or a video (up to ${CONFIG.MAX_VIDEO_SECONDS} seconds). Stories disappear after 24 hours.`);
  const dialog = h("dialog", { class: "sheet", "aria-label": "New story" },
    h("div", { class: "sheet-head" }, closeBtn, h("h2", { class: "sheet-title" }, "New story"), shareBtn),
    h("div", { class: "sheet-body" }, hint, att.preview, h("div", { class: "sheet-foot" }, att.tools), caption));

  function refresh() { shareBtn.disabled = uploading || att.busy || !att.value; }
  dialog.addEventListener("cancel", (e) => { if (uploading) e.preventDefault(); });
  dialog.addEventListener("click", (e) => { if (e.target === dialog && !uploading) dialog.close(); });
  dialog.addEventListener("close", () => { att.clear(true); dialog.remove(); });

  shareBtn.addEventListener("click", async () => {
    const a = att.value;
    if (!a || shareBtn.disabled) return;
    uploading = true; shareBtn.disabled = true; caption.disabled = true; closeBtn.disabled = true; att.setDisabled(true);
    try {
      shareBtn.textContent = "0%";
      const url = await uploadFile(a.kind === "image" ? "story_image" : "story_video", a.file,
        (p) => { shareBtn.textContent = `${Math.round(p * 100)}%`; });
      shareBtn.textContent = "Sharing…";
      const body = { caption: caption.value.trim(), imageUrl: null, videoUrl: null, videoSeconds: null };
      if (a.kind === "image") body.imageUrl = url; else { body.videoUrl = url; body.videoSeconds = a.seconds; }
      await api("/stories/create", { method: "POST", body });
      uploading = false;
      dialog.close();
      toast("Story shared");
      if (onDone) onDone();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      uploading = false;
      shareBtn.textContent = "Share";
      caption.disabled = false; closeBtn.disabled = false; att.setDisabled(false);
      refresh();
    }
  });

  document.body.append(dialog);
  dialog.showModal();
}

// Full-screen story player: tap the right side for next, the left for previous.
function openStoryViewer(groups, startIndex, { onClose, onDeleted } = {}) {
  let gi = startIndex, si = 0, raf = 0, startedAt = 0, video = null, closed = false, paused = false, pauseStart = 0;
  const overlay = h("div", { class: "story-viewer", role: "dialog", "aria-modal": "true", "aria-label": "Story" });
  const actions = h("div", { class: "story-actions" });
  const stage = h("div", { class: "story-stage" });
  const bars = h("div", { class: "story-bars" });
  const head = h("div", { class: "story-head" });
  const caption = h("p", { class: "story-caption", hidden: true });
  const prevZone = h("button", { class: "story-zone left", type: "button", "aria-label": "Previous story", onclick: () => prev() });
  const nextZone = h("button", { class: "story-zone right", type: "button", "aria-label": "Next story", onclick: () => next() });
  overlay.append(stage, prevZone, nextZone, bars, head, caption, actions);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.body.append(overlay);

  function onKey(e) {
    if (e.key === "Escape") { if (document.activeElement && document.activeElement.tagName === "INPUT") document.activeElement.blur(); else close(); return; }
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") prev();
  }
  document.addEventListener("keydown", onKey);

  function stopPlayback() {
    cancelAnimationFrame(raf);
    if (video) { try { video.pause(); } catch { /* ignore */ } video = null; }
  }
  // typing a reply (or reading who reacted) holds the story still
  function pause() {
    if (paused || closed) return;
    paused = true;
    pauseStart = performance.now();
    cancelAnimationFrame(raf);
    if (video) { try { video.pause(); } catch { /* ignore */ } }
  }
  function resume() {
    if (!paused || closed) return;
    paused = false;
    if (video) video.play().catch(() => {});
    else { startedAt += performance.now() - pauseStart; raf = requestAnimationFrame(tickImage); }
  }

  const REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🔥"];
  function burst(emoji) {
    const b = h("span", { class: "story-burst", "aria-hidden": "true" }, emoji);
    b.style.left = `${35 + Math.random() * 30}%`;
    overlay.append(b);
    setTimeout(() => b.remove(), 1200);
  }

  function openReactors(s) {
    pause();
    const rows = s.reactors.length
      ? s.reactors.map((r) => h("a", { class: "liker", href: `#/u/${r.userId}`, onclick: () => { dialog.close(); close(); } },
          avatar(r.displayName, r.avatarUrl, 42),
          h("span", { class: "liker-who" }, h("strong", {}, r.displayName)),
          h("span", { class: "reactor-emoji" }, r.emoji)))
      : [h("p", { class: "muted" }, "No reactions yet.")];
    const dialog = h("dialog", { class: "sheet", "aria-label": "Reactions" },
      h("div", { class: "sheet-head" },
        h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20)),
        h("h2", { class: "sheet-title" }, `Reactions · ${s.reactionCount}`), h("span", { style: "width:36px" })),
      h("div", { class: "sheet-body" }, h("div", { class: "likers" }, rows)));
    dialog.addEventListener("close", () => { dialog.remove(); resume(); });
    document.body.append(dialog);
    dialog.showModal();
  }

  // bottom bar: quick emoji reactions + a reply box (your own story shows who reacted instead)
  function drawActions(g, s, mine) {
    actions.className = `story-actions ${mine ? "mine" : ""}`;
    if (mine) {
      actions.replaceChildren(h("button", { class: "story-seen", type: "button", onclick: () => openReactors(s) },
        s.reactionCount ? `❤️ ${s.reactionCount} ${s.reactionCount === 1 ? "reaction" : "reactions"}` : "No reactions yet"));
      return;
    }
    const buttons = REACTIONS.map((emoji) => h("button", {
      class: `story-emoji ${s.myReaction === emoji ? "on" : ""}`, type: "button",
      "aria-label": emoji === "❤️" ? "Like" : `React ${emoji}`, "aria-pressed": s.myReaction === emoji ? "true" : "false",
      onclick: async () => {
        const before = s.myReaction;
        const nextEmoji = before === emoji ? null : emoji;
        s.myReaction = nextEmoji;
        if (nextEmoji) burst(nextEmoji);
        buttons.forEach((b, i) => { const on = REACTIONS[i] === nextEmoji; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
        try {
          const r = await api("/stories/react", { method: "POST", body: { storyId: s.id, emoji: nextEmoji }, quiet: true });
          s.myReaction = r.myReaction; s.reactionCount = r.reactionCount;
        } catch (e) {
          s.myReaction = before;
          buttons.forEach((b, i) => { const on = REACTIONS[i] === before; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
          toast(e.message, "error");
        }
      },
    }, emoji));
    const reply = h("input", { class: "story-reply", type: "text", placeholder: `Reply to ${g.user.displayName}…`, maxlength: "1000", "aria-label": `Reply to ${g.user.displayName}'s story`, autocomplete: "off", enterkeyhint: "send" });
    const sendBtn = h("button", { class: "btn icon story-reply-send", type: "button", "aria-label": "Send reply", disabled: true }, icon("send", 20));
    let sending = false;
    async function sendReply() {
      const body = reply.value.trim();
      if (!body || sending) return;
      sending = true; sendBtn.disabled = true;
      try {
        await api("/stories/reply", { method: "POST", body: { storyId: s.id, body } });
        reply.value = "";
        reply.blur();
        toast(`Reply sent to ${g.user.displayName}`);
      } catch (e) { toast(e.message, "error"); }
      finally { sending = false; sendBtn.disabled = !reply.value.trim(); }
    }
    reply.addEventListener("input", () => { sendBtn.disabled = !reply.value.trim(); });
    reply.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendReply(); } });
    reply.addEventListener("focus", pause);
    reply.addEventListener("blur", () => setTimeout(resume, 50));
    sendBtn.addEventListener("click", sendReply);
    actions.replaceChildren(h("div", { class: "story-emoji-row" }, buttons), h("div", { class: "story-reply-row" }, reply, sendBtn));
  }
  function close() {
    if (closed) return;
    closed = true;
    stopPlayback();
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = prevOverflow;
    overlay.remove();
    if (onClose) onClose();
  }
  function next() {
    const g = groups[gi];
    if (si < g.stories.length - 1) si += 1;
    else if (gi < groups.length - 1) { gi += 1; si = 0; }
    else { close(); return; }
    show();
  }
  function prev() {
    if (si > 0) si -= 1;
    else if (gi > 0) { gi -= 1; si = 0; }
    show();
  }

  function setBar(ratio) {
    const fill = bars.children[si] && bars.children[si].firstChild;
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }
  function tickImage(now) {
    const ratio = (now - startedAt) / STORY_IMAGE_MS;
    setBar(ratio);
    if (ratio >= 1) next(); else raf = requestAnimationFrame(tickImage);
  }

  function show() {
    stopPlayback();
    paused = false;
    const g = groups[gi];
    const s = g.stories[si];
    seenStories.mark(g.user.id, s.id);
    drawActions(g, s, !!(state.user && g.user.id === state.user.id));

    bars.replaceChildren(...g.stories.map((_, i) => h("span", { class: "story-bar" }, h("i", { style: `width:${i < si ? 100 : 0}%` }))));

    const mine = state.user && g.user.id === state.user.id;
    const closeBtn = h("button", { class: "btn ghost icon sm story-btn", type: "button", "aria-label": "Close", onclick: close }, icon("x", 22));
    const delBtn = mine ? h("button", { class: "btn ghost icon sm story-btn", type: "button", "aria-label": "Delete story", onclick: async () => {
      if (!confirm("Delete this story?")) return;
      try {
        await api("/stories/delete", { method: "POST", body: { storyId: s.id } });
        toast("Story deleted");
        close();
        if (onDeleted) onDeleted();
      } catch (e) { toast(e.message, "error"); }
    } }, icon("trash", 20)) : null;
    head.replaceChildren(
      h("a", { class: "story-who", href: `#/u/${g.user.id}`, onclick: close },
        avatar(g.user.displayName, g.user.avatarUrl, 36),
        h("span", {}, h("strong", {}, mine ? "Your story" : g.user.displayName), h("em", {}, timeAgo(s.createdAt)))),
      h("span", { class: "story-head-actions" }, delBtn, closeBtn));

    caption.hidden = !s.caption;
    caption.replaceChildren(...(s.caption ? linkify(s.caption) : []));

    if (s.videoUrl) {
      const v = h("video", { src: resolveMedia(s.videoUrl), playsinline: true, autoplay: true, preload: "auto" });
      video = v;
      stage.replaceChildren(v);
      v.addEventListener("timeupdate", () => { if (v.duration) setBar(v.currentTime / v.duration); });
      v.addEventListener("ended", () => { if (video === v) next(); });
      v.addEventListener("error", () => { if (video === v) next(); });
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    } else {
      const img = h("img", { src: resolveMedia(s.imageUrl), alt: s.caption || `Story by ${g.user.displayName}` });
      img.addEventListener("error", () => next());
      stage.replaceChildren(img);
      startedAt = performance.now();
      raf = requestAnimationFrame(tickImage);
    }
  }
  show();
}

// The row of story circles at the top of Home.
function storiesBar() {
  const bar = h("div", { class: "stories-bar", role: "list", "aria-label": "Stories" });
  let groups = [];

  function ringItem(g, idx, ordered, label, { plus } = {}) {
    const unseen = seenStories.isUnseen(g);
    const open = h("button", { class: "story-open", type: "button", "aria-label": `Open ${label}'s story`, onclick: () => openStoryViewer(ordered, idx, { onClose: draw, onDeleted: load }) },
      h("span", { class: `story-ring ${unseen ? "unseen" : "seen"}` }, avatar(g.user.displayName, g.user.avatarUrl, 56)));
    return h("div", { class: "story-item", role: "listitem" }, open, plus || null,
      h("span", { class: "story-name" }, label));
  }

  function draw() {
    const me = state.user;
    const mine = groups.find((g) => g.user.id === me.id);
    const others = groups.filter((g) => g.user.id !== me.id);
    // new stories first, then ones already watched
    others.sort((a, b) => Number(seenStories.isUnseen(b)) - Number(seenStories.isUnseen(a)));
    const ordered = mine ? [mine, ...others] : others;

    const plusBtn = h("button", { class: "story-plus", type: "button", "aria-label": "Add to your story", onclick: () => openStoryComposer(load) }, icon("plus", 14));
    const yourItem = mine
      ? ringItem(mine, 0, ordered, "Your Story", { plus: plusBtn })
      : h("div", { class: "story-item", role: "listitem" },
          h("button", { class: "story-open", type: "button", "aria-label": "Add to your story", onclick: () => openStoryComposer(load) },
            h("span", { class: "story-ring seen" }, avatar(me.displayName, me.avatarUrl, 56))),
          plusBtn, h("span", { class: "story-name" }, "Your Story"));
    bar.replaceChildren(yourItem, ...others.map((g, i) => ringItem(g, (mine ? 1 : 0) + i, ordered, g.user.displayName)));
  }

  async function load() {
    try {
      const data = await api("/stories/feed", { quiet: true });
      groups = data.groups;
    } catch { groups = []; }
    draw();
  }

  draw();
  load();
  return bar;
}

/* ====================== new post sheet ====================== */
function openComposer() {
  if (!state.user) { location.hash = "#/login"; return; }
  let uploading = false;

  const ta = h("textarea", { rows: "4", maxlength: "2000", placeholder: "What's on your mind?", "aria-label": "Write a post" });
  const count = h("span", { class: "muted small" });
  const postBtn = h("button", { class: "btn primary sm", type: "button", disabled: true }, "Post");
  const closeBtn = h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20));
  const att = attachmentPicker(refresh);

  const dialog = h("dialog", { class: "sheet", "aria-label": "New post" },
    h("div", { class: "sheet-head" }, closeBtn, h("h2", { class: "sheet-title" }, "New post"), postBtn),
    h("div", { class: "sheet-body" },
      h("div", { class: "sheet-row" }, avatar(state.user.displayName, state.user.avatarUrl, 44), ta),
      att.preview,
      h("div", { class: "sheet-foot" }, att.tools, count)));

  function refresh() {
    postBtn.disabled = uploading || att.busy || (ta.value.trim().length === 0 && !att.value);
  }
  ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`;
    refresh();
    const left = 2000 - ta.value.length;
    count.textContent = left < 200 ? `${left} left` : "";
  });
  ta.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); }
  });
  postBtn.addEventListener("click", submit);
  dialog.addEventListener("cancel", (e) => { if (uploading) e.preventDefault(); });
  dialog.addEventListener("click", (e) => { if (e.target === dialog && !uploading) dialog.close(); });
  dialog.addEventListener("close", () => { att.clear(true); dialog.remove(); });

  async function submit() {
    const content = ta.value.trim();
    const a = att.value;
    if ((!content && !a) || postBtn.disabled) return;
    uploading = true;
    postBtn.disabled = true;
    ta.disabled = true;
    closeBtn.disabled = true;
    att.setDisabled(true);
    try {
      const body = { content, imageUrl: null, videoUrl: null, videoSeconds: null };
      if (a) {
        postBtn.textContent = "0%";
        const url = await uploadFile(a.kind === "image" ? "post_image" : "post_video", a.file,
          (p) => { postBtn.textContent = `${Math.round(p * 100)}%`; });
        if (a.kind === "image") body.imageUrl = url;
        else { body.videoUrl = url; body.videoSeconds = a.seconds; }
      }
      postBtn.textContent = "Posting…";
      await api("/posts/create", { method: "POST", body });
      uploading = false;
      dialog.close();
      toast("Posted");
      if (live.feed && location.hash.replace(/^#/, "") in { "": 1, "/": 1 }) {
        homeScope = "all";
        render();
      } else {
        location.hash = "#/";
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      uploading = false;
      postBtn.textContent = "Post";
      ta.disabled = false;
      closeBtn.disabled = false;
      att.setDisabled(false);
      refresh();
    }
  }

  document.body.append(dialog);
  dialog.showModal();
  ta.focus();
}

/* ====================== views ====================== */
let homeScope = "all";

function homeView() {
  if (!state.user) homeScope = "all";
  const root = h("div");
  const slot = h("div", { class: "pad" });
  let feed;

  function mountFeed() {
    feed = createFeed({
      scope: homeScope,
      empty: homeScope === "following"
        ? "Follow people from their profiles and their posts will show up here."
        : "No posts yet. Be the first to post.",
    });
    live.feed = feed;
    slot.replaceChildren(feed);
  }

  if (state.user) {
    const tabButtons = [["all", "For you"], ["following", "Following"]].map(([value, label]) =>
      h("button", {
        class: "ftab", role: "tab", type: "button", "aria-selected": String(value === homeScope),
        onclick: () => {
          if (homeScope === value) { window.scrollTo({ top: 0, behavior: "smooth" }); feed.reload(); return; }
          homeScope = value;
          tabButtons.forEach((b, i) => b.setAttribute("aria-selected", String(["all", "following"][i] === value)));
          mountFeed();
        },
      }, label));
    root.append(
      storiesBar(),
      h("div", { class: "feed-tabs", role: "tablist" }, tabButtons),
      h("div", { class: "pad", style: "padding-bottom:0" },
        h("div", { class: "compose-row" },
          avatar(state.user.displayName, state.user.avatarUrl, 44),
          h("button", { class: "compose-fake", type: "button", onclick: openComposer }, "What's on your mind?"),
          h("span", { class: "compose-icons" },
            h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Post a photo", onclick: openComposer }, icon("image", 22)),
            h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Post a video", onclick: openComposer }, icon("video", 22))))));
  } else {
    root.append(h("div", { class: "pad", style: "padding-bottom:0" },
      h("section", { class: "hero" },
        h("div", { class: "banner" }),
        h("div", { class: "hero-body" },
          h("h1", {}, `Welcome to ${CONFIG.FULL_NAME}`),
          h("p", {}, "Share photos and videos, follow friends and chat in real time. Free to join."),
          h("a", { class: "btn primary", href: "#/login" }, "Log in or sign up")))));
  }
  root.append(slot);
  mountFeed();
  return root;
}

function profileView(id) {
  const root = h("div", { class: "pad stack" });
  const head = h("section", { class: "profile-card" }, ...skeletons(1));
  const feedSlot = h("div");
  root.append(head, feedSlot);
  let profile = null;

  function stat(label, value) {
    return h("div", {}, h("dt", {}, label), h("dd", {}, value));
  }

  function drawHead(editing = false) {
    const p = profile;
    let action = null;
    if (p.isMe) {
      if (!editing) {
        const notifBtn = h("button", { class: "btn outline sm", type: "button" }, icon("bell", 16), "Notifications");
        notifBtn.addEventListener("click", () => togglePushSubscription(notifBtn));
        syncPushButton(notifBtn);
        action = h("div", { class: "profile-actions" },
          h("button", { class: "btn outline sm", type: "button", onclick: () => drawHead(true) }, "Edit profile"),
          notifBtn,
          h("button", { class: "btn ghost sm", type: "button", onclick: logout }, icon("logout", 16), "Log out"));
      }
    } else if (state.user) {
      const followBtn = h("button", {
        class: `btn sm ${p.followedByMe ? "outline" : "primary"}`, type: "button",
        onclick: async () => {
          followBtn.disabled = true;
          try {
            const r = await api("/follows/set", { method: "POST", body: { userId: p.id, following: !p.followedByMe } });
            p.followedByMe = r.followedByMe;
            p.followerCount = r.followerCount;
            drawHead();
          } catch (e) {
            toast(e.message, "error");
            followBtn.disabled = false;
          }
        },
      }, p.followedByMe ? "Following" : "Follow");
      const messageBtn = h("button", {
        class: "btn outline sm", type: "button",
        onclick: async () => {
          messageBtn.disabled = true;
          try {
            const r = await api("/chat/open", { method: "POST", body: { userId: p.id } });
            location.hash = `#/messages/${r.conversationId}`;
          } catch (e) {
            toast(e.message, "error");
            messageBtn.disabled = false;
          }
        },
      }, icon("message", 16), "Message");
      const friendBtn = h("button", { class: "btn outline sm", type: "button", hidden: true }, "…");
      loadFriendState(p.id, friendBtn);
      action = h("div", { class: "profile-actions" }, followBtn, messageBtn, friendBtn);
    } else {
      action = h("a", { class: "btn primary sm", href: "#/login" }, "Follow");
    }

    head.replaceChildren(
      h("div", { class: "banner" }),
      h("div", { class: "profile-body" },
        h("div", { class: "profile-top" },
          h("span", { class: "avatar-ring" }, avatar(p.displayName, p.avatarUrl, 88)),
          action),
        editing ? editForm() : [h("h1", { class: "profile-name" }, p.displayName), p.bio ? h("p", { class: "bio" }, p.bio) : null],
        h("dl", { class: "stats" }, stat("Posts", p.postCount), stat("Followers", p.followerCount), stat("Following", p.followingCount))));
  }

  function editForm() {
    const name = h("input", { type: "text", value: profile.displayName, maxlength: "50", required: true, "aria-label": "Name" });
    const bio = h("textarea", { maxlength: "300", rows: "3", "aria-label": "Bio" }, profile.bio || "");
    const save = h("button", { class: "btn primary sm", type: "submit" }, "Save");
    const cancel = h("button", { class: "btn ghost sm", type: "button", onclick: () => drawHead() }, "Cancel");

    // profile picture: choose a photo here, it uploads when you press Save
    let newPhoto = null;
    let removePhoto = false;
    const previewSlot = h("div", {}, avatar(profile.displayName, profile.avatarUrl, 84));
    const photoInput = h("input", { type: "file", accept: "image/*", hidden: true });
    const removeBtn = h("button", { class: "btn ghost sm", type: "button", hidden: !profile.avatarUrl, onclick: () => {
      newPhoto = null; removePhoto = true;
      previewSlot.replaceChildren(avatar(name.value || profile.displayName, null, 84));
      removeBtn.hidden = true;
    } }, "Remove photo");
    photoInput.addEventListener("change", async () => {
      const file = photoInput.files[0];
      photoInput.value = "";
      if (!file) return;
      try {
        if (!isImageFile(file)) throw new UserError("Choose a photo.");
        const a = await inspectImage(file, { max: 512, square: true });
        newPhoto = a.file;
        removePhoto = false;
        const img = h("img", { src: URL.createObjectURL(a.file), alt: "New profile photo" });
        previewSlot.replaceChildren(h("span", { class: "avatar", style: "width:84px;height:84px" }, img));
        removeBtn.hidden = false;
      } catch (e) {
        toast(e.message, "error");
      }
    });

    return h("form", {
      class: "edit-form",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        save.disabled = cancel.disabled = true;
        try {
          let avatarUrl = profile.avatarUrl;
          if (newPhoto) {
            save.textContent = "Uploading 0%";
            avatarUrl = await uploadFile("avatar", newPhoto, (p) => { save.textContent = `Uploading ${Math.round(p * 100)}%`; });
          } else if (removePhoto) {
            avatarUrl = null;
          }
          save.textContent = "Saving…";
          const r = await api("/profiles/update", {
            method: "POST",
            body: {
              displayName: name.value.trim(),
              bio: bio.value.trim() ? bio.value : null,
              avatarUrl,
            },
          });
          state.user = { ...state.user, displayName: r.user.displayName, avatarUrl: r.user.avatarUrl };
          profile.displayName = r.user.displayName;
          profile.avatarUrl = r.user.avatarUrl;
          profile.bio = bio.value.trim() ? bio.value : null;
          refreshChrome();
          drawHead();
          toast("Profile updated");
        } catch (err) {
          toast(err.message, "error");
          save.textContent = "Save";
          save.disabled = cancel.disabled = false;
        }
      },
    },
      h("div", { class: "avatar-edit" }, previewSlot,
        h("div", { class: "buttons" },
          h("button", { class: "btn outline sm", type: "button", onclick: () => photoInput.click() }, icon("image", 16), "Change photo"),
          removeBtn, photoInput)),
      h("label", { class: "field" }, h("span", {}, "Name"), name),
      h("label", { class: "field" }, h("span", {}, "Bio"), bio),
      h("div", { class: "edit-actions" }, cancel, save));
  }

  async function loadProfile() {
    head.replaceChildren(...skeletons(1));
    try {
      const data = await api("/profiles/get", { query: { userId: id } });
      profile = data.profile;
      document.title = `${profile.displayName} — ${CONFIG.FULL_NAME}`;
      drawHead();
      feedSlot.replaceChildren(
        h("h2", { class: "section-title", style: "margin-bottom:12px" }, "Posts"),
        createFeed({
          scope: "user", userId: id,
          empty: profile.isMe ? "You haven't posted yet." : "No posts yet.",
        }));
    } catch (e) {
      head.replaceChildren(stateBox(e.message, h("a", { class: "btn outline sm", href: "#/" }, "Back home")));
    }
  }

  loadProfile();
  return root;
}

/* ====================== push notifications opt-in ====================== */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function getExistingPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function syncPushButton(btn) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { btn.hidden = true; return; }
  try {
    const sub = await getExistingPushSubscription();
    btn.replaceChildren(icon("bell", 16), sub ? "Notifications on" : "Turn on notifications");
  } catch { /* leave default label */ }
}

async function togglePushSubscription(btn) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    toast("Push notifications aren't supported on this device.", "error");
    return;
  }
  btn.disabled = true;
  try {
    const existing = await getExistingPushSubscription();
    if (existing) {
      await existing.unsubscribe();
      await api("/push/unsubscribe", { method: "POST", body: { identity: existing.endpoint } });
      toast("Notifications turned off");
    } else {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Notifications permission was not granted."); return; }
      const { publicKey } = await api("/push/vapidkey", { quiet: true });
      if (!publicKey) { toast("Push isn't set up on the server yet.", "error"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api("/push/subscribe", { method: "POST", body: { subscription: sub.toJSON() } });
      toast("Notifications turned on");
    }
  } catch (e) {
    toast(e.message || "Couldn't update notifications", "error");
  } finally {
    btn.disabled = false;
    syncPushButton(btn);
  }
}

/* ====================== notification prompt + invite ====================== */
async function maybeShowNotifyBanner() {
  try {
    if (!state.user || document.querySelector(".notify-banner")) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (store.get("fabdia_notify_dismissed")) return;
    if (await getExistingPushSubscription()) return;
  } catch { return; }
  const enable = h("button", { class: "btn primary sm", type: "button" }, "Enable");
  const later = h("button", { class: "btn ghost sm", type: "button" }, "Not now");
  const banner = h("div", { class: "notify-banner", role: "dialog", "aria-label": "Turn on notifications" },
    icon("bell", 20),
    h("div", { class: "notify-text" }, h("strong", {}, "Never miss a message"), h("span", {}, "Get notified about new messages and friend requests.")),
    h("div", { class: "notify-actions" }, later, enable));
  later.addEventListener("click", () => { store.set("fabdia_notify_dismissed", "1"); banner.remove(); });
  enable.addEventListener("click", async () => {
    await togglePushSubscription(enable);
    store.set("fabdia_notify_dismissed", "1");
    banner.remove();
  });
  document.body.append(banner);
}

async function shareInvite() {
  const url = location.origin + "/?ref=" + (state.user ? state.user.id : "");
  const text = `Join me on ${CONFIG.FULL_NAME}! Share photos and videos, make friends and chat: ${url}`;
  try {
    if (navigator.share) { await navigator.share({ title: CONFIG.FULL_NAME, text, url }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  try {
    await navigator.clipboard.writeText(text);
    toast("Invite link copied. Paste it to your friends!");
  } catch {
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
  }
}

/* ---------- friend button (used on profiles) ---------- */
async function loadFriendState(userId, btn) {
  try {
    const data = await api("/friends/list", { quiet: true });
    if (data.friends.some((f) => f.id === userId)) {
      setFriendBtn(btn, "friends", userId);
      return;
    }
    const incoming = data.incoming.find((r) => r.user.id === userId);
    if (incoming) { setFriendBtn(btn, "incoming", userId, incoming.requestId); return; }
    const outgoing = data.outgoing.find((r) => r.user.id === userId);
    if (outgoing) { setFriendBtn(btn, "outgoing", userId, outgoing.requestId); return; }
    setFriendBtn(btn, "none", userId);
  } catch {
    btn.hidden = true;
  }
}

function setFriendBtn(btn, mode, userId, requestId) {
  btn.hidden = false;
  btn.disabled = false;
  btn.replaceChildren();
  if (mode === "friends") {
    btn.append(icon("check", 16), "Friends");
    btn.onclick = null;
  } else if (mode === "incoming") {
    btn.append("Accept request");
    btn.onclick = async () => {
      btn.disabled = true;
      try { await api("/friends/respond", { method: "POST", body: { requestId, action: "accept" } }); setFriendBtn(btn, "friends", userId); }
      catch (e) { toast(e.message, "error"); btn.disabled = false; }
    };
  } else if (mode === "outgoing") {
    btn.append("Cancel request");
    btn.onclick = async () => {
      btn.disabled = true;
      try { await api("/friends/respond", { method: "POST", body: { requestId, action: "cancel" } }); setFriendBtn(btn, "none", userId); }
      catch (e) { toast(e.message, "error"); btn.disabled = false; }
    };
  } else {
    btn.append(icon("plus", 16), "Add friend");
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await api("/friends/request", { method: "POST", body: { userId } });
        setFriendBtn(btn, r.status === "accepted" ? "friends" : "outgoing", userId, r.requestId);
      } catch (e) { toast(e.message, "error"); btn.disabled = false; }
    };
  }
}

/* ---------- friends ---------- */
function friendRow(user, actions) {
  return h("div", { class: "friend-row" },
    h("a", { class: "friend-row-main", href: `#/u/${user.id}` },
      avatar(user.displayName, user.avatarUrl, 48, { userId: user.id }),
      h("div", {},
        h("div", { class: "friend-row-name" }, user.displayName),
        user.bio ? h("div", { class: "muted small" }, user.bio) : null)),
    h("div", { class: "friend-row-actions" }, actions));
}

function friendsView() {
  const root = h("div", { class: "pad stack" });
  const body = h("div");
  root.append(
    h("div", { class: "friends-head" },
      h("h1", { class: "page-title" }, "Friends"),
      h("button", { class: "btn primary sm", type: "button", onclick: shareInvite }, icon("share", 16), "Invite friends")),
    body);

  async function load() {
    body.replaceChildren(...skeletons(3));
    try {
      const [listData, suggestedData] = await Promise.all([
        api("/friends/list"),
        api("/users/suggested", { quiet: true }).catch(() => ({ users: [] })),
      ]);

      state.friendRequestCount = listData.incoming.length;
      updateFriendBadge();

      const sections = [];

      if (listData.incoming.length) {
        sections.push(h("h2", { class: "section-title" }, "Requests"));
        sections.push(h("section", { class: "list-card" }, listData.incoming.map((r) => {
          const acceptBtn = h("button", { class: "btn primary sm", type: "button" }, "Accept");
          const declineBtn = h("button", { class: "btn outline sm", type: "button" }, "Decline");
          acceptBtn.addEventListener("click", () => respond(r.requestId, "accept", acceptBtn, declineBtn));
          declineBtn.addEventListener("click", () => respond(r.requestId, "decline", acceptBtn, declineBtn));
          return friendRow(r.user, [acceptBtn, declineBtn]);
        })));
      }

      if (listData.outgoing.length) {
        sections.push(h("h2", { class: "section-title" }, "Sent"));
        sections.push(h("section", { class: "list-card" }, listData.outgoing.map((r) => {
          const cancelBtn = h("button", { class: "btn outline sm", type: "button" }, "Cancel");
          cancelBtn.addEventListener("click", () => respond(r.requestId, "cancel", cancelBtn));
          return friendRow(r.user, [cancelBtn]);
        })));
      }

      sections.push(h("h2", { class: "section-title" }, "Your friends"));
      sections.push(listData.friends.length
        ? h("section", { class: "list-card" }, listData.friends.map((f) => friendRow(f, [])))
        : stateBox("No friends yet. Add some people below."));

      if (suggestedData.users.length) {
        sections.push(h("h2", { class: "section-title" }, "Suggested people"));
        sections.push(h("section", { class: "list-card" }, suggestedData.users.map((u) => {
          const addBtn = h("button", { class: "btn primary sm", type: "button" }, "Add friend");
          addBtn.addEventListener("click", async () => {
            addBtn.disabled = true;
            try {
              await api("/friends/request", { method: "POST", body: { userId: u.id } });
              addBtn.textContent = "Requested";
            } catch (e) {
              toast(e.message, "error");
              addBtn.disabled = false;
            }
          });
          return friendRow(u, [addBtn]);
        })));
      }

      body.replaceChildren(...sections);
    } catch (e) {
      body.replaceChildren(stateBox(e.message, h("button", { class: "btn outline sm", type: "button", onclick: load }, "Try again")));
    }
  }

  async function respond(requestId, action, ...buttons) {
    buttons.forEach((b) => (b.disabled = true));
    try {
      await api("/friends/respond", { method: "POST", body: { requestId, action } });
      load();
    } catch (e) {
      toast(e.message, "error");
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  load();
  return root;
}

/* ---------- small shared dialogs ---------- */
// A "Are you sure?" bottom sheet. Resolves true only if the person taps the confirm button.
function confirmSheet({ title, text, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const dialog = h("dialog", { class: "sheet confirm-sheet", "aria-label": title },
      h("div", { class: "sheet-body" },
        h("h2", { class: "sheet-title" }, title),
        text ? h("p", { class: "muted" }, text) : null,
        h("div", { class: "confirm-actions" },
          h("button", { class: "btn outline", type: "button", onclick: () => dialog.close() }, "Cancel"),
          h("button", { class: `btn ${danger ? "danger" : "primary"}`, type: "button", onclick: () => { result = true; dialog.close(); } }, confirmLabel))));
    dialog.addEventListener("close", () => { dialog.remove(); resolve(result); });
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

function groupAvatar(size) {
  return h("span", { class: "avatar group-avatar", style: `width:${size}px;height:${size}px` }, icon("users", Math.round(size * 0.5)));
}

// Search people (friends shown first) and tick the ones you want. Used to start a group or add people to one.
function peoplePicker({ exclude = [] } = {}) {
  const chosen = new Map();
  const skip = new Set(exclude);
  const search = h("input", { type: "search", placeholder: "Search people by name…", "aria-label": "Search people", autocomplete: "off" });
  const chips = h("div", { class: "pick-chips", hidden: true });
  const results = h("div", { class: "pick-results" });
  const node = h("div", { class: "picker" }, search, chips, results);
  let friends = [], timer = null, seq = 0, onChange = () => {};

  function drawChips() {
    chips.hidden = chosen.size === 0;
    chips.replaceChildren(...Array.from(chosen.values()).map((u) =>
      h("button", { class: "pick-chip", type: "button", "aria-label": `Remove ${u.displayName}`, onclick: () => { chosen.delete(u.id); drawChips(); redraw(); onChange(); } },
        u.displayName, icon("x", 14))));
  }
  let lastList = [], lastLabel = "";
  function redraw() { draw(lastList, lastLabel); }
  function draw(users, label) {
    lastList = users; lastLabel = label;
    const shown = users.filter((u) => !skip.has(u.id));
    results.replaceChildren(
      label ? h("p", { class: "muted small pick-label" }, label) : null,
      ...(shown.length ? shown.map((u) => {
        const on = chosen.has(u.id);
        return h("button", { class: `pick-row ${on ? "on" : ""}`, type: "button", "aria-pressed": on ? "true" : "false",
          onclick: () => { if (chosen.has(u.id)) chosen.delete(u.id); else chosen.set(u.id, u); drawChips(); redraw(); onChange(); } },
          avatar(u.displayName, u.avatarUrl, 38),
          h("span", { class: "pick-name" }, u.displayName),
          h("span", { class: "pick-check" }, on ? icon("check", 16) : null));
      }) : [h("p", { class: "muted small" }, label === "Your friends" ? "No friends yet. Type a name to search everyone." : "No one found.")]));
  }
  search.addEventListener("input", () => {
    clearTimeout(timer);
    const q = search.value.trim();
    if (!q) { draw(friends, "Your friends"); return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const data = await api("/users/search", { query: { q }, quiet: true });
        if (mine === seq) draw(data.users, "People");
      } catch { /* keep the list as it was */ }
    }, 250);
  });
  (async () => {
    try { friends = (await api("/friends/list", { quiet: true })).friends; } catch { friends = []; }
    if (!search.value.trim()) draw(friends, "Your friends");
  })();
  draw([], "");

  return { node, ids: () => Array.from(chosen.keys()), onChange: (fn) => { onChange = fn; } };
}

// "New group": name it, pick people, create.
function openGroupDialog(onCreated) {
  const name = h("input", { type: "text", placeholder: "Group name (e.g. Class of 2026)", maxlength: "60", "aria-label": "Group name", autocomplete: "off" });
  const picker = peoplePicker();
  const error = h("p", { class: "form-error", hidden: true });
  const createBtn = h("button", { class: "btn primary sm", type: "button", disabled: true }, "Create");
  const dialog = h("dialog", { class: "sheet", "aria-label": "New group" },
    h("div", { class: "sheet-head" },
      h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20)),
      h("h2", { class: "sheet-title" }, "New group"), createBtn),
    h("div", { class: "sheet-body" }, error, h("label", { class: "field" }, "Name", name), picker.node));
  const refresh = () => { createBtn.disabled = name.value.trim().length < 2 || picker.ids().length < 1; };
  name.addEventListener("input", refresh);
  picker.onChange(refresh);
  createBtn.addEventListener("click", async () => {
    error.hidden = true; createBtn.disabled = true;
    try {
      const r = await api("/chat/group_create", { method: "POST", body: { name: name.value.trim(), memberIds: picker.ids() } });
      dialog.close();
      toast("Group created");
      onCreated(r.conversationId);
    } catch (e) { error.textContent = e.message; error.hidden = false; createBtn.disabled = false; }
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function openAddPeopleDialog(conversationId, memberIds, onDone) {
  const picker = peoplePicker({ exclude: memberIds });
  const error = h("p", { class: "form-error", hidden: true });
  const addBtn = h("button", { class: "btn primary sm", type: "button", disabled: true }, "Add");
  const dialog = h("dialog", { class: "sheet", "aria-label": "Add people" },
    h("div", { class: "sheet-head" },
      h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20)),
      h("h2", { class: "sheet-title" }, "Add people"), addBtn),
    h("div", { class: "sheet-body" }, error, picker.node));
  picker.onChange(() => { addBtn.disabled = picker.ids().length < 1; });
  addBtn.addEventListener("click", async () => {
    error.hidden = true; addBtn.disabled = true;
    try {
      await api("/chat/group_add", { method: "POST", body: { conversationId, userIds: picker.ids() } });
      dialog.close();
      toast("People added");
      onDone();
    } catch (e) { error.textContent = e.message; error.hidden = false; addBtn.disabled = false; }
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

/* ---------- messages ---------- */
function messagesView() {
  const root = h("div", { class: "pad stack" });
  const body = h("div");
  const newGroup = () => openGroupDialog((id) => { location.hash = `#/messages/${id}`; });
  root.append(
    h("div", { class: "page-head" },
      h("h1", { class: "page-title" }, "Messages"),
      h("button", { class: "btn outline sm", type: "button", onclick: newGroup }, icon("users", 18), "New group")),
    body);

  async function load() {
    try {
      const data = await api("/chat/conversations");
      state.unread = data.conversations.reduce((n, c) => n + c.unread, 0);
      updateBadge();
      if (!data.conversations.length) {
        body.replaceChildren(stateBox("No messages yet. Open someone's profile and tap Message to start a chat, or create a group.",
          h("button", { class: "btn primary sm", type: "button", onclick: newGroup }, icon("users", 18), "New group")));
        return;
      }
      body.replaceChildren(h("section", { class: "list-card" }, data.conversations.map((c) => {
        const last = c.lastMessage;
        const mine = last.senderId === state.user.id;
        const title = c.isGroup ? c.group.name : c.other.displayName;
        const who = mine ? "You: " : (c.isGroup ? `${last.senderName}: ` : "");
        return h("a", { class: `convo ${c.unread ? "unread" : ""}`, href: `#/messages/${c.id}` },
          c.isGroup ? groupAvatar(52) : avatar(c.other.displayName, c.other.avatarUrl, 52, { userId: c.other.id }),
          h("div", { class: "convo-main" },
            h("div", { class: "convo-top" },
              h("span", { class: "convo-name" }, title),
              h("span", { class: "muted small" }, timeAgo(last.createdAt))),
            h("div", { class: "convo-last" }, who + lastPreview(last))),
          c.unread ? h("span", { class: "convo-count" }, c.unread > 99 ? "99+" : c.unread) : null);
      })));
    } catch (e) {
      body.replaceChildren(stateBox(e.message, h("button", { class: "btn outline sm", type: "button", onclick: load }, "Try again")));
    }
  }

  body.replaceChildren(...skeletons(3));
  live.list = { reload: load };
  load();
  return root;
}

function threadView(conversationId) {
  const me = state.user.id;
  const root = h("div", { class: "thread-view" });
  const head = h("div", { class: "chat-head" });
  const olderBtn = h("button", { class: "btn outline sm", type: "button", hidden: true }, "Load earlier messages");
  const list = h("div", { class: "thread", role: "log", "aria-live": "polite" });
  const typingRow = h("div", { class: "typing-row", hidden: true },
    h("span", { class: "typing-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
    h("span", { class: "typing-text" }));
  const scroller = h("div", { class: "thread-scroll" }, h("div", { class: "thread-top" }, olderBtn), list, typingRow);
  const entries = new Map(); // message id -> { m, row, tick }
  let nextCursor = null;

  let info = { isGroup: false, other: null, group: null };
  const peer = { lastReadMessageId: 0, lastActiveAt: null };
  let deliveredUpTo = 0;
  const typingUsers = new Map(); // user id -> { name, timer }
  let replyTo = null;
  let subEl = null;

  const att = attachmentPicker(refreshSend, { compact: true });
  const input = h("input", { type: "text", placeholder: "Message…", maxlength: "4000", "aria-label": "Write a message", autocomplete: "off", enterkeyhint: "send" });
  const sendBtn = h("button", { class: "btn primary icon", type: "button", "aria-label": "Send", disabled: true }, icon("send", 20));
  const replyBar = h("div", { class: "reply-bar", hidden: true });
  const composerBox = h("div", { class: "chat-composer" }, replyBar, att.preview,
    h("div", { class: "chat-row" }, att.tools, input, sendBtn));
  root.append(head, scroller, composerBox);

  function refreshSend() { sendBtn.disabled = att.busy || (!input.value.trim() && !att.value); }

  /* ----- typing: tell the other side while I type, show theirs ----- */
  let typingSentAt = 0, typingOffTimer = null, typingOn = false;
  function sendTyping(on) {
    typingOn = on;
    typingSentAt = Date.now();
    api("/chat/typing", { method: "POST", body: { conversationId, typing: on }, quiet: true }).catch(() => {});
  }
  input.addEventListener("input", () => {
    refreshSend();
    clearTimeout(typingOffTimer);
    if (!input.value.trim()) { if (typingOn) sendTyping(false); return; }
    if (!typingOn || Date.now() - typingSentAt > 3000) sendTyping(true);
    typingOffTimer = setTimeout(() => { if (typingOn) sendTyping(false); }, 4000);
  });
  input.addEventListener("blur", () => { clearTimeout(typingOffTimer); if (typingOn) sendTyping(false); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener("click", send);

  function renderTyping() {
    const names = Array.from(typingUsers.values()).map((t) => t.name);
    typingRow.hidden = names.length === 0;
    typingRow.querySelector(".typing-text").textContent =
      names.length === 0 ? "" : info.isGroup ? `${names.join(", ")} ${names.length > 1 ? "are" : "is"} typing…` : "typing…";
    renderStatus();
    if (names.length && nearBottom()) scrollToBottom();
  }

  /* ----- header: name, online / last seen / typing ----- */
  function lastSeenText() {
    if (!peer.lastActiveAt) return "Offline";
    return `Last seen ${likedWhen(peer.lastActiveAt)}`;
  }
  function renderStatus() {
    if (!subEl) return;
    if (typingUsers.size) {
      subEl.textContent = info.isGroup ? Array.from(typingUsers.values()).map((t) => t.name).join(", ") + " typing…" : "typing…";
      subEl.className = "chat-sub typing";
    } else if (info.isGroup) {
      subEl.textContent = `${info.group.members.length} members`;
      subEl.className = "chat-sub";
    } else {
      const online = presence.isOnline(info.other.id);
      subEl.textContent = online ? "Online" : lastSeenText();
      subEl.className = `chat-sub ${online ? "online" : ""}`;
    }
  }

  /* ----- message ticks: ✓ sent · ✓✓ delivered · red ✓✓ seen ----- */
  function tickState(m) {
    if (info.isGroup) return "sent";
    if (m.id <= peer.lastReadMessageId) return "read";
    if (m.id <= deliveredUpTo) return "delivered";
    if (peer.lastActiveAt && new Date(peer.lastActiveAt) >= new Date(m.createdAt)) return "delivered";
    if (info.other && presence.isOnline(info.other.id)) return "delivered";
    return "sent";
  }
  const TICK_LABEL = { sent: "Sent", delivered: "Delivered", read: "Seen" };
  function paintTick(entry) {
    if (!entry.tick) return;
    const s = tickState(entry.m);
    entry.tick.className = `ticks ${s}`;
    entry.tick.setAttribute("aria-label", TICK_LABEL[s]);
    entry.tick.replaceChildren(icon(s === "sent" ? "tick1" : "tick2", 15));
  }
  function paintAllTicks() { entries.forEach(paintTick); }

  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 180;
  const scrollToBottom = () => { scroller.scrollTop = scroller.scrollHeight; };

  /* ----- one message ----- */
  function previewOf(m) {
    if (m.deletedAt || m.deleted) return "Message deleted";
    return m.body || (m.mediaType === "video" ? "🎥 Video" : "📷 Photo");
  }

  function bubble(m) {
    const mine = m.senderId === me;
    const deleted = !!m.deletedAt;
    const url = resolveMedia(m.mediaUrl);
    let media = null;
    if (!deleted && url && m.mediaType === "image") {
      const img = h("img", { src: url, alt: "Photo", loading: "lazy" });
      img.addEventListener("click", () => openLightbox(url));
      media = img;
    } else if (!deleted && url && m.mediaType === "video") {
      media = h("video", { src: `${url}#t=0.1`, controls: true, preload: "metadata", playsinline: true });
    }

    const storyCard = !deleted && m.story
      ? h("div", { class: "bubble-story" },
          m.story.imageUrl ? h("img", { src: resolveMedia(m.story.imageUrl), alt: "", loading: "lazy" }) : h("span", { class: "bubble-story-ph" }, icon("video", 18)),
          h("span", {}, mine ? "You replied to their story" : "Replied to your story"))
      : null;

    const quote = !deleted && m.replyTo
      ? h("button", { class: "bubble-quote", type: "button", onclick: (e) => { e.stopPropagation(); jumpTo(m.replyTo.id); } },
          h("strong", {}, m.replyTo.senderId === me ? "You" : m.replyTo.senderName),
          h("span", {}, previewOf(m.replyTo)))
      : null;

    const tick = mine && !deleted ? h("span", { class: "ticks sent" }) : null;
    const bubbleEl = h("div", { class: `bubble ${deleted ? "deleted" : ""}` },
      info.isGroup && !mine ? h("span", { class: "bubble-name" }, m.senderName) : null,
      storyCard, quote, media,
      deleted ? h("p", { class: "bubble-deleted" }, "🚫 This message was deleted") : (m.body ? h("p", {}, linkify(m.body)) : null),
      h("span", { class: "bubble-meta" }, h("span", { class: "bubble-time" }, clockTime(m.createdAt)), tick));
    const row = h("div", { class: `bubble-row ${mine ? "mine" : "theirs"}`, "data-id": m.id }, bubbleEl);
    const entry = { m, row, tick };
    entries.set(m.id, entry);
    paintTick(entry);
    if (!deleted) attachGestures(bubbleEl, () => entries.get(m.id).m);
    return row;
  }

  function addMessage(m) {
    if (entries.has(m.id)) return false;
    list.append(bubble(m));
    return true;
  }

  function replaceMessage(m) {
    const old = entries.get(m.id);
    if (!old) return;
    old.row.replaceWith(bubble(m));
  }

  function jumpTo(id) {
    const entry = entries.get(id);
    if (!entry) { toast("Scroll up to load earlier messages to see it."); return; }
    entry.row.scrollIntoView({ block: "center", behavior: "smooth" });
    entry.row.classList.add("flash");
    setTimeout(() => entry.row.classList.remove("flash"), 1200);
  }

  /* ----- long press (or swipe right) on a message: Reply / Copy / Delete ----- */
  function attachGestures(el, getM) {
    let timer = null, sx = 0, sy = 0, dx = 0, swiping = false, fired = false;
    const clear = () => { clearTimeout(timer); timer = null; };
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; swiping = false; fired = false;
      timer = setTimeout(() => { fired = true; if (navigator.vibrate) navigator.vibrate(15); openMessageMenu(getM()); }, 480);
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      const ddx = t.clientX - sx, ddy = t.clientY - sy;
      if (!swiping && (Math.abs(ddx) > 10 || Math.abs(ddy) > 10)) {
        clear();
        if (ddx > 0 && Math.abs(ddx) > Math.abs(ddy) * 1.5) swiping = true;
      }
      if (swiping) { dx = Math.min(90, ddx); el.style.transform = `translateX(${dx}px)`; }
    }, { passive: true });
    const end = () => {
      clear();
      if (swiping) { el.style.transform = ""; if (dx > 60) startReply(getM()); }
      swiping = false;
    };
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    // desktop: right click
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); clear(); if (!fired) openMessageMenu(getM()); });
  }

  function openMessageMenu(m) {
    if (m.deletedAt) return;
    const mine = m.senderId === me;
    const close = () => dialog.close();
    const action = (label, ico, fn, danger) => h("button", { class: `menu-item ${danger ? "danger" : ""}`, type: "button", onclick: () => { close(); fn(); } }, icon(ico, 22), label);
    const dialog = h("dialog", { class: "sheet action-sheet", "aria-label": "Message options" },
      h("div", { class: "menu-preview" }, h("strong", {}, mine ? "You" : m.senderName), h("span", {}, previewOf(m))),
      h("div", { class: "menu-list" },
        action("Reply", "reply", () => startReply(m)),
        m.body ? action("Copy text", "copy", async () => {
          try { await navigator.clipboard.writeText(m.body); toast("Copied"); } catch { toast("Couldn't copy", "error"); }
        }) : null,
        mine ? action("Delete", "trash", () => deleteMessage(m), true) : null));
    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
    dialog.showModal();
  }

  async function deleteMessage(m) {
    const ok = await confirmSheet({ title: "Delete this message?", text: "It will be removed for everyone in this chat.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api("/chat/delete", { method: "POST", body: { messageId: m.id } });
      applyDeleted(m.id);
    } catch (e) { toast(e.message, "error"); }
  }

  function applyDeleted(id) {
    const entry = entries.get(id);
    if (!entry) return;
    replaceMessage({ ...entry.m, deletedAt: new Date().toISOString(), body: "", mediaUrl: null, mediaType: null, story: null });
    // messages that quoted it now show "Message deleted"
    entries.forEach((e) => {
      if (e.m.replyTo && e.m.replyTo.id === id) {
        replaceMessage({ ...e.m, replyTo: { ...e.m.replyTo, deleted: true, body: "", mediaType: null } });
      }
    });
  }

  /* ----- reply bar above the composer ----- */
  function startReply(m) {
    if (m.deletedAt) return;
    replyTo = m;
    replyBar.hidden = false;
    replyBar.replaceChildren(
      icon("reply", 18),
      h("span", { class: "reply-text" }, h("strong", {}, m.senderId === me ? "Replying to yourself" : `Replying to ${m.senderName}`), h("span", {}, previewOf(m))),
      h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Cancel reply", onclick: clearReply }, icon("x", 18)));
    input.focus();
  }
  function clearReply() { replyTo = null; replyBar.hidden = true; replyBar.replaceChildren(); }

  async function markRead() {
    try { await api("/chat/read", { method: "POST", body: { conversationId }, quiet: true }); refreshUnread(); } catch { /* not critical */ }
  }

  /* ----- group info (members, add people, leave) ----- */
  function openGroupInfo() {
    const g = info.group;
    const members = h("div", { class: "likers" }, g.members.map((u) =>
      h("a", { class: "liker", href: `#/u/${u.id}`, onclick: () => dialog.close() },
        avatar(u.displayName, u.avatarUrl, 42, { userId: u.id }),
        h("span", { class: "liker-who" }, h("strong", {}, u.id === me ? `${u.displayName} (you)` : u.displayName),
          u.id === g.createdBy ? h("span", { class: "muted small" }, "Group creator") : null))));
    const dialog = h("dialog", { class: "sheet", "aria-label": "Group info" },
      h("div", { class: "sheet-head" },
        h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20)),
        h("h2", { class: "sheet-title" }, g.name), h("span", { style: "width:36px" })),
      h("div", { class: "sheet-body" },
        h("p", { class: "muted small" }, `${g.members.length} members`),
        members,
        h("button", { class: "btn outline", type: "button", onclick: () => { dialog.close(); openAddPeopleDialog(conversationId, g.members.map((u) => u.id), open); } }, icon("plus", 18), "Add people"),
        h("button", { class: "btn danger", type: "button", onclick: async () => {
          dialog.close();
          const ok = await confirmSheet({ title: "Leave this group?", text: "You won't get its messages any more.", confirmLabel: "Leave", danger: true });
          if (!ok) return;
          try { await api("/chat/group_leave", { method: "POST", body: { conversationId } }); toast("You left the group"); location.hash = "#/messages"; }
          catch (e) { toast(e.message, "error"); }
        } }, "Leave group")));
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  async function open() {
    if (!entries.size) list.replaceChildren(...skeletons(2));
    try {
      const data = await api("/chat/messages", { query: { conversationId, limit: 30 } });
      info = { isGroup: !!data.group, other: data.other, group: data.group };
      if (data.peer) {
        peer.lastReadMessageId = data.peer.lastReadMessageId;
        peer.lastActiveAt = data.peer.lastActiveAt;
      }
      subEl = h("span", { class: "chat-sub" });
      const back = h("a", { class: "btn ghost icon", href: "#/messages", "aria-label": "Back to messages" }, icon("back", 24));
      if (info.isGroup) {
        head.replaceChildren(back,
          h("button", { class: "who who-btn", type: "button", onclick: openGroupInfo }, groupAvatar(40),
            h("span", { class: "who-text" }, h("span", { class: "who-name" }, info.group.name), subEl)),
          h("button", { class: "btn ghost icon", type: "button", "aria-label": "Group info", onclick: openGroupInfo }, icon("users", 22)));
        composerBox.hidden = false;
        document.title = `${info.group.name} — ${CONFIG.FULL_NAME}`;
      } else {
        const other = info.other;
        head.replaceChildren(back,
          h("a", { class: "who", href: `#/u/${other.id}` }, avatar(other.displayName, other.avatarUrl, 40, { userId: other.id }),
            h("span", { class: "who-text" }, h("span", { class: "who-name" }, other.displayName), subEl)),
          h("button", { class: "btn ghost icon", type: "button", "aria-label": `Call ${other.displayName}`, onclick: () => calls.start(conversationId, other) }, icon("phone", 22)));
        presence.watch(other.id, (online) => {
          if (!online) peer.lastActiveAt = new Date();
          renderStatus(); paintAllTicks();
        });
        document.title = `${other.displayName} — ${CONFIG.FULL_NAME}`;
      }
      renderStatus();
      list.replaceChildren();
      entries.clear();
      data.messages.forEach(addMessage);
      nextCursor = data.nextCursor;
      olderBtn.hidden = !nextCursor;
      scrollToBottom();
      markRead();
    } catch (e) {
      head.replaceChildren(h("a", { class: "btn ghost icon", href: "#/messages", "aria-label": "Back to messages" }, icon("back", 24)));
      list.replaceChildren(stateBox(e.message, h("a", { class: "btn outline sm", href: "#/messages" }, "Back to messages")));
      composerBox.hidden = true;
    }
  }

  olderBtn.addEventListener("click", async () => {
    olderBtn.disabled = true;
    try {
      const before = scroller.scrollHeight;
      const data = await api("/chat/messages", { query: { conversationId, before: nextCursor, limit: 30 } });
      const fresh = data.messages.filter((m) => !entries.has(m.id));
      list.prepend(...fresh.map(bubble));
      nextCursor = data.nextCursor;
      olderBtn.hidden = !nextCursor;
      scroller.scrollTop += scroller.scrollHeight - before;
    } catch (e) {
      toast(e.message, "error");
    } finally {
      olderBtn.disabled = false;
    }
  });

  let sending = false;
  async function send() {
    const body = input.value.trim();
    const a = att.value;
    if ((!body && !a) || sending || att.busy) return;
    sending = true;
    sendBtn.disabled = true;
    input.disabled = true;
    att.setDisabled(true);
    clearTimeout(typingOffTimer);
    if (typingOn) sendTyping(false);
    try {
      const payload = { conversationId, body };
      if (replyTo) payload.replyToId = replyTo.id;
      if (a) {
        input.placeholder = "Uploading 0%";
        const url = await uploadFile(a.kind === "image" ? "chat_image" : "chat_video", a.file,
          (p) => { input.placeholder = `Uploading ${Math.round(p * 100)}%`; });
        payload.mediaUrl = url;
        payload.mediaType = a.kind;
        if (a.kind === "video") payload.mediaSeconds = a.seconds;
      }
      const r = await api("/chat/send", { method: "POST", body: payload });
      input.value = "";
      att.clear(true);
      clearReply();
      addMessage(r.message);
      scrollToBottom();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      sending = false;
      input.disabled = false;
      input.placeholder = "Message…";
      att.setDisabled(false);
      refreshSend();
      input.focus({ preventScroll: true });
    }
  }

  live.thread = {
    conversationId,
    onMessage(m) {
      const stick = nearBottom() || m.senderId === me;
      const t = typingUsers.get(m.senderId);
      if (t) { clearTimeout(t.timer); typingUsers.delete(m.senderId); renderTyping(); }
      if (!addMessage(m)) return;
      if (m.senderId !== me) markRead();
      if (stick) scrollToBottom();
    },
    onEvent(ev) {
      if (ev.type === "typing") {
        if (ev.userId === me) return;
        const prev = typingUsers.get(ev.userId);
        if (prev) clearTimeout(prev.timer);
        if (ev.typing) {
          const timer = setTimeout(() => { typingUsers.delete(ev.userId); renderTyping(); }, 5000);
          typingUsers.set(ev.userId, { name: ev.name || "Someone", timer });
        } else {
          typingUsers.delete(ev.userId);
        }
        renderTyping();
      } else if (ev.type === "delivered") {
        deliveredUpTo = Math.max(deliveredUpTo, ev.upToId);
        paintAllTicks();
      } else if (ev.type === "read") {
        if (info.isGroup) return;
        peer.lastReadMessageId = Math.max(peer.lastReadMessageId, ev.lastReadMessageId);
        deliveredUpTo = Math.max(deliveredUpTo, ev.lastReadMessageId);
        paintAllTicks();
      } else if (ev.type === "deleted") {
        applyDeleted(ev.messageId);
      }
    },
    async resync() {
      try {
        const data = await api("/chat/messages", { query: { conversationId, limit: 30 }, quiet: true });
        data.messages.forEach((m) => { if (!addMessage(m) && m.deletedAt && !entries.get(m.id).m.deletedAt) replaceMessage(m); });
        if (data.peer) { peer.lastReadMessageId = Math.max(peer.lastReadMessageId, data.peer.lastReadMessageId); paintAllTicks(); }
      } catch { /* try again on the next reconnect */ }
    },
  };

  open();
  return root;
}

/* ====================== voice calls (WebRTC) ====================== */
// Two people in a one-to-one chat. The "signalling" (who's calling, the connection details)
// travels through the backend's live channel; the audio itself goes phone to phone.
const calls = {
  current: null,
  ice: null,
  audioCtx: null,
  ringTimer: null,

  async loadIce() {
    if (this.ice) return this.ice;
    try { this.ice = await api("/call/ice", { quiet: true }); }
    catch { this.ice = { iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }], hasRelay: false }; }
    return this.ice;
  },

  sendSignal(conversationId, callId, kind, data) {
    return api("/call/signal", { method: "POST", body: { conversationId, callId, kind, data }, quiet: true }).catch(() => {});
  },
  signal(kind, data) {
    const c = this.current;
    if (c) this.sendSignal(c.conversationId, c.id, kind, data);
  },

  supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); },

  async getMic() {
    try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { return null; }
  },

  /* ----- start a call ----- */
  async start(conversationId, other) {
    if (this.current) { toast("You're already in a call."); return; }
    if (!this.supported()) { toast("Calls aren't supported on this browser.", "error"); return; }
    const id = "call" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const c = this.current = { id, conversationId, peer: other, role: "caller", state: "calling", pc: null, stream: null, queued: [], startedAt: 0, mute: false };
    this.showUi();
    const stream = await this.getMic();
    if (this.current !== c) { if (stream) stream.getTracks().forEach((t) => t.stop()); return; }
    if (!stream) { this.finish("Allow microphone access to make calls.", { signal: false }); return; }
    c.stream = stream;
    await this.loadIce();
    if (this.current !== c) return;
    this.signal("ring");
    c.state = "ringing";
    this.updateUi();
    this.startTone("ringback");
    this.ringTimer = setTimeout(() => this.finish("No answer", { signal: true }), 45000);
  },

  /* ----- incoming signals ----- */
  async onSignal(ev) {
    const c = this.current;
    if (ev.kind === "ring") {
      if (c) { this.sendSignal(ev.conversationId, ev.callId, "busy"); return; }
      if (!this.supported()) { this.sendSignal(ev.conversationId, ev.callId, "decline"); return; }
      this.current = { id: ev.callId, conversationId: ev.conversationId, peer: ev.from, role: "callee", state: "incoming", pc: null, stream: null, queued: [], startedAt: 0, mute: false };
      this.showUi();
      this.startTone("ring");
      this.ringTimer = setTimeout(() => this.finish("Missed call", { signal: false }), 50000);
      return;
    }
    if (!c || c.id !== ev.callId) return;
    switch (ev.kind) {
      case "accept":
        if (c.role === "caller" && c.stream) { clearTimeout(this.ringTimer); this.stopTone(); c.state = "connecting"; this.updateUi(); await this.makeOffer(); }
        break;
      case "offer":
        if (c.role === "callee" && c.stream) await this.handleOffer(ev.data);
        break;
      case "answer":
        if (c.pc && ev.data) {
          try { await c.pc.setRemoteDescription(ev.data); await this.flushIce(); } catch { this.finish("Couldn't connect the call.", { signal: true }); }
        }
        break;
      case "ice":
        if (!ev.data) break;
        if (c.pc && c.pc.remoteDescription) { try { await c.pc.addIceCandidate(ev.data); } catch { /* ignore a bad candidate */ } }
        else c.queued.push(ev.data);
        break;
      case "decline": this.finish("Call declined", { signal: false }); break;
      case "busy": this.finish("They're on another call", { signal: false }); break;
      case "end": this.finish(c.state === "connected" ? "Call ended" : (c.role === "callee" ? "Missed call" : "Call ended"), { signal: false }); break;
    }
  },

  /* ----- answering ----- */
  async accept() {
    const c = this.current;
    if (!c || c.role !== "callee" || c.state !== "incoming") return;
    clearTimeout(this.ringTimer);
    this.stopTone();
    c.state = "connecting";
    this.updateUi();
    await this.loadIce();
    const stream = await this.getMic();
    if (this.current !== c) { if (stream) stream.getTracks().forEach((t) => t.stop()); return; }
    if (!stream) { this.finish("Allow microphone access to answer calls.", { signal: true, kind: "decline" }); return; }
    c.stream = stream;
    this.signal("accept");
  },
  decline() {
    if (!this.current) return;
    this.finish("Call declined", { signal: true, kind: "decline" });
  },

  /* ----- the audio connection ----- */
  createPc() {
    const c = this.current;
    const pc = new RTCPeerConnection({ iceServers: (this.ice && this.ice.iceServers) || [{ urls: ["stun:stun.l.google.com:19302"] }] });
    c.pc = pc;
    c.stream.getTracks().forEach((t) => pc.addTrack(t, c.stream));
    pc.onicecandidate = (e) => { if (e.candidate && this.current === c) this.signal("ice", e.candidate.toJSON()); };
    pc.ontrack = (e) => {
      const audio = this.ui && this.ui.audio;
      if (audio) { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); }
    };
    let dropTimer = null;
    pc.onconnectionstatechange = () => {
      if (this.current !== c) return;
      const st = pc.connectionState;
      if (st === "connected") {
        clearTimeout(dropTimer);
        if (c.state !== "connected") { c.state = "connected"; c.startedAt = Date.now(); this.updateUi(); this.startClock(); }
      } else if (st === "failed") {
        const hint = this.ice && !this.ice.hasRelay ? " This can happen on some mobile networks — try Wi‑Fi." : "";
        this.finish("Couldn't connect." + hint, { signal: true });
      } else if (st === "disconnected") {
        clearTimeout(dropTimer);
        dropTimer = setTimeout(() => { if (this.current === c && pc.connectionState !== "connected") this.finish("Connection lost", { signal: true }); }, 10000);
      }
    };
    return pc;
  },
  async makeOffer() {
    const c = this.current;
    try {
      const pc = this.createPc();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signal("offer", { type: offer.type, sdp: offer.sdp });
      // if nothing connects, don't hang forever
      setTimeout(() => { if (this.current === c && c.state === "connecting") this.finish("Couldn't connect. Try on Wi‑Fi.", { signal: true }); }, 30000);
    } catch { this.finish("Couldn't start the call.", { signal: true }); }
  },
  async handleOffer(offer) {
    const c = this.current;
    try {
      const pc = this.createPc();
      await pc.setRemoteDescription(offer);
      await this.flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signal("answer", { type: answer.type, sdp: answer.sdp });
      setTimeout(() => { if (this.current === c && c.state === "connecting") this.finish("Couldn't connect. Try on Wi‑Fi.", { signal: true }); }, 30000);
    } catch { this.finish("Couldn't answer the call.", { signal: true }); }
  },
  async flushIce() {
    const c = this.current;
    if (!c || !c.pc) return;
    const queued = c.queued.splice(0);
    for (const cand of queued) { try { await c.pc.addIceCandidate(cand); } catch { /* ignore */ } }
  },

  /* ----- ending ----- */
  end() {
    if (!this.current) return;
    const connected = this.current.state === "connected";
    this.finish(connected ? "Call ended" : "Call cancelled", { signal: true });
  },
  finish(message, { signal = false, kind = "end" } = {}) {
    const c = this.current;
    if (!c) return;
    if (signal) this.signal(kind);
    clearTimeout(this.ringTimer);
    this.stopTone();
    clearInterval(this.clock);
    const mins = c.startedAt ? Math.floor((Date.now() - c.startedAt) / 1000) : 0;
    try { c.stream && c.stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { c.pc && c.pc.close(); } catch { /* ignore */ }
    this.current = null;
    if (this.ui) { this.ui.root.remove(); this.ui = null; }
    document.body.style.overflow = this.prevOverflow || "";
    toast(c.startedAt ? `${message} · ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}` : message, /Allow|Couldn't/.test(message) ? "error" : "info");
  },

  toggleMute() {
    const c = this.current;
    if (!c || !c.stream) return;
    c.mute = !c.mute;
    c.stream.getAudioTracks().forEach((t) => { t.enabled = !c.mute; });
    this.updateUi();
  },

  /* ----- call screen ----- */
  showUi() {
    const c = this.current;
    const audio = h("audio", { autoplay: true, playsinline: true });
    const name = h("h2", { class: "call-name" }, c.peer.displayName);
    const status = h("p", { class: "call-status", "aria-live": "polite" });
    const actions = h("div", { class: "call-actions" });
    const root = h("div", { class: "call-screen", role: "dialog", "aria-modal": "true", "aria-label": "Voice call" },
      h("div", { class: "call-body" }, avatar(c.peer.displayName, c.peer.avatarUrl, 128), name, status),
      actions, audio);
    this.prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.append(root);
    this.ui = { root, status, actions, audio };
    this.updateUi();
  },
  updateUi() {
    const c = this.current;
    if (!c || !this.ui) return;
    const { status, actions } = this.ui;
    const round = (cls, ico, label, fn) => h("button", { class: `call-btn ${cls}`, type: "button", "aria-label": label, onclick: fn }, icon(ico, 28), h("span", {}, label));
    if (c.state === "incoming") {
      status.textContent = "Incoming voice call…";
      actions.replaceChildren(round("red", "hangup", "Decline", () => this.decline()), round("green", "phone", "Answer", () => this.accept()));
    } else {
      status.textContent = c.state === "calling" ? "Calling…" : c.state === "ringing" ? "Ringing…" : c.state === "connecting" ? "Connecting…" : this.clockText();
      actions.replaceChildren(
        c.state === "connected" || c.state === "connecting" ? round(c.mute ? "on" : "", c.mute ? "micoff" : "mic", c.mute ? "Unmute" : "Mute", () => this.toggleMute()) : null,
        round("red", "hangup", c.state === "connected" ? "End" : "Cancel", () => this.end()));
    }
  },
  clockText() {
    const c = this.current;
    const s = c && c.startedAt ? Math.floor((Date.now() - c.startedAt) / 1000) : 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  },
  startClock() {
    clearInterval(this.clock);
    this.clock = setInterval(() => { if (this.ui && this.current && this.current.state === "connected") this.ui.status.textContent = this.clockText(); }, 1000);
  },

  /* ----- ring sounds (best effort; phones may keep them silent until you tap) ----- */
  startTone(kind) {
    this.stopTone();
    const beep = () => {
      try {
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = this.audioCtx;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const t0 = ctx.currentTime;
        const pulses = kind === "ring" ? [0, 0.35] : [0];
        for (const off of pulses) {
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = "sine"; osc.frequency.value = kind === "ring" ? 880 : 440;
          gain.gain.setValueAtTime(0.0001, t0 + off);
          gain.gain.exponentialRampToValueAtTime(kind === "ring" ? 0.25 : 0.12, t0 + off + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.28);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0 + off); osc.stop(t0 + off + 0.3);
        }
      } catch { /* no sound available */ }
      if (kind === "ring" && navigator.vibrate) navigator.vibrate([300, 150, 300]);
    };
    beep();
    this.toneTimer = setInterval(beep, kind === "ring" ? 2200 : 3000);
  },
  stopTone() { clearInterval(this.toneTimer); this.toneTimer = null; if (navigator.vibrate) navigator.vibrate(0); },
};

/* ---------- login / sign up ---------- */
function authView() {
  let mode = "login";
  let notice = "";
  let email = "";
  const body = h("div", { class: "auth-body" });
  const root = h("main", { class: "auth" },
    h("div", { class: "auth-card" }, h("div", { class: "banner" }), body));

  function field(name, label, attrs) {
    const input = h("input", { id: `f-${name}`, name, ...attrs });
    return { name, input, node: h("label", { class: "field", for: `f-${name}` }, h("span", {}, label), input) };
  }

  function form({ fields, submit, onSubmit, extra }) {
    const err = h("p", { class: "form-error", role: "alert", hidden: true });
    const btn = h("button", { class: "btn primary block", type: "submit" }, submit);
    return h("form", {
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        err.hidden = true;
        btn.disabled = true;
        btn.textContent = "Please wait…";
        try {
          await onSubmit(Object.fromEntries(fields.map((f) => [f.name, f.input.value])));
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
        } finally {
          btn.disabled = false;
          btn.textContent = submit;
        }
      },
    }, err, fields.map((f) => f.node), extra || null, btn);
  }

  function go(next, msg = "") { mode = next; notice = msg; draw(); }
  const link = (text, next) => h("button", { class: "linkish", type: "button", onclick: () => go(next) }, text);

  function loginForm() {
    return form({
      fields: [
        field("email", "Email", { type: "email", autocomplete: "email", placeholder: "you@example.com", value: email }),
        field("password", "Password", { type: "password", autocomplete: "current-password" }),
      ],
      submit: "Log in",
      extra: h("div", { class: "auth-foot" }, link("Forgot password?", "forgot")),
      onSubmit: async (v) => {
        email = v.email.trim();
        if (!email || !v.password) throw new Error("Enter your email and password.");
        const data = await api("/auth/login_with_password", { method: "POST", auth: false, body: { email, password: v.password } });
        setSession(data.token, data.user);
        location.hash = "#/";
      },
    });
  }

  function registerForm() {
    return form({
      fields: [
        field("email", "Email", { type: "email", autocomplete: "email", placeholder: "you@example.com", value: email }),
        field("displayName", "Name", { autocomplete: "name", maxlength: "50" }),
        field("password", "Password", { type: "password", autocomplete: "new-password", placeholder: "At least 8 characters" }),
      ],
      submit: "Create account",
      onSubmit: async (v) => {
        email = v.email.trim();
        if (!email) throw new Error("Enter your email.");
        if (!v.displayName.trim()) throw new Error("Enter your name.");
        if (v.password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const data = await api("/auth/register_with_password", {
          method: "POST", auth: false,
          body: { email, displayName: v.displayName.trim(), password: v.password },
        });
        if (!data.token) throw new Error("Account created. Log in to continue.");
        setSession(data.token, data.user);
        const ref = Number(store.get("fabdia_ref"));
        store.del("fabdia_ref");
        if (Number.isInteger(ref) && ref > 0 && ref !== data.user.id) {
          toast("Welcome to Fabdia! Follow the friend who invited you to get started.");
          location.hash = `#/u/${ref}`;
        } else {
          location.hash = "#/";
        }
      },
    });
  }

  function forgotForm() {
    return form({
      fields: [field("email", "Email", { type: "email", autocomplete: "email", value: email })],
      submit: "Send reset code",
      extra: h("div", { class: "auth-foot" }, link("Back to log in", "login")),
      onSubmit: async (v) => {
        email = v.email.trim();
        if (!email) throw new Error("Enter your email.");
        await api("/auth/request_password_reset", { method: "POST", auth: false, body: { email } });
        go("reset", "If that email has an account, a code is on its way.");
      },
    });
  }

  function resetForm() {
    return form({
      fields: [
        field("email", "Email", { type: "email", autocomplete: "email", value: email }),
        field("code", "Code from the email", { autocomplete: "one-time-code" }),
        field("newPassword", "New password", { type: "password", autocomplete: "new-password", placeholder: "At least 8 characters" }),
      ],
      submit: "Set new password",
      extra: h("div", { class: "auth-foot" }, link("Back to log in", "login")),
      onSubmit: async (v) => {
        email = v.email.trim();
        if (v.newPassword.length < 8) throw new Error("Use at least 8 characters for your password.");
        await api("/auth/reset_password", { method: "POST", auth: false, body: { email, code: v.code.trim(), newPassword: v.newPassword } });
        go("login", "Password updated. Log in with your new password.");
      },
    });
  }

  function draw() {
    const titles = { login: "Welcome back", register: "Create your account", forgot: "Reset your password", reset: "Enter your code" };
    document.title = `${titles[mode]} — ${CONFIG.FULL_NAME}`;
    const forms = { login: loginForm, register: registerForm, forgot: forgotForm, reset: resetForm };
    body.replaceChildren(...[
      h("img", { class: "auth-mark", src: "icons/icon-192.png", alt: CONFIG.FULL_NAME, width: "76", height: "76" }),
      h("h1", { class: "auth-name" }, CONFIG.FULL_NAME),
      h("p", { class: "tagline" }, titles[mode]),
      notice ? h("p", { class: "form-notice", role: "status" }, notice) : null,
      forms[mode](),
      mode === "login"
        ? h("div", { class: "auth-foot" }, h("span", { class: "muted" }, "New here?"), link("Create an account", "register"))
        : mode === "register"
          ? h("div", { class: "auth-foot" }, h("span", { class: "muted" }, "Have an account?"), link("Log in", "login"))
          : null,
      h("div", { class: "auth-foot" }, h("a", { class: "linkish", href: "#/" }, "Browse without an account"), installButton("soft sm"))].filter(Boolean));
  }

  draw();
  return root;
}

/* ====================== store (buy and sell, chat on WhatsApp) ====================== */
const STORE_CATEGORIES = [
  { key: "all", label: "All" },
  { key: "restaurant", label: "Restaurant" },
  { key: "products", label: "Products" },
];

function formatNaira(n) { return "₦" + Number(n).toLocaleString("en-NG"); }

// The buyer taps this and lands in a WhatsApp chat with the seller, with the message already typed.
function whatsappLink(p) {
  if (!/^\d{8,15}$/.test(p.whatsapp || "")) return null;
  const price = p.priceNgn != null ? ` (${formatNaira(p.priceNgn)})` : "";
  const text = `Hi, I saw "${p.title}"${price} on ${CONFIG.FULL_NAME}. Is it still available?`;
  return `https://wa.me/${p.whatsapp}?text=${encodeURIComponent(text)}`;
}

// Full view of one item: the photo fits inside the screen (never cropped), then every detail and the WhatsApp button.
function openProductDetail(p) {
  const url = resolveMedia(p.imageUrl);
  const link = p.isAvailable ? whatsappLink(p) : null;
  const photo = url
    ? h("button", { class: "pd-photo", type: "button", "aria-label": "View photo full screen", onclick: () => openLightbox(url) },
        h("img", { src: url, alt: p.title }))
    : h("div", { class: "pd-photo ph", "aria-hidden": "true" }, p.category === "restaurant" ? "🍲" : "🛍️");
  const dialog = h("dialog", { class: "sheet product-detail", "aria-label": p.title },
    h("div", { class: "sheet-head" },
      h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20)),
      h("h2", { class: "sheet-title" }, p.category === "restaurant" ? "Restaurant" : "Product"), h("span", { style: "width:36px" })),
    photo,
    h("div", { class: "sheet-body pd-body" },
      p.isAvailable ? null : h("p", { class: "pd-sold" }, "Sold out"),
      h("h3", { class: "pd-title" }, p.title),
      h("p", { class: "product-price pd-price" }, p.priceNgn != null ? formatNaira(p.priceNgn) : "Contact for price"),
      p.location ? h("p", { class: "muted" }, "📍 " + p.location) : null,
      p.description ? h("p", { class: "pd-desc" }, linkify(p.description)) : null,
      h("a", { class: "product-seller pd-seller", href: `#/u/${p.seller.id}`, onclick: () => dialog.close() },
        avatar(p.seller.displayName, p.seller.avatarUrl, 34), h("span", {}, `Sold by ${p.seller.displayName}`)),
      link
        ? h("a", { class: "btn wa block", href: link, target: "_blank", rel: "noopener noreferrer" }, icon("message", 18), "Chat on WhatsApp")
        : h("span", { class: "btn outline block disabled-look" }, p.isAvailable ? "No contact" : "Sold out")));
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
}

function productCard(p, { onChanged }) {
  const mine = state.user && (state.user.id === p.seller.id || state.user.role === "admin");
  const img = p.imageUrl
    ? h("img", { src: resolveMedia(p.imageUrl), alt: p.title, loading: "lazy" })
    : h("span", { class: "product-ph" }, p.category === "restaurant" ? "🍲" : "🛍️");
  if (p.imageUrl) img.addEventListener("error", () => img.replaceWith(h("span", { class: "product-ph" }, "🛍️")));
  const link = p.isAvailable ? whatsappLink(p) : null;

  const manage = mine ? h("div", { class: "product-manage" },
    h("button", { class: "btn ghost sm", type: "button", onclick: async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { await api("/store/availability", { method: "POST", body: { productId: p.id, isAvailable: !p.isAvailable } }); onChanged(); }
      catch (err) { toast(err.message, "error"); btn.disabled = false; }
    } }, p.isAvailable ? "Mark sold out" : "Mark available"),
    h("button", { class: "btn ghost sm", type: "button", onclick: async (e) => {
      if (!confirm("Remove this item from the store?")) return;
      const btn = e.currentTarget; btn.disabled = true;
      try { await api("/store/delete", { method: "POST", body: { productId: p.id } }); toast("Item removed"); onChanged(); }
      catch (err) { toast(err.message, "error"); btn.disabled = false; }
    } }, icon("trash", 16), "Remove")) : null;

  const details = () => openProductDetail(p);
  return h("article", { class: `product ${p.isAvailable ? "" : "soldout"}` },
    h("div", { class: "product-img tappable", role: "button", tabindex: "0", "aria-label": `View ${p.title}`, onclick: details,
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); details(); } } }, img,
      h("span", { class: "product-tag" }, p.category === "restaurant" ? "Restaurant" : "Product"),
      p.isAvailable ? null : h("span", { class: "product-sold" }, "Sold out")),
    h("div", { class: "product-body" },
      h("h3", { class: "product-title tappable", onclick: details }, p.title),
      h("p", { class: "product-price" }, p.priceNgn != null ? formatNaira(p.priceNgn) : "Contact for price"),
      p.location ? h("p", { class: "muted small product-loc" }, "📍 " + p.location) : null,
      p.description ? h("p", { class: "product-desc" }, linkify(p.description)) : null,
      h("a", { class: "product-seller", href: `#/u/${p.seller.id}` },
        avatar(p.seller.displayName, p.seller.avatarUrl, 22), h("span", {}, p.seller.displayName)),
      link
        ? h("a", { class: "btn wa block", href: link, target: "_blank", rel: "noopener noreferrer" }, icon("message", 18), "Chat on WhatsApp")
        : h("span", { class: "btn outline block disabled-look" }, p.isAvailable ? "No contact" : "Sold out"),
      manage));
}

function openSellDialog(onDone) {
  let uploading = false;
  let category = "restaurant";
  let photo = null;
  const catBtns = [["restaurant", "Restaurant"], ["products", "Product"]].map(([key, label]) =>
    h("button", { type: "button", class: "seg", "data-key": key, onclick: () => { category = key; paintCat(); } }, label));
  function paintCat() { catBtns.forEach((b) => b.classList.toggle("active", b.dataset.key === category)); }
  paintCat();

  const title = h("input", { type: "text", maxlength: "80", placeholder: "What are you selling? (e.g. Jollof rice and chicken)", "aria-label": "Item name", required: true });
  const price = h("input", { type: "text", inputmode: "numeric", maxlength: "10", placeholder: "Price in ₦ (leave empty for 'contact for price')", "aria-label": "Price in naira" });
  const description = h("textarea", { rows: "3", maxlength: "500", placeholder: "Details: size, flavour, delivery, how to order…", "aria-label": "Description" });
  const location = h("input", { type: "text", maxlength: "80", placeholder: "Where? (e.g. UNIOSUN campus, Osogbo)", "aria-label": "Location" });
  const whatsapp = h("input", { type: "tel", maxlength: "20", placeholder: "Your WhatsApp number, e.g. 0801 234 5678", "aria-label": "WhatsApp number", autocomplete: "tel", value: store.get("fabdia_wa") || "" });

  const preview = h("div", { class: "sell-photo", hidden: true });
  const photoInput = h("input", { type: "file", accept: "image/*", hidden: true });
  const photoBtn = h("button", { class: "btn outline sm", type: "button", onclick: () => photoInput.click() }, icon("image", 16), "Add photo");
  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0]; photoInput.value = "";
    if (!file) return;
    try {
      if (!isImageFile(file)) throw new UserError("Choose a photo.");
      const a = await inspectImage(file, { max: 1280 });
      photo = a.file;
      preview.replaceChildren(
        h("img", { src: URL.createObjectURL(photo), alt: "Item photo" }),
        h("button", { class: "btn ghost icon sm sell-photo-x", type: "button", "aria-label": "Remove photo", onclick: () => { photo = null; preview.hidden = true; photoBtn.lastChild.textContent = "Add photo"; } }, icon("x", 18)));
      preview.hidden = false;
      photoBtn.lastChild.textContent = "Change photo";
    } catch (e) { toast(e.message, "error"); }
  });

  const err = h("p", { class: "form-error", role: "alert", hidden: true });
  const postBtn = h("button", { class: "btn primary sm", type: "button" }, "Post");
  const closeBtn = h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20));
  const dialog = h("dialog", { class: "sheet", "aria-label": "Sell something" },
    h("div", { class: "sheet-head" }, closeBtn, h("h2", { class: "sheet-title" }, "Sell something"), postBtn),
    h("div", { class: "sheet-body" },
      h("div", { class: "seg-row" }, catBtns),
      h("label", { class: "field" }, h("span", {}, "Name"), title),
      h("label", { class: "field" }, h("span", {}, "Price (₦)"), price),
      h("label", { class: "field" }, h("span", {}, "Details"), description),
      h("label", { class: "field" }, h("span", {}, "Location"), location),
      h("label", { class: "field" }, h("span", {}, "WhatsApp number (buyers contact you here)"), whatsapp),
      preview, h("div", {}, photoBtn, photoInput), err));

  dialog.addEventListener("cancel", (e) => { if (uploading) e.preventDefault(); });
  dialog.addEventListener("close", () => dialog.remove());

  postBtn.addEventListener("click", async () => {
    err.hidden = true;
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (title.value.trim().length < 2) return fail("Give the item a name.");
    if (!whatsapp.value.trim()) return fail("Add your WhatsApp number so buyers can reach you.");
    const priceText = price.value.replace(/[,\s₦]/g, "");
    if (priceText && !/^\d{1,10}$/.test(priceText)) return fail("Price should be numbers only, like 2500.");
    uploading = true; postBtn.disabled = closeBtn.disabled = true;
    try {
      let imageUrl = null;
      if (photo) {
        postBtn.textContent = "0%";
        imageUrl = await uploadFile("product_image", photo, (p) => { postBtn.textContent = `${Math.round(p * 100)}%`; });
      }
      postBtn.textContent = "Posting…";
      await api("/store/create", { method: "POST", body: {
        category, title: title.value.trim(), description: description.value.trim(),
        priceNgn: priceText ? Number(priceText) : null, imageUrl,
        whatsapp: whatsapp.value.trim(), location: location.value.trim() || null,
      } });
      store.set("fabdia_wa", whatsapp.value.trim());
      uploading = false;
      dialog.close();
      toast("Your item is in the store");
      if (onDone) onDone();
    } catch (e) {
      fail(e.message);
    } finally {
      uploading = false; postBtn.disabled = closeBtn.disabled = false; postBtn.textContent = "Post";
    }
  });

  document.body.append(dialog);
  dialog.showModal();
}

function storeView() {
  const root = h("div", { class: "pad stack" });
  let category = "all";
  let q = "";
  let cursor = null;
  let items = [];

  const search = h("input", { type: "search", placeholder: "Search food, items or places", "aria-label": "Search the store", maxlength: "60" });
  const chips = h("div", { class: "chips", role: "tablist" }, STORE_CATEGORIES.map((c) =>
    h("button", { type: "button", role: "tab", class: "chip", "data-key": c.key, onclick: () => { category = c.key; paintChips(); load(true); } }, c.label)));
  function paintChips() { chips.querySelectorAll(".chip").forEach((b) => b.classList.toggle("active", b.dataset.key === category)); }
  paintChips();

  const grid = h("div", { class: "store-grid" });
  const more = h("button", { class: "btn outline block", type: "button", hidden: true, onclick: () => load(false) }, "Show more");
  const sellBtn = h("button", { class: "btn primary sm", type: "button", onclick: () => openSellDialog(() => load(true)) }, icon("plus", 16), "Sell");

  root.append(
    h("div", { class: "friends-head" }, h("h1", { class: "page-title" }, "Store"), sellBtn),
    h("p", { class: "muted small" }, "Buy and sell food and products. Tap Chat on WhatsApp to talk to the seller directly. Always agree on price and delivery before you pay."),
    search, chips, grid, more);

  let timer = null;
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); load(true); }, 350); });

  async function load(reset) {
    if (reset) { cursor = null; items = []; grid.replaceChildren(...skeletons(4)); more.hidden = true; }
    more.disabled = true;
    try {
      const data = await api("/store/list", { query: { category: category === "all" ? undefined : category, q: q || undefined, before: cursor || undefined } });
      items = items.concat(data.products);
      cursor = data.nextCursor;
      if (!items.length) {
        grid.replaceChildren(stateBox(q || category !== "all" ? "Nothing found. Try another search." : "No items yet. Be the first to sell something!",
          h("button", { class: "btn primary sm", type: "button", onclick: () => openSellDialog(() => load(true)) }, "Sell something")));
      } else {
        grid.replaceChildren(...items.map((p) => productCard(p, { onChanged: () => load(true) })));
      }
      more.hidden = !cursor;
    } catch (e) {
      grid.replaceChildren(stateBox(e.message, h("button", { class: "btn outline sm", type: "button", onclick: () => load(true) }, "Try again")));
    } finally { more.disabled = false; }
  }

  load(true);
  return root;
}

function notFoundView() {
  return h("div", { class: "pad" }, stateBox("That page doesn't exist.", h("a", { class: "btn outline sm", href: "#/" }, "Back home")));
}

/* ====================== update screen ====================== */
// version.json is always fetched fresh from the network. When its version differs from the one this
// copy of the app was built with, a full-screen page asks the person to update once, then reloads.
let lastUpdateCheck = 0;
async function checkForUpdate() {
  if (document.querySelector(".update-gate")) return;
  lastUpdateCheck = Date.now();
  let latest;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    latest = await res.json();
  } catch { return; } // offline: carry on with what we have
  const target = latest && latest.version ? String(latest.version) : null;
  if (!target || target === CONFIG.VERSION) return;
  // if we just tried to update to this version, don't trap anyone in a loop
  const tried = (store.get("fabdia_update_tried") || "").split(":");
  if (tried[0] === target && Date.now() - Number(tried[1] || 0) < 120000) return;
  showUpdateGate(target, latest.notes);
}

function showUpdateGate(target, notes) {
  const btn = h("button", { class: "btn primary block", type: "button" }, icon("download", 18), "Update now");
  const msg = h("p", { class: "muted small", hidden: true });
  const gate = h("div", { class: "update-gate", role: "alertdialog", "aria-modal": "true", "aria-label": "Update available" },
    h("div", { class: "update-card" },
      h("img", { src: "icons/icon-192.png", alt: "", width: "72", height: "72" }),
      h("h1", {}, "New version available"),
      h("p", {}, `${CONFIG.FULL_NAME} has been upgraded. Tap the button once to get the latest version and come back in.`),
      notes ? h("p", { class: "update-notes" }, String(notes)) : null,
      btn, msg,
      h("p", { class: "muted small" }, `Your version ${CONFIG.VERSION} → new version ${target}`)));
  const appRoot = document.getElementById("app");
  if (appRoot) appRoot.inert = true;
  document.body.append(gate);

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.replaceChildren("Updating…");
    store.set("fabdia_update_tried", `${target}:${Date.now()}`);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* reloading below still fetches fresh files */ }
    location.reload();
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastUpdateCheck > 60000) checkForUpdate();
});

/* ====================== games ====================== */
const GAMES = {
  tictactoe: { name: "Tic-Tac-Toe", emoji: "✕ ◯", blurb: "Get three in a row. You take turns." },
  connect4: { name: "Connect Four", emoji: "🔴🟡", blurb: "Drop discs and line up four before your friend does." },
  rps: { name: "Rock Paper Scissors", emoji: "✊✋✌️", blurb: "Both pick at once. First to win 2 rounds wins." },
};
const RPS_ICON = { rock: "✊", paper: "✋", scissors: "✌️" };

function resetsIn(weekEnd) {
  const ms = Math.max(0, new Date(weekEnd).getTime() - Date.now());
  const d = Math.floor(ms / 86400000);
  const hr = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d}d ${hr}h` : `${hr}h`;
}

function gameOutcome(g) {
  if (g.isDraw) return { text: "Draw", points: "+1 point", cls: "draw" };
  if (g.winnerId === state.user.id) return { text: "You won 🎉", points: "+3 points", cls: "won" };
  return { text: "You lost", points: "0 points", cls: "lost" };
}

// Choose one person (friends first, then search everyone).
function pickPersonDialog({ title, onPick }) {
  const search = h("input", { type: "search", placeholder: "Search people by name…", "aria-label": "Search people", autocomplete: "off" });
  const results = h("div", { class: "pick-results" });
  const dialog = h("dialog", { class: "sheet", "aria-label": title },
    h("div", { class: "sheet-head" },
      h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20)),
      h("h2", { class: "sheet-title" }, title), h("span", { style: "width:36px" })),
    h("div", { class: "sheet-body" }, search, results));
  let friends = [], timer = null, seq = 0;
  function draw(users, label) {
    results.replaceChildren(
      label ? h("p", { class: "muted small pick-label" }, label) : null,
      ...(users.length ? users.map((u) => h("button", { class: "pick-row", type: "button", onclick: () => { dialog.close(); onPick(u); } },
        avatar(u.displayName, u.avatarUrl, 38, { userId: u.id }),
        h("span", { class: "pick-name" }, u.displayName)))
        : [h("p", { class: "muted small" }, label === "Your friends" ? "No friends yet. Type a name to search everyone." : "No one found.")]));
  }
  search.addEventListener("input", () => {
    clearTimeout(timer);
    const q = search.value.trim();
    if (!q) { draw(friends, "Your friends"); return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const data = await api("/users/search", { query: { q }, quiet: true });
        if (mine === seq) draw(data.users, "People");
      } catch { /* keep the list as it was */ }
    }, 250);
  });
  (async () => {
    try { friends = (await api("/friends/list", { quiet: true })).friends; } catch { friends = []; }
    if (!search.value.trim()) draw(friends, "Your friends");
  })();
  draw([], "");
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

async function sendChallenge(kind, user) {
  try {
    const r = await api("/games/challenge", { method: "POST", body: { opponentId: user.id, kind } });
    toast(`Challenge sent to ${user.displayName}`);
    location.hash = `#/games/${r.gameId}`;
  } catch (e) { toast(e.message, "error"); }
}

function startChallenge(kind) {
  pickPersonDialog({ title: `Challenge to ${GAMES[kind].name}`, onPick: (u) => sendChallenge(kind, u) });
}

async function respondToGame(gameId, action) {
  try {
    await api("/games/respond", { method: "POST", body: { gameId, action } });
    return true;
  } catch (e) { toast(e.message, "error"); return false; }
}

function friendGamesView() {
  const root = h("div", { class: "stack games-page" });
  const mine = h("div", { class: "stack" });
  const board = h("div");
  root.append(
    h("p", { class: "muted" }, "Challenge a friend, win games and climb the weekly leaderboard."),
    h("section", { class: "game-picker", "aria-label": "Start a game" },
      Object.entries(GAMES).map(([kind, g]) =>
        h("button", { class: "game-card", type: "button", onclick: () => startChallenge(kind) },
          h("span", { class: "game-emoji", "aria-hidden": "true" }, g.emoji),
          h("span", { class: "game-card-text" }, h("strong", {}, g.name), h("span", { class: "muted small" }, g.blurb)),
          h("span", { class: "game-go" }, "Challenge")))),
    mine,
    board);

  function row(g) {
    const info = GAMES[g.kind];
    let sub = "", actions = [], cls = "";
    if (g.status === "pending") {
      if (g.incoming) {
        sub = `${g.opponent.displayName} challenged you`;
        actions = [
          h("button", { class: "btn primary sm", type: "button", onclick: async () => { if (await respondToGame(g.id, "accept")) location.hash = `#/games/${g.id}`; } }, "Accept"),
          h("button", { class: "btn outline sm", type: "button", onclick: async () => { if (await respondToGame(g.id, "decline")) reload(); } }, "Decline")];
        cls = "turn";
      } else {
        sub = `Waiting for ${g.opponent.displayName} to accept`;
        actions = [h("button", { class: "btn ghost sm", type: "button", onclick: async () => { if (await respondToGame(g.id, "cancel")) reload(); } }, "Cancel")];
      }
    } else if (g.status === "active") {
      sub = g.yourTurn ? "Your turn" : `Waiting for ${g.opponent.displayName}`;
      if (g.yourTurn) cls = "turn";
    } else {
      const o = gameOutcome(g);
      sub = `${o.text} · ${o.points}`;
      cls = o.cls;
    }
    return h("div", { class: `game-row ${cls}` },
      h("a", { class: "game-row-main", href: `#/games/${g.id}` },
        avatar(g.opponent.displayName, g.opponent.avatarUrl, 44, { userId: g.opponent.id }),
        h("span", { class: "game-row-text" },
          h("strong", {}, `${info.name} · ${g.opponent.displayName}`),
          h("span", { class: "muted small" }, sub))),
      actions.length ? h("div", { class: "game-row-actions" }, actions) : null);
  }

  function section(title, games) {
    if (!games.length) return null;
    return h("section", { class: "stack" }, h("h2", { class: "section-title" }, title),
      h("div", { class: "list-card" }, games.map(row)));
  }

  async function loadMine() {
    try {
      const { games } = await api("/games/list", { quiet: true });
      const incoming = games.filter((g) => g.incoming);
      const turn = games.filter((g) => g.status === "active" && g.yourTurn);
      const waiting = games.filter((g) => (g.status === "active" && !g.yourTurn) || (g.status === "pending" && !g.incoming));
      const finished = games.filter((g) => g.status === "finished");
      const parts = [
        section("Challenges for you", incoming),
        section("Your turn", turn),
        section("Waiting for friends", waiting),
        section("Recently finished", finished),
      ].filter(Boolean);
      mine.replaceChildren(...(parts.length ? parts : [stateBox("No games yet. Tap a game above to challenge a friend.")]));
    } catch (e) {
      mine.replaceChildren(stateBox(e.message, h("button", { class: "btn outline sm", type: "button", onclick: loadMine }, "Try again")));
    }
  }

  async function loadBoard() {
    try {
      const data = await api("/games/leaderboard", { quiet: true });
      const medal = (rank) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : String(rank));
      const lrow = (r) => h("div", { class: `lb-row ${state.user && r.userId === state.user.id ? "me" : ""}` },
        h("span", { class: "lb-rank" }, medal(r.rank)),
        h("a", { class: "lb-who", href: `#/u/${r.userId}` }, avatar(r.displayName, r.avatarUrl, 36), h("span", {}, r.displayName)),
        h("span", { class: "lb-record muted small" }, `${r.wins}W ${r.draws}D ${r.losses}L`),
        h("strong", { class: "lb-points" }, `${r.points}`));
      const inTop = data.me && data.top.some((r) => r.userId === data.me.userId);
      board.replaceChildren(h("section", { class: "stack" },
        h("div", { class: "page-head" }, h("h2", { class: "section-title" }, "🏆 Weekly leaderboard"),
          h("span", { class: "muted small" }, `Resets in ${resetsIn(data.weekEnd)}`)),
        data.top.length
          ? h("div", { class: "list-card lb" }, data.top.map(lrow), data.me && !inTop ? [h("div", { class: "lb-gap" }, "···"), lrow(data.me)] : null)
          : stateBox("No games finished this week yet. Be the first on the board!"),
        h("p", { class: "muted small" }, "Win = 3 points, draw = 1. Only your first 5 games against the same friend each week count.")));
    } catch (e) {
      board.replaceChildren(stateBox(e.message, h("button", { class: "btn outline sm", type: "button", onclick: loadBoard }, "Try again")));
    }
  }

  function reload() { loadMine(); loadBoard(); }
  mine.replaceChildren(...skeletons(2));
  live.games = { reload };
  reload();
  return root;
}

/* ---- game catalog (added from the app by the admin, no redeploy) ---- */
function openGameLink(g) {
  const url = safeUrl(g.url);
  if (!url) { toast("This game link is not valid", "error"); return; }
  api("/games/catalog_open", { method: "POST", body: { id: g.id }, quiet: true }).catch(() => {});
  window.open(url, "_blank", "noopener,noreferrer");
}

function openCatalogDialog(item, onDone) {
  let uploading = false, photo = null, coverUrl = item ? item.coverUrl : null;
  const title = h("input", { type: "text", maxlength: "60", placeholder: "Game name", "aria-label": "Game name", value: item ? item.title : "" });
  const tagline = h("input", { type: "text", maxlength: "120", placeholder: "One short line about it", "aria-label": "Tagline", value: item ? item.tagline : "" });
  const link = h("input", { type: "url", maxlength: "500", placeholder: "https://… link to the game's website", "aria-label": "Game link", value: item ? item.url : "" });
  const category = h("input", { type: "text", maxlength: "24", placeholder: "Category, e.g. Puzzle, Arcade, Quiz", "aria-label": "Category", value: item ? item.category : "Games" });
  const featured = h("input", { type: "checkbox" }); featured.checked = item ? item.featured : false;
  const published = h("input", { type: "checkbox" }); published.checked = item ? item.isPublished : true;
  const preview = h("div", { class: "sell-photo", hidden: !coverUrl });
  const paintPreview = (src) => {
    preview.replaceChildren(h("img", { src, alt: "Cover" }));
    preview.hidden = false;
  };
  if (coverUrl) paintPreview(resolveMedia(coverUrl));
  const fileInput = h("input", { type: "file", accept: "image/*", hidden: true });
  const coverBtn = h("button", { class: "btn outline sm", type: "button", onclick: () => fileInput.click() }, icon("image", 16), coverUrl ? "Change cover image" : "Add cover image");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0]; fileInput.value = "";
    if (!file) return;
    try {
      if (!isImageFile(file)) throw new UserError("Choose an image.");
      const a = await inspectImage(file, { max: 1280 });
      photo = a.file;
      paintPreview(URL.createObjectURL(photo));
      coverBtn.lastChild.textContent = "Change cover image";
    } catch (e) { toast(e.message, "error"); }
  });
  const err = h("p", { class: "form-error", role: "alert", hidden: true });
  const saveBtn = h("button", { class: "btn primary sm", type: "button" }, "Save");
  const closeBtn = h("button", { class: "btn ghost icon sm", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, icon("x", 20));
  const dialog = h("dialog", { class: "sheet", "aria-label": item ? "Edit game" : "Add a game" },
    h("div", { class: "sheet-head" }, closeBtn, h("h2", { class: "sheet-title" }, item ? "Edit game" : "Add a game"), saveBtn),
    h("div", { class: "sheet-body" },
      h("label", { class: "field" }, h("span", {}, "Name"), title),
      h("label", { class: "field" }, h("span", {}, "Tagline"), tagline),
      h("label", { class: "field" }, h("span", {}, "Link (opens in a new tab)"), link),
      h("label", { class: "field" }, h("span", {}, "Category"), category),
      h("label", { class: "check-row" }, featured, h("span", {}, "Feature it at the top")),
      h("label", { class: "check-row" }, published, h("span", {}, "Visible to everyone")),
      preview, h("div", {}, coverBtn, fileInput), err));
  dialog.addEventListener("cancel", (e) => { if (uploading) e.preventDefault(); });
  dialog.addEventListener("close", () => dialog.remove());
  saveBtn.addEventListener("click", async () => {
    err.hidden = true;
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (title.value.trim().length < 2) return fail("Give the game a name.");
    if (!/^https:\/\/\S+\.\S+$/i.test(link.value.trim())) return fail("The link must start with https://");
    uploading = true; saveBtn.disabled = closeBtn.disabled = true;
    try {
      if (photo) {
        saveBtn.textContent = "0%";
        coverUrl = await uploadFile("game_cover", photo, (p) => { saveBtn.textContent = `${Math.round(p * 100)}%`; });
      }
      saveBtn.textContent = "Saving…";
      await api("/games/catalog_save", { method: "POST", body: {
        id: item ? item.id : undefined, title: title.value.trim(), tagline: tagline.value.trim(), coverUrl,
        url: link.value.trim(), category: category.value.trim() || "Games", featured: featured.checked, isPublished: published.checked } });
      uploading = false; dialog.close();
      toast(item ? "Game updated" : "Game added");
      if (onDone) onDone();
    } catch (e) { fail(e.message); }
    finally { uploading = false; saveBtn.disabled = closeBtn.disabled = false; saveBtn.textContent = "Save"; }
  });
  document.body.append(dialog);
  dialog.showModal();
}

function catalogView() {
  const root = h("div", { class: "stack catalog" });
  const body = h("div", { class: "stack" });
  let items = [], isAdmin = false, cat = "All", q = "";
  const search = h("input", { type: "search", class: "cat-search", placeholder: "Search games", "aria-label": "Search games", autocomplete: "off" });
  search.addEventListener("input", () => { q = search.value.trim().toLowerCase(); draw(); });
  const chips = h("div", { class: "chips cat-chips" });
  root.append(search, chips, body);

  const cover = (g, cls) => {
    const src = resolveMedia(g.coverUrl);
    return h("div", { class: `cat-cover ${cls || ""}` },
      src ? h("img", { src, alt: "", loading: "lazy" }) : h("span", { class: "cat-fallback", "aria-hidden": "true" }, (g.title[0] || "?").toUpperCase()));
  };
  const adminBar = (g) => !isAdmin ? null : h("div", { class: "cat-admin" },
    h("button", { class: "btn outline sm", type: "button", onclick: (e) => { e.stopPropagation(); openCatalogDialog(g, load); } }, "Edit"),
    h("button", { class: "btn ghost sm danger-text", type: "button", onclick: async (e) => {
      e.stopPropagation();
      if (await confirmSheet({ title: `Remove ${g.title}?`, text: "It disappears from the Games page for everyone.", confirmLabel: "Remove", danger: true })) {
        try { await api("/games/catalog_delete", { method: "POST", body: { id: g.id } }); toast("Removed"); load(); } catch (er) { toast(er.message, "error"); }
      }
    } }, "Remove"),
    g.isPublished ? null : h("span", { class: "chip hidden-tag" }, "Hidden"));

  const tile = (g) => h("article", { class: "cat-tile" },
    h("button", { class: "cat-open", type: "button", onclick: () => openGameLink(g), "aria-label": `Play ${g.title}` },
      cover(g, "sq"),
      h("strong", { class: "cat-title" }, g.title),
      h("span", { class: "muted small cat-tag" }, g.tagline || g.category)),
    h("div", { class: "cat-foot" }, h("span", { class: "muted small" }, g.plays ? `${g.plays} play${g.plays === 1 ? "" : "s"}` : g.category),
      h("button", { class: "btn primary sm", type: "button", onclick: () => openGameLink(g) }, "Play")),
    adminBar(g));

  const banner = (g) => h("article", { class: "cat-banner" },
    h("button", { class: "cat-open", type: "button", onclick: () => openGameLink(g), "aria-label": `Play ${g.title}` },
      cover(g, "wide"),
      h("div", { class: "cat-banner-text" }, h("strong", {}, g.title), h("span", {}, g.tagline || g.category))),
    adminBar(g));

  function draw() {
    const cats = ["All", ...Array.from(new Set(items.map((g) => g.category)))];
    chips.replaceChildren(...cats.map((c) => h("button", { class: `chip ${c === cat ? "active" : ""}`, type: "button", onclick: () => { cat = c; draw(); } }, c)));
    const shown = items.filter((g) => (cat === "All" || g.category === cat) && (!q || (g.title + " " + g.tagline).toLowerCase().includes(q)));
    const feat = cat === "All" && !q ? shown.filter((g) => g.featured && g.isPublished) : [];
    const rest = shown.filter((g) => !feat.includes(g));
    const parts = [];
    if (isAdmin) parts.push(h("button", { class: "btn primary block", type: "button", onclick: () => openCatalogDialog(null, load) }, icon("plus", 18), "Add a game"));
    if (feat.length) parts.push(h("div", { class: "cat-banners" }, feat.map(banner)));
    if (rest.length) parts.push(h("div", { class: "cat-grid" }, rest.map(tile)));
    if (!shown.length) parts.push(stateBox(items.length ? "No games match your search." : "New games are coming soon. Check back later!"));
    body.replaceChildren(...parts);
  }

  async function load() {
    try {
      const data = await api("/games/catalog", { quiet: true });
      items = data.items; isAdmin = data.isAdmin;
      draw();
    } catch (e) {
      body.replaceChildren(stateBox(e.message, h("button", { class: "btn outline sm", type: "button", onclick: load }, "Try again")));
    }
  }
  body.replaceChildren(...skeletons(3));
  load();
  return root;
}

function gamesView() {
  const root = h("div", { class: "pad stack games-hub" });
  const content = h("div", { class: "stack" });
  let tab = store.get("fabdia_games_tab") === "friends" ? "friends" : "discover";
  const tabs = [["discover", "Discover"], ["friends", "Play with friends"]].map(([key, label]) =>
    h("button", { class: "seg", type: "button", "data-key": key, onclick: () => { tab = key; store.set("fabdia_games_tab", key); paint(); } }, label));
  function paint() {
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.key === tab));
    live.games = null;
    content.replaceChildren(tab === "discover" ? catalogView() : friendGamesView());
  }
  root.append(h("h1", { class: "page-title" }, "Games"), h("div", { class: "seg-row" }, tabs), content);
  paint();
  return root;
}

function gameView(gameId) {
  const root = h("div", { class: "pad stack game-screen" });
  const content = h("div", { class: "stack" });
  root.append(h("a", { class: "btn ghost sm back-link", href: "#/games" }, icon("back", 18), "Games"), content);
  let game = null, busy = false;

  async function load(quiet) {
    try {
      const data = await api("/games/get", { query: { gameId }, quiet: !!quiet });
      game = data.game;
      draw();
    } catch (e) {
      if (!game) content.replaceChildren(stateBox(e.message, h("a", { class: "btn outline sm", href: "#/games" }, "Back to games")));
    }
  }

  async function play(move) {
    if (busy) return;
    busy = true;
    try {
      const data = await api("/games/move", { method: "POST", body: { gameId, move } });
      game = data.game;
      draw();
    } catch (e) {
      toast(e.message, "error");
      load(true);
    } finally { busy = false; }
  }

  function tttBoard() {
    const myTurn = game.status === "active" && game.yourTurn;
    return h("div", { class: "ttt", role: "grid", "aria-label": "Tic-Tac-Toe board" }, game.board.map((v, i) =>
      h("button", {
        class: `ttt-cell v${v} ${game.winLine && game.winLine.includes(i) ? "win" : ""}`, type: "button",
        disabled: !(myTurn && v === 0), "aria-label": `Square ${i + 1}${v === 1 ? ", X" : v === 2 ? ", O" : ""}`,
        onclick: () => play({ cell: i }),
      }, v === 1 ? "✕" : v === 2 ? "◯" : "")));
  }

  function c4Board() {
    const myTurn = game.status === "active" && game.yourTurn;
    const cells = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        const i = r * 7 + c;
        const v = game.board[i];
        const full = game.board[c] !== 0;
        cells.push(h("button", {
          class: `c4-cell v${v} ${game.winLine && game.winLine.includes(i) ? "win" : ""}`, type: "button",
          disabled: !(myTurn && !full), "aria-label": `Column ${c + 1}${v ? (v === 1 ? ", red" : ", yellow") : ""}`,
          onclick: () => play({ col: c }),
        }, h("span", { class: "c4-disc" })));
      }
    }
    return h("div", { class: "c4", role: "grid", "aria-label": "Connect Four board" }, cells);
  }

  function rpsBoard() {
    const r = game.rps;
    const myScore = r.rounds.filter((x) => x.winner === game.seat).length;
    const theirScore = r.rounds.filter((x) => x.winner !== 0 && x.winner !== game.seat).length;
    const canPick = game.status === "active" && !r.myPick;
    return h("div", { class: "rps stack" },
      h("div", { class: "rps-score" },
        h("span", {}, h("strong", {}, myScore), " You"), h("span", { class: "muted" }, "first to 2"),
        h("span", {}, game.opponent.displayName, " ", h("strong", {}, theirScore))),
      h("div", { class: "rps-picks" }, Object.entries(RPS_ICON).map(([pick, emoji]) =>
        h("button", { class: `rps-pick ${r.myPick === pick ? "chosen" : ""}`, type: "button", disabled: !canPick, "aria-label": pick, onclick: () => play({ pick }) },
          h("span", { class: "rps-emoji" }, emoji), h("span", {}, pick[0].toUpperCase() + pick.slice(1))))),
      r.rounds.length ? h("div", { class: "rps-history" }, r.rounds.map((x, i) => {
        const mine = game.seat === 1 ? x.a : x.b;
        const theirs = game.seat === 1 ? x.b : x.a;
        const res = x.winner === 0 ? "Draw" : x.winner === game.seat ? "You won" : "They won";
        return h("div", { class: `rps-round ${x.winner === 0 ? "draw" : x.winner === game.seat ? "won" : "lost"}` },
          h("span", { class: "muted small" }, `Round ${i + 1}`), h("span", {}, `${RPS_ICON[mine]} vs ${RPS_ICON[theirs]}`), h("strong", {}, res));
      })) : null);
  }

  function draw() {
    const info = GAMES[game.kind];
    const opp = game.opponent;
    document.title = `${info.name} — ${CONFIG.FULL_NAME}`;
    const isMine = (seat) => game.seat === seat;
    const markFor = (seat) => game.kind === "tictactoe" ? (seat === 1 ? "✕" : "◯") : game.kind === "connect4" ? (seat === 1 ? "🔴" : "🟡") : "";
    const turnSeat = game.status === "active" && game.kind !== "rps" ? (game.yourTurn ? game.seat : (game.seat === 1 ? 2 : 1)) : 0;

    const side = (person, seat, label) => h("div", { class: `game-side ${turnSeat === seat ? "on" : ""}` },
      avatar(person.displayName, person.avatarUrl, 52, { userId: person.id }),
      h("strong", {}, label), h("span", { class: "game-mark" }, markFor(seat)));
    const head = h("div", { class: "game-vs" },
      side(isMine(1) ? state.user : game.players.one, 1, isMine(1) ? "You" : game.players.one.displayName),
      h("span", { class: "game-vs-label" }, "vs"),
      side(isMine(2) ? state.user : game.players.two, 2, isMine(2) ? "You" : game.players.two.displayName));

    let status = null, boardEl = null, actions = [];
    if (game.status === "pending") {
      if (game.incoming) {
        status = h("p", { class: "game-status turn" }, `${opp.displayName} challenged you to ${info.name}`);
        actions = [
          h("button", { class: "btn primary", type: "button", onclick: async () => { if (await respondToGame(gameId, "accept")) load(true); } }, "Accept challenge"),
          h("button", { class: "btn outline", type: "button", onclick: async () => { if (await respondToGame(gameId, "decline")) location.hash = "#/games"; } }, "Decline")];
      } else {
        status = h("p", { class: "game-status" }, `Waiting for ${opp.displayName} to accept…`);
        actions = [h("button", { class: "btn outline", type: "button", onclick: async () => { if (await respondToGame(gameId, "cancel")) location.hash = "#/games"; } }, "Cancel challenge")];
      }
    } else if (game.status === "declined" || game.status === "cancelled") {
      status = h("p", { class: "game-status" }, game.status === "declined" ? "This challenge was declined." : "This challenge was cancelled.");
      actions = [h("a", { class: "btn primary", href: "#/games" }, "Back to games")];
    } else {
      boardEl = game.kind === "tictactoe" ? tttBoard() : game.kind === "connect4" ? c4Board() : rpsBoard();
      if (game.status === "active") {
        if (game.kind === "rps") {
          const r = game.rps;
          status = h("p", { class: `game-status ${r.myPick ? "" : "turn"}` },
            r.myPick ? `You picked ${RPS_ICON[r.myPick]}. Waiting for ${opp.displayName}…` : (r.opponentPicked ? `${opp.displayName} has picked. Your turn!` : "Pick one!"));
        } else {
          status = h("p", { class: `game-status ${game.yourTurn ? "turn" : ""}` }, game.yourTurn ? "Your turn" : `${opp.displayName}'s turn…`);
        }
        actions = [h("button", { class: "btn ghost sm", type: "button", onclick: async () => {
          const ok = await confirmSheet({ title: "Give up this game?", text: `${opp.displayName} will be counted as the winner.`, confirmLabel: "Give up", danger: true });
          if (ok && await respondToGame(gameId, "resign")) load(true);
        } }, "Give up")];
      } else {
        const o = gameOutcome(game);
        status = h("p", { class: `game-status result ${o.cls}` }, h("strong", {}, o.text), h("span", {}, o.points));
        actions = [
          h("button", { class: "btn primary", type: "button", onclick: () => sendChallenge(game.kind, opp) }, "Play again"),
          h("a", { class: "btn outline", href: "#/games" }, "Back to games")];
      }
    }

    content.replaceChildren(
      h("h1", { class: "page-title game-title" }, info.name),
      head, status, boardEl, actions.length ? h("div", { class: "game-actions" }, actions) : null);
  }

  content.replaceChildren(...skeletons(2));
  live.game = { gameId, reload: () => load(true) };
  load(false);
  return root;
}

/* ====================== router ====================== */
const app = document.getElementById("app");
let lastRoute = null;

function render() {
  const hash = location.hash.slice(1) || "/";
  const [, a, b] = hash.split("/");
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  live.thread = null;
  live.list = null;
  live.feed = null;
  live.games = null;
  live.game = null;
  document.title = `${CONFIG.FULL_NAME} — Share photos and videos, follow friends and chat`;

  if (a === "login") {
    if (state.user) { location.hash = "#/"; return; }
    app.replaceChildren(authView());
  } else if (a === "u") {
    const id = Number(b);
    if (Number.isInteger(id) && id > 0) {
      app.replaceChildren(shell(profileView(id), { active: state.user && state.user.id === id ? "profile" : "none" }));
    } else {
      app.replaceChildren(shell(notFoundView(), { active: "none" }));
    }
  } else if (a === "messages") {
    if (!state.user) { location.hash = "#/login"; return; }
    const id = Number(b);
    if (!b) {
      document.title = `Messages — ${CONFIG.FULL_NAME}`;
      app.replaceChildren(shell(messagesView(), { active: "messages" }));
    } else if (Number.isInteger(id) && id > 0) {
      app.replaceChildren(shell(threadView(id), { active: "messages", bare: true }));
    } else {
      app.replaceChildren(shell(notFoundView(), { active: "none" }));
    }
  } else if (a === "store") {
    if (!state.user) { location.hash = "#/login"; return; }
    document.title = `Store — ${CONFIG.FULL_NAME}`;
    app.replaceChildren(shell(storeView(), { active: "store" }));
  } else if (a === "games") {
    if (!state.user) { location.hash = "#/login"; return; }
    const gid = Number(b);
    if (!b) {
      document.title = `Games — ${CONFIG.FULL_NAME}`;
      app.replaceChildren(shell(gamesView(), { active: "games" }));
    } else if (Number.isInteger(gid) && gid > 0) {
      app.replaceChildren(shell(gameView(gid), { active: "games" }));
    } else {
      app.replaceChildren(shell(notFoundView(), { active: "none" }));
    }
  } else if (a === "friends") {
    if (!state.user) { location.hash = "#/login"; return; }
    document.title = `Friends — ${CONFIG.FULL_NAME}`;
    app.replaceChildren(shell(friendsView(), { active: "friends" }));
  } else if (!a) {
    app.replaceChildren(shell(homeView(), { active: "home", fab: true }));
  } else {
    app.replaceChildren(shell(notFoundView(), { active: "none" }));
  }

  updateInstallButtons();
  if (lastRoute !== hash && a !== "messages") window.scrollTo(0, 0);
  lastRoute = hash;
}

// offline support and "install as an app"
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}

function captureReferrer() {
  try {
    const params = new URLSearchParams(location.search);
    const ref = Number(params.get("ref"));
    if (Number.isInteger(ref) && ref > 0) store.set("fabdia_ref", String(ref));
    if (params.has("ref")) {
      params.delete("ref");
      const qs = params.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }
  } catch { /* the link still works without it */ }
}

(async function boot() {
  captureReferrer();
  checkForUpdate();
  if (state.token) {
    try {
      const session = await api("/auth/session", { quiet: true });
      setSession(session.token, session.user);
    } catch {
      setSession(null, null);
    }
  }
  window.addEventListener("hashchange", render);
  render();
})();
