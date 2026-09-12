const DEFAULT_BACKEND_URL = "http://localhost:8000/api/games/ingest";

const listEl = document.getElementById("captures");
const emptyEl = document.getElementById("empty");
const backendInput = document.getElementById("backend-url");
const saveBackendBtn = document.getElementById("save-backend");
const bulkRowEl = document.getElementById("bulk-row");
const bulkCountEl = document.getElementById("bulk-count");
const sendAllBtn = document.getElementById("send-all");
const tokenInput = document.getElementById("api-token");
const saveTokenBtn = document.getElementById("save-token");
const authStatusEl = document.getElementById("auth-status");

let currentCaptures = [];
const sendButtons = new Map();

chrome.action.setBadgeText({ text: "" });

chrome.storage.local.get({ backendUrl: DEFAULT_BACKEND_URL }, ({ backendUrl }) => {
  backendInput.value = backendUrl;
});

saveBackendBtn.addEventListener("click", async () => {
  const url = backendInput.value.trim() || DEFAULT_BACKEND_URL;

  let origin;
  try {
    origin = new URL(url).origin + "/*";
  } catch (_) {
    flashLabel(saveBackendBtn, "Invalid URL");
    return;
  }

  try {
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      flashLabel(saveBackendBtn, "Permission denied");
      return;
    }
  } catch (_) {
    flashLabel(saveBackendBtn, "Permission error");
    return;
  }

  chrome.storage.local.set({ backendUrl: url }, () => flashLabel(saveBackendBtn, "Saved"));
});

async function refreshAuthStatus() {
  const { authToken } = await chrome.storage.local.get({ authToken: null });
  authStatusEl.className = "auth-status" + (authToken ? " auth-status--ok" : "");
  authStatusEl.textContent = authToken
    ? "Token saved"
    : "No token saved — sends will fail until you paste one below.";
}

saveTokenBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) return;

  await chrome.storage.local.set({ authToken: token });
  tokenInput.value = "";
  await refreshAuthStatus();
});

refreshAuthStatus();

function flashLabel(button, text) {
  const original = "Save";
  button.textContent = text;
  setTimeout(() => (button.textContent = original), 1500);
}

function relativeTime(timestamp) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Captured just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Captured ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Captured ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Captured ${days}d ago`;
}

function render(captures) {
  currentCaptures = captures;
  sendButtons.clear();
  listEl.innerHTML = "";
  emptyEl.hidden = captures.length > 0;

  bulkRowEl.hidden = captures.length < 2;
  bulkCountEl.textContent = `${captures.length} captured`;

  for (const capture of captures) {
    const li = document.createElement("li");
    li.className = "capture";

    const tile = document.createElement("div");
    tile.className = "hex hex--tile";
    tile.textContent = capture.gameId.slice(-2);

    const body = document.createElement("div");
    body.className = "capture__body";

    const idEl = document.createElement("div");
    idEl.className = "capture__id";
    idEl.textContent = `#${capture.gameId}`;

    const timeEl = document.createElement("div");
    timeEl.className = "capture__time";
    timeEl.textContent = relativeTime(capture.capturedAt);
    timeEl.title = new Date(capture.capturedAt).toLocaleString();

    const actions = document.createElement("div");
    actions.className = "capture__actions";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "btn btn--ghost";
    downloadBtn.textContent = "Download";
    downloadBtn.addEventListener("click", () => downloadCapture(capture));

    const sendBtn = document.createElement("button");
    sendBtn.className = "btn btn--primary";
    sendBtn.textContent = "Send to backend";
    sendBtn.addEventListener("click", () => sendCapture(capture, sendBtn));
    sendButtons.set(capture.gameId, sendBtn);

    actions.append(downloadBtn, sendBtn);
    body.append(idEl, timeEl, actions);
    li.append(tile, body);
    listEl.appendChild(li);
  }
}

sendAllBtn.addEventListener("click", async () => {
  const originalText = sendAllBtn.textContent;
  sendAllBtn.disabled = true;

  const targets = currentCaptures.filter((c) => {
    const button = sendButtons.get(c.gameId);
    return button && !button.disabled;
  });

  for (let i = 0; i < targets.length; i++) {
    sendAllBtn.textContent = `Sending ${i + 1}/${targets.length}…`;
    const button = sendButtons.get(targets[i].gameId);
    await sendCapture(targets[i], button);
  }

  sendAllBtn.textContent = "All sent";
  setTimeout(() => {
    sendAllBtn.disabled = false;
    sendAllBtn.textContent = originalText;
  }, 2000);
});

function downloadCapture(capture) {
  const blob = new Blob([JSON.stringify(capture.payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: `colonist-game-${capture.gameId}.json`, saveAs: false }, () =>
    URL.revokeObjectURL(url)
  );
}

async function sendCapture(capture, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Sending…";

  try {
    const { backendUrl, authToken } = await chrome.storage.local.get({
      backendUrl: DEFAULT_BACKEND_URL,
      authToken: null,
    });
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ raw: capture.payload }),
    });

    if (response.status === 401) {
      await chrome.storage.local.set({ authToken: null });
      refreshAuthStatus();
      throw new Error("Invalid or missing API token — paste a fresh one below, then try again");
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `HTTP ${response.status}`);
    }

    const result = await response.json();
    button.classList.add("btn--sent");
    button.textContent = result.status === "skipped" ? "Already stored" : "Sent";
  } catch (err) {
    button.textContent = "Failed to send";
    button.title = String(err);
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.classList.remove("btn--sent");
      button.textContent = originalText;
      button.title = "";
    }, 2000);
  }
}

chrome.storage.local.get({ captures: [] }, ({ captures }) => render(captures));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.captures) render(changes.captures.newValue || []);
});
