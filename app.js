"use strict";

/* ====================== CONFIG ====================== */
const CONFIG = {
  APP_NAME: "Fabdia",
  FULL_NAME: "Fabdia Media",
  // Your published Floot backend. Change this if you ever move it to a custom domain.
  API_BASE: "https://fabsocialmeta.floot.app/_api",
  MAX_VIDEO_SECONDS: 40,
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
  back: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5a6.5 6.5 0 0 1 3 5.5"/>',
  share: '<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
};
function icon(name, size = 22) {
  const span = document.createElement("span");
  span.style.display = "inline-flex";
  // static strings defined above, never user input
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span;
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
  if (token && user) { realtime.start(); refreshUnread(); refreshFriendRequests(); presence.start(); }
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
const live = { thread: null, list: null, feed: null };

function lastPreview(msg) {
  if (msg.body) return msg.body;
  return msg.mediaType === "video" ? "Sent a video" : "Sent a photo";
}

function onChatEvent(event) {
  if (!event || event.type !== "message" || !state.user) return;
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
      h("p", {}, c.content)));
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
    post.content ? h("p", { class: "post-text" }, post.content) : null,
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
  root.append(h("h1", { class: "page-title" }, "Friends"), body);

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

/* ---------- messages ---------- */
function messagesView() {
  const root = h("div", { class: "pad stack" });
  const body = h("div");
  root.append(h("h1", { class: "page-title" }, "Messages"), body);

  async function load() {
    try {
      const data = await api("/chat/conversations");
      state.unread = data.conversations.reduce((n, c) => n + c.unread, 0);
      updateBadge();
      if (!data.conversations.length) {
        body.replaceChildren(stateBox("No messages yet. Open someone's profile and tap Message to start a chat."));
        return;
      }
      body.replaceChildren(h("section", { class: "list-card" }, data.conversations.map((c) => {
        const last = c.lastMessage;
        const mine = last.senderId === state.user.id;
        return h("a", { class: `convo ${c.unread ? "unread" : ""}`, href: `#/messages/${c.id}` },
          avatar(c.other.displayName, c.other.avatarUrl, 52),
          h("div", { class: "convo-main" },
            h("div", { class: "convo-top" },
              h("span", { class: "convo-name" }, c.other.displayName),
              h("span", { class: "muted small" }, timeAgo(last.createdAt))),
            h("div", { class: "convo-last" }, (mine ? "You: " : "") + lastPreview(last))),
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
  const root = h("div", { class: "thread-view" });
  const head = h("div", { class: "chat-head" });
  const olderBtn = h("button", { class: "btn outline sm", type: "button", hidden: true }, "Load earlier messages");
  const list = h("div", { class: "thread", role: "log", "aria-live": "polite" });
  const scroller = h("div", { class: "thread-scroll" }, h("div", { class: "thread-top" }, olderBtn), list);
  const seen = new Set();
  let nextCursor = null;

  const att = attachmentPicker(refreshSend, { compact: true });
  const input = h("input", { type: "text", placeholder: "Message…", maxlength: "4000", "aria-label": "Write a message", autocomplete: "off", enterkeyhint: "send" });
  const sendBtn = h("button", { class: "btn primary icon", type: "button", "aria-label": "Send", disabled: true }, icon("send", 20));
  const composerBox = h("div", { class: "chat-composer" }, att.preview,
    h("div", { class: "chat-row" }, att.tools, input, sendBtn));
  root.append(head, scroller, composerBox);

  function refreshSend() { sendBtn.disabled = att.busy || (!input.value.trim() && !att.value); }
  input.addEventListener("input", refreshSend);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener("click", send);

  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 180;
  const scrollToBottom = () => { scroller.scrollTop = scroller.scrollHeight; };

  function bubble(m) {
    const mine = m.senderId === state.user.id;
    const url = resolveMedia(m.mediaUrl);
    let media = null;
    if (url && m.mediaType === "image") {
      const img = h("img", { src: url, alt: "Photo", loading: "lazy" });
      img.addEventListener("click", () => openLightbox(url));
      media = img;
    } else if (url && m.mediaType === "video") {
      media = h("video", { src: `${url}#t=0.1`, controls: true, preload: "metadata", playsinline: true });
    }
    return h("div", { class: `bubble-row ${mine ? "mine" : "theirs"}` },
      h("div", { class: "bubble" }, media, m.body ? h("p", {}, m.body) : null,
        h("span", { class: "bubble-time" }, clockTime(m.createdAt))));
  }

  function addMessage(m) {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    list.append(bubble(m));
    return true;
  }

  async function markRead() {
    try { await api("/chat/read", { method: "POST", body: { conversationId }, quiet: true }); refreshUnread(); } catch { /* not critical */ }
  }

  async function open() {
    list.replaceChildren(...skeletons(2));
    try {
      const data = await api("/chat/messages", { query: { conversationId, limit: 30 } });
      const other = data.other;
      head.replaceChildren(
        h("a", { class: "btn ghost icon", href: "#/messages", "aria-label": "Back to messages" }, icon("back", 24)),
        h("a", { class: "who", href: `#/u/${other.id}` }, avatar(other.displayName, other.avatarUrl, 40), h("span", {}, other.displayName)));
      document.title = `${other.displayName} — ${CONFIG.FULL_NAME}`;
      list.replaceChildren();
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
      const fresh = data.messages.filter((m) => !seen.has(m.id));
      fresh.forEach((m) => seen.add(m.id));
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
    try {
      const payload = { conversationId, body };
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
      const stick = nearBottom() || m.senderId === state.user.id;
      if (!addMessage(m)) return;
      if (m.senderId !== state.user.id) markRead();
      if (stick) scrollToBottom();
    },
    async resync() {
      try {
        const data = await api("/chat/messages", { query: { conversationId, limit: 30 }, quiet: true });
        data.messages.forEach(addMessage);
      } catch { /* try again on the next reconnect */ }
    },
  };

  open();
  return root;
}

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
        location.hash = "#/";
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

function notFoundView() {
  return h("div", { class: "pad" }, stateBox("That page doesn't exist.", h("a", { class: "btn outline sm", href: "#/" }, "Back home")));
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

(async function boot() {
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
