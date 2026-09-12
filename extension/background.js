const MAX_CAPTURES = 25;

function extractGameId(payload) {
  const data = payload?.data ?? payload;
  return data?.databaseGameId ? String(data.databaseGameId) : null;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "CAPTURE") return;

  const gameId = extractGameId(message.payload);
  if (!gameId) return;

  chrome.storage.local.get({ captures: [] }, ({ captures }) => {
    const withoutDup = captures.filter((c) => c.gameId !== gameId);
    const next = [
      { gameId, capturedAt: Date.now(), payload: message.payload },
      ...withoutDup,
    ].slice(0, MAX_CAPTURES);

    chrome.storage.local.set({ captures: next }, () => {
      chrome.action.setBadgeText({ text: String(next.length) });
      chrome.action.setBadgeBackgroundColor({ color: "#2f6f4f" });
    });
  });
});
