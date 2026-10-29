(function initializeMediaConfig(globalObject) {
  "use strict";

  const config = Object.freeze({
    mode: "r2",
    r2BaseUrl: "https://rrs-media.michelangelo-723.workers.dev",
    vercelBaseUrl: ""
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = config;
  }

  if (globalObject) {
    globalObject.RRSMediaConfig = config;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
