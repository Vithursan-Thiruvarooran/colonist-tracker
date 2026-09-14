const MAX_CAPTURES = 25;
const MAX_CAPTURE_AGE_MS = 24 * 60 * 60 * 1000;
const PRUNE_ALARM = "prune-expired-captures";
const DEFAULT_BACKEND_URL = "http://localhost:8000/api/games/ingest";

function extractGameId(payload) {
  const data = payload?.data ?? payload;
  return data?.databaseGameId ? String(data.databaseGameId) : null;
}

function pruneExpired(captures) {
  const cutoff = Date.now() - MAX_CAPTURE_AGE_MS;
  return captures.filter((c) => c.capturedAt > cutoff);
}

function updateBadge(captures) {
  const failed = captures.filter((c) => c.status === "failed").length;
  if (failed > 0) {
    chrome.action.setBadgeText({ text: String(failed) });
    chrome.action.setBadgeBackgroundColor({ color: "#ad4e2e" });
  } else if (captures.length > 0) {
    chrome.action.setBadgeText({ text: String(captures.length) });
    chrome.action.setBadgeBackgroundColor({ color: "#2f6f4f" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

function pruneStoredCaptures() {
  chrome.storage.local.get({ captures: [] }, ({ captures }) => {
    const next = pruneExpired(captures);
    if (next.length !== captures.length) {
      chrome.storage.local.set({ captures: next }, () => updateBadge(next));
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(PRUNE_ALARM, { periodInMinutes: 60 });
  pruneStoredCaptures();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(PRUNE_ALARM, { periodInMinutes: 60 });
  pruneStoredCaptures();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PRUNE_ALARM) pruneStoredCaptures();
});

// Keep the toolbar badge in sync with status changes written directly to
// storage (by this file's own sendCaptureToBackend, or historically by the
// popup), not just with new captures arriving here.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.captures) updateBadge(changes.captures.newValue || []);
});

async function patchCapture(gameId, patch) {
  const { captures } = await chrome.storage.local.get({ captures: [] });
  const next = captures.map((c) => (c.gameId === gameId ? { ...c, ...patch } : c));
  await chrome.storage.local.set({ captures: next });
  return next.find((c) => c.gameId === gameId) || null;
}

// The single place that actually talks to the backend -- used both for the
// automatic send-on-capture below and for the popup's manual Send/Resend
// buttons (via the SEND_CAPTURE message), so status handling (including
// clearing a stale auth token on 401) only lives in one place.
async function sendCaptureToBackend(gameId) {
  const { captures } = await chrome.storage.local.get({ captures: [] });
  const capture = captures.find((c) => c.gameId === gameId);
  if (!capture) return { error: "Capture no longer exists" };

  await patchCapture(gameId, { status: "sending" });

  const { backendUrl, authToken } = await chrome.storage.local.get({
    backendUrl: DEFAULT_BACKEND_URL,
    authToken: null,
  });

  try {
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
      const err = "Invalid or missing API token — paste a fresh one below, then try again";
      await patchCapture(gameId, { status: "failed", lastError: err });
      return { error: err };
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `HTTP ${response.status}`);
    }

    const result = await response.json();
    const status = result.status === "skipped" ? "skipped" : "sent";
    await patchCapture(gameId, { status, sentAt: Date.now(), lastError: null });
    return { status };
  } catch (err) {
    const message = String(err?.message || err);
    await patchCapture(gameId, { status: "failed", lastError: message });
    return { error: message };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CAPTURE") {
    const gameId = extractGameId(message.payload);
    if (!gameId) return;

    chrome.storage.local.get({ captures: [] }, ({ captures }) => {
      const fresh = pruneExpired(captures);
      const withoutDup = fresh.filter((c) => c.gameId !== gameId);
      const next = [
        {
          gameId,
          capturedAt: Date.now(),
          payload: message.payload,
          status: "unsent",
          lastError: null,
          sentAt: null,
        },
        ...withoutDup,
      ].slice(0, MAX_CAPTURES);

      chrome.storage.local.set({ captures: next }, () => {
        updateBadge(next);
        // Fire-and-forget: send the freshly captured game right away. Any
        // failure just leaves it "failed" for manual retry from the popup.
        sendCaptureToBackend(gameId);
      });
    });
    return;
  }

  if (message?.type === "SEND_CAPTURE") {
    sendCaptureToBackend(message.gameId).then(sendResponse);
    return true; // keep the message channel open for the async response
  }
});
