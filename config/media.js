(function initializeMediaConfig(globalObject) {
  "use strict";

  const config = Object.freeze({
    mode: "vercel",
    r2BaseUrl: "https://pub-822b6246510a4290a7df6d3bd005eef6.r2.dev",
    vercelBaseUrl: ""
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = config;
  }

  if (globalObject) {
    globalObject.RRSMediaConfig = config;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
