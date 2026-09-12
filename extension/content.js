// Isolated world: relays captures from inject.js (page context) to the
// service worker, which is where chrome.storage writes happen.
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || !data.__colonistCapture) return;
  chrome.runtime.sendMessage({ type: "CAPTURE", payload: data.payload });
});
