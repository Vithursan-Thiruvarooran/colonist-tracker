const MAX_CAPTURES = 25;
const MAX_CAPTURE_AGE_MS = 24 * 60 * 60 * 1000;
const PRUNE_ALARM = "prune-expired-captures";

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

// Keep the toolbar badge in sync with status changes the popup writes
// directly to storage (e.g. after a send succeeds or fails), not just with
// new captures arriving here.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.captures) updateBadge(changes.captures.newValue || []);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "CAPTURE") return;

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

    chrome.storage.local.set({ captures: next }, () => updateBadge(next));
  });
});
