// Runs in the page's own JS context (MAIN world), not the isolated content-script
// world -- only from here can we monkey-patch window.fetch/XMLHttpRequest and see
// colonist.io's own calls to the replay endpoint. Captured payloads are handed to
// content.js via window.postMessage, since MAIN-world scripts can't call chrome.* APIs.
(() => {
  const TARGET = "/api/replay/data-from-game-id";

  function emit(payload) {
    window.postMessage({ __colonistCapture: true, payload }, "*");
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const request = args[0];
      const url = typeof request === "string" ? request : request?.url;
      if (url && url.includes(TARGET)) {
        response
          .clone()
          .json()
          .then(emit)
          .catch(() => {});
      }
    } catch (_) {
      // never let capture errors break the page's own request
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__colonistUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (typeof this.__colonistUrl === "string" && this.__colonistUrl.includes(TARGET)) {
      this.addEventListener("load", () => {
        try {
          emit(JSON.parse(this.responseText));
        } catch (_) {
          // response wasn't JSON / didn't parse -- ignore
        }
      });
    }
    return originalSend.apply(this, args);
  };
})();
