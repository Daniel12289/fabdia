"use strict";

/* ====================== CONFIG ====================== */
const CONFIG = {
  APP_NAME: "Fabdia",
  // Your published Floot backend. Change this if you ever move it to a custom domain.
  API_BASE: "https://fabsocialmeta.floot.app/_api",
  MAX_VIDEO_SECONDS: 40,
};
// Uploaded photos and videos are served from the backend's own address.
const ORIGIN = new URL(CONFIG.API_BASE).origin;

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
};
function icon(name, size = 18) {
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

function avatar(name, src, size = 40) {
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
  return el;
}

function toast(message, kind = "info") {
  const el = h("div", { class: `toast ${kind === "error" ? "error" : ""}` }, message);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), 4200);
}

/* ====================== API ====================== */
// The host answers the browser's pre-flight check itself, so we only send "simple" requests:
// no custom headers, POST bodies as text/plain wrapped as {"json": ...}, and the login token
// in the URL as ?token=...
const state = { token: store.get("fabdia_token"), user: null, unread: 0 };

function setSession(token, user) {
  state.token = token || null;
  state.user = user || null;
  if (token) store.set("fabdia_token", token); else store.del("fabdia_token");
  if (token && user) { realtime.start(); refreshUnread(); }
  else { realtime.stop(); state.unread = 0; }
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

/* ====================== photos and videos ====================== */
function readVideoSeconds(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(url);
      Number.isFinite(d) ? resolve(d) : reject(new Error("Couldn't read this video. Try an MP4 or MOV file."));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this video. Try an MP4 or MOV file."));
    };
    video.src = url;
  });
}

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

// Checks a chosen file and returns { kind, file, seconds }. Videos over 40 seconds are refused here.
async function inspectAttachment(file, imageOptions) {
  if (file.type.startsWith("image/")) {
    return { kind: "image", file: await prepareImage(file, imageOptions), seconds: null };
  }
  if (file.type.startsWith("video/")) {
    const seconds = await readVideoSeconds(file);
    if (seconds > CONFIG.MAX_VIDEO_SECONDS) {
      throw new Error(`Videos can be at most ${CONFIG.MAX_VIDEO_SECONDS} seconds. This one is ${Math.round(seconds)} seconds.`);
    }
    return { kind: "video", file, seconds: Math.max(0.1, Math.round(seconds * 10) / 10) };
  }
  throw new Error("Choose a photo or a video.");
}

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

// Photo / video buttons plus a preview of what's attached.
function attachmentPicker(onChange) {
  let current = null;
  const photoInput = h("input", { type: "file", accept: "image/*", hidden: true });
  const videoInput = h("input", { type: "file", accept: "video/*", hidden: true });
  const preview = h("div", { class: "attach-preview", hidden: true });
  const photoBtn = h("button", { class: "btn ghost sm", type: "button", "aria-label": "Add a photo", onclick: () => photoInput.click() }, icon("image"), "Photo");
  const videoBtn = h("button", { class: "btn ghost sm", type: "button", "aria-label": `Add a video, up to ${CONFIG.MAX_VIDEO_SECONDS} seconds`, onclick: () => videoInput.click() }, icon("video"), "Video");
  const tools = h("div", { class: "attach-tools" }, photoBtn, videoBtn, photoInput, videoInput);

  async function choose(input) {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    try { set(await inspectAttachment(file)); } catch (e) { toast(e.message, "error"); }
  }
  photoInput.addEventListener("change", () => choose(photoInput));
  videoInput.addEventListener("change", () => choose(videoInput));

  function set(attachment) {
    clear(true);
    current = { ...attachment, previewUrl: URL.createObjectURL(attachment.file) };
    const media = attachment.kind === "image"
      ? h("img", { src: current.previewUrl, alt: "Selected photo" })
      : h("video", { src: current.previewUrl, controls: true, muted: true, playsinline: true, preload: "metadata" });
    preview.replaceChildren(media, h("button", { class: "btn ghost icon sm attach-remove", type: "button", "aria-label": "Remove attachment", onclick: () => clear() }, icon("x", 16)));
    preview.hidden = false;
    onChange();
  }
  function clear(silent) {
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

  return { tools, preview, clear, setDisabled, get value() { return current; } };
}

/* ====================== shared UI ====================== */
function skeletons(n) {
  return Array.from({ length: n }, () => h("div", { class: "skeleton" }));
}

function stateBox(message, action) {
  return h("div", { class: "state" }, h("p", {}, message), action || null);
}

function tabs(items, active, onChange) {
  const buttons = items.map(([value, label]) =>
    h("button", {
      class: "tab", role: "tab", type: "button",
      "aria-selected": String(value === active),
      onclick: () => {
        buttons.forEach((b, i) => b.setAttribute("aria-selected", String(items[i][0] === value)));
        onChange(value);
      },
    }, label));
  return h("div", { class: "tabs", role: "tablist" }, buttons);
}

function badgeText() { return state.unread > 99 ? "99+" : String(state.unread); }

function topbar() {
  return h("header", { class: "topbar" },
    h("div", { class: "topbar-in" },
      h("a", { class: "brand", href: "#/" }, CONFIG.APP_NAME),
      h("div", { class: "topbar-actions" },
        state.user
          ? [
              h("a", { class: "btn ghost icon msg-link", href: "#/messages", "aria-label": "Messages" },
                icon("message", 20),
                h("span", { class: "msg-badge", hidden: !state.unread }, badgeText())),
              h("a", { class: "me", href: `#/u/${state.user.id}`, "aria-label": "Your profile" },
                avatar(state.user.displayName, state.user.avatarUrl, 34)),
              h("button", { class: "btn ghost icon", type: "button", "aria-label": "Log out", onclick: logout }, icon("logout")),
            ]
          : h("a", { class: "btn primary sm", href: "#/login" }, "Log in"))));
}

function refreshTopbar() {
  const bar = document.querySelector(".topbar");
  if (bar) bar.replaceWith(topbar());
}

function updateBadge() {
  document.querySelectorAll(".msg-badge").forEach((el) => {
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

async function logout() {
  try { await api("/auth/logout", { method: "POST", quiet: true }); } catch { /* clearing locally anyway */ }
  setSession(null, null);
  if (location.hash === "#/" || location.hash === "") render(); else location.hash = "#/";
}

/* ====================== live chat connection ====================== */
// The active screen registers itself here so incoming messages go to the right place.
const live = { thread: null, list: null };

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

/* ====================== posts ====================== */
function commentNode(c) {
  return h("div", { class: "comment" },
    avatar(c.author.displayName, c.author.avatarUrl, 28),
    h("div", { class: "comment-body" },
      h("div", { class: "comment-meta" },
        h("a", { href: `#/u/${c.author.id}` }, c.author.displayName),
        h("span", { class: "muted small" }, timeAgo(c.createdAt))),
      h("p", {}, c.content)));
}

function postCard(initial, { onDeleted } = {}) {
  const post = { ...initial };
  let commentsLoaded = false;

  const likeCount = h("span");
  const commentCount = h("span");
  const likeBtn = h("button", { class: "act like", type: "button", onclick: toggleLike }, icon("heart"), likeCount);
  const commentBtn = h("button", { class: "act", type: "button", "aria-expanded": "false", "aria-label": "Comments", onclick: toggleComments }, icon("comment"), commentCount);
  const commentsBox = h("div", { class: "comments", hidden: true });
  const card = h("article", { class: "card post" });

  function sync() {
    likeBtn.classList.toggle("on", post.likedByMe);
    likeBtn.setAttribute("aria-pressed", String(post.likedByMe));
    likeBtn.setAttribute("aria-label", post.likedByMe ? "Unlike" : "Like");
    likeCount.textContent = post.likeCount;
    commentCount.textContent = post.commentCount;
  }

  async function toggleLike() {
    if (!state.user) { location.hash = "#/login"; return; }
    const before = { likedByMe: post.likedByMe, likeCount: post.likeCount };
    const next = !post.likedByMe;
    post.likedByMe = next;
    post.likeCount = Math.max(0, post.likeCount + (next ? 1 : -1));
    sync();
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
    const list = h("div", { class: "stack", style: "gap:.6rem" }, comments.map(commentNode));
    if (!comments.length) list.append(h("p", { class: "muted small" }, "No comments yet. Start the conversation."));
    commentsBox.replaceChildren(list);

    if (!state.user) {
      commentsBox.append(h("p", { class: "small" }, h("a", { href: "#/login", class: "linkish" }, "Log in"), " to comment."));
      return;
    }
    const input = h("input", { placeholder: "Write a comment…", maxlength: "1000", "aria-label": "Write a comment" });
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
  }, icon("trash", 16));
  function resetDelete() {
    deleteBtn.dataset.confirm = "0";
    deleteBtn.className = "btn ghost icon sm";
    deleteBtn.replaceChildren(icon("trash", 16));
  }

  const canDelete = state.user && (state.user.id === post.author.id || state.user.role === "admin");
  const imageUrl = resolveMedia(post.imageUrl);
  const videoUrl = resolveMedia(post.videoUrl);

  card.append(
    h("a", { href: `#/u/${post.author.id}`, "aria-label": post.author.displayName, style: "align-self:flex-start;border-radius:50%;display:inline-flex" },
      avatar(post.author.displayName, post.author.avatarUrl)),
    h("div", { class: "post-main" },
      h("div", { class: "post-head" },
        h("a", { class: "author", href: `#/u/${post.author.id}` }, post.author.displayName),
        h("span", { class: "muted small" }, timeAgo(post.createdAt)),
        canDelete ? h("span", { class: "spacer" }, deleteBtn) : null),
      post.content ? h("p", { class: "post-text" }, post.content) : null,
      imageUrl ? h("a", { href: imageUrl, target: "_blank", rel: "noopener" }, h("img", { class: "post-img", src: imageUrl, alt: "Photo in post", loading: "lazy" })) : null,
      videoUrl ? h("video", { class: "post-video", src: videoUrl, controls: true, preload: "metadata", playsinline: true }) : null,
      h("div", { class: "post-actions" }, likeBtn, commentBtn),
      commentsBox));
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

function composer(onPosted) {
  const ta = h("textarea", { rows: "3", maxlength: "2000", placeholder: "What's on your mind?", "aria-label": "Write a post" });
  const count = h("span", { class: "muted small" });
  const btn = h("button", { class: "btn primary", type: "button", disabled: true }, "Post");
  const att = attachmentPicker(refresh);

  function refresh() {
    btn.disabled = ta.value.trim().length === 0 && !att.value;
  }
  ta.addEventListener("input", () => {
    refresh();
    const left = 2000 - ta.value.length;
    count.textContent = left < 200 ? `${left} left` : "";
  });
  ta.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); }
  });
  btn.addEventListener("click", submit);

  async function submit() {
    const content = ta.value.trim();
    const a = att.value;
    if ((!content && !a) || btn.disabled) return;
    btn.disabled = true;
    ta.disabled = true;
    att.setDisabled(true);
    try {
      const body = { content, imageUrl: null, videoUrl: null, videoSeconds: null };
      if (a) {
        btn.textContent = "Uploading 0%";
        const url = await uploadFile(a.kind === "image" ? "post_image" : "post_video", a.file,
          (p) => { btn.textContent = `Uploading ${Math.round(p * 100)}%`; });
        if (a.kind === "image") body.imageUrl = url;
        else { body.videoUrl = url; body.videoSeconds = a.seconds; }
        btn.textContent = "Posting…";
      } else {
        btn.textContent = "Posting…";
      }
      await api("/posts/create", { method: "POST", body });
      ta.value = "";
      count.textContent = "";
      att.clear(true);
      onPosted();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      btn.textContent = "Post";
      ta.disabled = false;
      att.setDisabled(false);
      refresh();
    }
  }

  return h("section", { class: "card composer" },
    avatar(state.user.displayName, state.user.avatarUrl),
    h("div", { class: "composer-body" }, ta, att.preview,
      h("div", { class: "composer-foot" }, h("div", { class: "attach-tools-wrap" }, att.tools, count), btn)));
}

/* ====================== views ====================== */
let homeScope = "all";

function homeView() {
  if (!state.user) homeScope = "all";
  const root = h("main", { class: "wrap stack" });
  const slot = h("div");
  let feed;

  function mountFeed() {
    feed = createFeed({
      scope: homeScope,
      empty: homeScope === "following"
        ? "Follow people from their profiles and their posts will show up here."
        : "No posts yet. Write the first one.",
    });
    slot.replaceChildren(feed);
  }

  if (state.user) {
    root.append(
      composer(() => { if (homeScope !== "all") { homeScope = "all"; render(); } else feed.reload(); }),
      tabs([["all", "Everyone"], ["following", "Following"]], homeScope, (scope) => { homeScope = scope; mountFeed(); }));
  } else {
    root.append(h("section", { class: "hero" },
      h("div", { class: "adire band" }),
      h("div", { class: "hero-body" },
        h("h1", {}, `Join the conversation on ${CONFIG.APP_NAME}`),
        h("p", {}, "Make an account to post, like, comment, follow people and send messages."),
        h("a", { class: "btn primary", href: "#/login" }, "Log in or sign up"))));
  }
  root.append(slot);
  mountFeed();
  return root;
}

function profileView(id) {
  const root = h("main", { class: "wrap stack" });
  const head = h("section", { class: "card" }, ...skeletons(1));
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
      if (!editing) action = h("button", { class: "btn outline sm", type: "button", onclick: () => drawHead(true) }, "Edit profile");
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
      action = h("div", { class: "profile-actions" }, followBtn, messageBtn);
    } else {
      action = h("a", { class: "btn primary sm", href: "#/login" }, "Follow");
    }

    head.replaceChildren(
      h("div", { class: "profile-top" }, avatar(p.displayName, p.avatarUrl, 84), action),
      editing ? editForm() : [h("h1", { class: "profile-name" }, p.displayName), p.bio ? h("p", { class: "bio" }, p.bio) : null],
      h("dl", { class: "stats" }, stat("Posts", p.postCount), stat("Followers", p.followerCount), stat("Following", p.followingCount)));
  }

  function editForm() {
    const name = h("input", { value: profile.displayName, maxlength: "50", required: true, "aria-label": "Name" });
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
        if (!file.type.startsWith("image/")) throw new Error("Choose a photo.");
        const a = await inspectAttachment(file, { max: 512, square: true });
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
          refreshTopbar();
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
      document.title = `${profile.displayName} — ${CONFIG.APP_NAME}`;
      drawHead();
      feedSlot.replaceChildren(createFeed({
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

/* ---------- messages ---------- */
function messagesView() {
  const root = h("main", { class: "wrap stack" });
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
      body.replaceChildren(h("section", { class: "card list-card" }, data.conversations.map((c) => {
        const last = c.lastMessage;
        const mine = last.senderId === state.user.id;
        return h("a", { class: `convo ${c.unread ? "unread" : ""}`, href: `#/messages/${c.id}` },
          avatar(c.other.displayName, c.other.avatarUrl, 46),
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
  const root = h("main", { class: "wrap thread-wrap" });
  const head = h("div", { class: "chat-head" });
  const olderBtn = h("button", { class: "btn outline sm", type: "button", hidden: true }, "Load earlier messages");
  const list = h("div", { class: "thread", role: "log", "aria-live": "polite" });
  const seen = new Set();
  let nextCursor = null;
  let other = null;

  const att = attachmentPicker(refreshSend);
  const input = h("input", { type: "text", placeholder: "Message…", maxlength: "4000", "aria-label": "Write a message", autocomplete: "off" });
  const sendBtn = h("button", { class: "btn primary icon", type: "button", "aria-label": "Send", disabled: true }, icon("send"));
  const composerBox = h("div", { class: "chat-composer" }, att.preview,
    h("div", { class: "chat-row" }, att.tools, input, sendBtn));
  root.append(head, h("div", { class: "thread-top" }, olderBtn), list, composerBox);

  function refreshSend() { sendBtn.disabled = !input.value.trim() && !att.value; }
  input.addEventListener("input", refreshSend);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener("click", send);

  function nearBottom() {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 180;
  }
  function scrollToBottom() {
    window.scrollTo(0, document.documentElement.scrollHeight);
  }

  function bubble(m) {
    const mine = m.senderId === state.user.id;
    const url = resolveMedia(m.mediaUrl);
    let media = null;
    if (url && m.mediaType === "image") media = h("a", { href: url, target: "_blank", rel: "noopener" }, h("img", { src: url, alt: "Photo", loading: "lazy" }));
    else if (url && m.mediaType === "video") media = h("video", { src: url, controls: true, preload: "metadata", playsinline: true });
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

  async function loadLatest() {
    const data = await api("/chat/messages", { query: { conversationId, limit: 30 } });
    other = data.other;
    head.replaceChildren(
      h("a", { class: "btn ghost icon", href: "#/messages", "aria-label": "Back to messages" }, icon("back", 20)),
      h("a", { class: "who", href: `#/u/${other.id}` }, avatar(other.displayName, other.avatarUrl, 40), h("span", {}, other.displayName)));
    document.title = `${other.displayName} — ${CONFIG.APP_NAME}`;
    return data;
  }

  async function open() {
    list.replaceChildren(...skeletons(2));
    try {
      const data = await loadLatest();
      list.replaceChildren();
      data.messages.forEach(addMessage);
      nextCursor = data.nextCursor;
      olderBtn.hidden = !nextCursor;
      scrollToBottom();
      input.focus({ preventScroll: true });
      markRead();
    } catch (e) {
      list.replaceChildren(stateBox(e.message, h("a", { class: "btn outline sm", href: "#/messages" }, "Back to messages")));
      composerBox.hidden = true;
    }
  }

  olderBtn.addEventListener("click", async () => {
    olderBtn.disabled = true;
    try {
      const before = document.documentElement.scrollHeight;
      const data = await api("/chat/messages", { query: { conversationId, before: nextCursor, limit: 30 } });
      const fresh = data.messages.filter((m) => !seen.has(m.id));
      fresh.forEach((m) => seen.add(m.id));
      list.prepend(...fresh.map(bubble));
      nextCursor = data.nextCursor;
      olderBtn.hidden = !nextCursor;
      window.scrollTo(0, window.scrollY + (document.documentElement.scrollHeight - before));
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
    if ((!body && !a) || sending) return;
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
    h("div", { class: "auth-card" }, h("div", { class: "adire band" }), body));

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
    const titles = { login: "Log in", register: "Create your account", forgot: "Reset your password", reset: "Enter your code" };
    document.title = `${titles[mode]} — ${CONFIG.APP_NAME}`;
    const forms = { login: loginForm, register: registerForm, forgot: forgotForm, reset: resetForm };
    body.replaceChildren(
      h("a", { class: "brand big", href: "#/" }, CONFIG.APP_NAME),
      h("p", { class: "tagline" }, titles[mode]),
      notice ? h("p", { class: "form-notice", role: "status" }, notice) : null,
      forms[mode](),
      mode === "login"
        ? h("div", { class: "auth-foot" }, h("span", { class: "muted" }, "New here?"), link("Create an account", "register"))
        : mode === "register"
          ? h("div", { class: "auth-foot" }, h("span", { class: "muted" }, "Have an account?"), link("Log in", "login"))
          : null);
  }

  draw();
  return root;
}

function notFoundView() {
  return h("main", { class: "wrap" }, stateBox("That page doesn't exist.", h("a", { class: "btn outline sm", href: "#/" }, "Back home")));
}

/* ====================== router ====================== */
const app = document.getElementById("app");
let lastRoute = null;

function render() {
  const hash = location.hash.slice(1) || "/";
  const [, a, b] = hash.split("/");
  live.thread = null;
  live.list = null;

  if (a === "login") {
    if (state.user) { location.hash = "#/"; return; }
    app.replaceChildren(authView());
  } else if (a === "u") {
    const id = Number(b);
    document.title = CONFIG.APP_NAME;
    app.replaceChildren(topbar(), Number.isInteger(id) && id > 0 ? profileView(id) : notFoundView());
  } else if (a === "messages") {
    if (!state.user) { location.hash = "#/login"; return; }
    const id = Number(b);
    if (!b) {
      document.title = `Messages — ${CONFIG.APP_NAME}`;
      app.replaceChildren(topbar(), messagesView());
    } else if (Number.isInteger(id) && id > 0) {
      app.replaceChildren(topbar(), threadView(id));
    } else {
      app.replaceChildren(topbar(), notFoundView());
    }
  } else if (!a) {
    document.title = `${CONFIG.APP_NAME} — Home`;
    app.replaceChildren(topbar(), homeView());
  } else {
    document.title = CONFIG.APP_NAME;
    app.replaceChildren(topbar(), notFoundView());
  }

  if (lastRoute !== hash && a !== "messages") window.scrollTo(0, 0);
  lastRoute = hash;
}

(async function boot() {
  app.replaceChildren(h("main", { class: "wrap stack" }, ...skeletons(3)));
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
