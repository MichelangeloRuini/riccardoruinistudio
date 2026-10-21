(function initializeMediaUrl(globalObject, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalObject) {
    const configuredResolver = api.createMediaUrlResolver(
      globalObject.RRSMediaConfig || {}
    );

    globalObject.RRSMedia = configuredResolver;

    if (globalObject.document) {
      const hydrateDocument = () => configuredResolver.hydrate(globalObject.document);

      if (globalObject.document.readyState === "loading") {
        globalObject.document.addEventListener("DOMContentLoaded", hydrateDocument, { once: true });
      } else {
        hydrateDocument();
      }
    }
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createMediaUrlModule() {
  "use strict";

  const MODES = new Set(["vercel", "r2", "hybrid"]);
  const ASSET_PATH_PATTERN = /^\/?assets\//;
  const EXTERNAL_URL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

  function normalizeConfig(config) {
    const source = config && typeof config === "object" ? config : {};
    const mode = typeof source.mode === "string" ? source.mode.toLowerCase() : "vercel";

    return Object.freeze({
      mode: MODES.has(mode) ? mode : "vercel",
      r2BaseUrl: typeof source.r2BaseUrl === "string" ? source.r2BaseUrl.replace(/\/+$/, "") : "",
      vercelBaseUrl: typeof source.vercelBaseUrl === "string"
        ? source.vercelBaseUrl.replace(/\/+$/, "")
        : ""
    });
  }

  function splitAssetUrl(value) {
    const url = String(value == null ? "" : value);
    const suffixIndex = url.search(/[?#]/);

    if (suffixIndex === -1) return { path: url, suffix: "" };

    return {
      path: url.slice(0, suffixIndex),
      suffix: url.slice(suffixIndex)
    };
  }

  function isAssetUrl(value) {
    if (typeof value !== "string" || !value || EXTERNAL_URL_PATTERN.test(value)) return false;
    return ASSET_PATH_PATTERN.test(splitAssetUrl(value).path);
  }

  function joinBaseUrl(baseUrl, assetUrl) {
    if (!baseUrl) return assetUrl;

    const { path, suffix } = splitAssetUrl(assetUrl);
    return `${baseUrl}/${path.replace(/^\//, "")}${suffix}`;
  }

  function resolveSrcsetValue(srcset, resolve) {
    if (typeof srcset !== "string" || !srcset.trim()) return srcset;

    return srcset.split(",").map(candidate => {
      const trimmed = candidate.trim();
      const match = trimmed.match(/^(.*?)(\s+(?:\d+(?:\.\d+)?[wx]))$/i);
      const url = match ? match[1] : trimmed;
      const descriptor = match ? match[2] : "";
      return `${resolve(url)}${descriptor}`;
    }).join(", ");
  }

  function createMediaUrlResolver(inputConfig, dependencies = {}) {
    const config = normalizeConfig(inputConfig);
    const ImageConstructor = dependencies.Image
      || (typeof Image === "function" ? Image : null);
    const bindings = new WeakMap();

    function resolveVercel(assetUrl) {
      return isAssetUrl(assetUrl)
        ? joinBaseUrl(config.vercelBaseUrl, assetUrl)
        : assetUrl;
    }

    function resolve(assetUrl) {
      if (!isAssetUrl(assetUrl) || config.mode === "vercel") {
        return resolveVercel(assetUrl);
      }

      return joinBaseUrl(config.r2BaseUrl, assetUrl);
    }

    function resolveSrcset(srcset) {
      return resolveSrcsetValue(srcset, resolve);
    }

    function resolveVercelSrcset(srcset) {
      return resolveSrcsetValue(srcset, resolveVercel);
    }

    function removeBinding(target, key) {
      const targetBindings = bindings.get(target);
      const previous = targetBindings && targetBindings.get(key);

      if (previous) previous();
      if (targetBindings) targetBindings.delete(key);
    }

    function clear(target) {
      const targetBindings = target && bindings.get(target);
      if (!targetBindings) return target;

      Array.from(targetBindings.values()).forEach(cleanup => cleanup());
      targetBindings.clear();
      return target;
    }

    function rememberBinding(target, key, cleanup) {
      let targetBindings = bindings.get(target);

      if (!targetBindings) {
        targetBindings = new Map();
        bindings.set(target, targetBindings);
      }

      targetBindings.set(key, cleanup);
    }

    function bindFallback(errorTarget, key, applyFallback) {
      removeBinding(errorTarget, key);

      if (config.mode !== "hybrid" || typeof errorTarget.addEventListener !== "function") {
        return;
      }

      let attempted = false;
      const handleError = () => {
        if (attempted) return;
        attempted = true;
        applyFallback();
      };

      errorTarget.addEventListener("error", handleError);
      rememberBinding(errorTarget, key, () => {
        errorTarget.removeEventListener("error", handleError);
      });
    }

    function setMediaProperty(element, property, value) {
      const currentValue = typeof element.getAttribute === "function"
        ? element.getAttribute(property)
        : element[property];

      if (currentValue !== value) element[property] = value;
    }

    function setImage(image, assetUrl) {
      if (!image) return image;

      setMediaProperty(image, "src", resolve(assetUrl));
      bindFallback(image, "image", () => {
        setMediaProperty(image, "src", resolveVercel(assetUrl));
      });
      return image;
    }

    function setPicture(picture, image, imageAssetUrl, sources = []) {
      if (!image) return picture;

      const sourceRecords = sources.filter(record => record && record.element);
      sourceRecords.forEach(record => {
        setMediaProperty(record.element, "srcset", resolveSrcset(record.srcset || record.assetUrl || ""));
      });
      setMediaProperty(image, "src", resolve(imageAssetUrl));

      bindFallback(image, "picture", () => {
        sourceRecords.forEach(record => {
          setMediaProperty(
            record.element,
            "srcset",
            resolveVercelSrcset(record.srcset || record.assetUrl || "")
          );
        });
        setMediaProperty(image, "src", resolveVercel(imageAssetUrl));
      });

      return picture;
    }

    function setVideo(video, assetUrl) {
      if (!video) return video;

      setMediaProperty(video, "src", resolve(assetUrl));
      bindFallback(video, "video", () => {
        const shouldResume = video.paused === false;
        setMediaProperty(video, "src", resolveVercel(assetUrl));

        if (typeof video.load === "function") video.load();
        if (shouldResume && typeof video.play === "function") {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
          }
        }
      });
      return video;
    }

    function setVideoSource(video, source, assetUrl) {
      if (!source) return video;

      setMediaProperty(source, "src", resolve(assetUrl));
      bindFallback(video || source, "video-source", () => {
        const shouldResume = video && video.paused === false;
        setMediaProperty(source, "src", resolveVercel(assetUrl));

        if (video && typeof video.load === "function") video.load();
        if (shouldResume && video && typeof video.play === "function") {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
          }
        }
      });
      return video || source;
    }

    function setPoster(video, assetUrl) {
      if (!video || !assetUrl) return video;

      const primaryUrl = resolve(assetUrl);
      setMediaProperty(video, "poster", primaryUrl);
      removeBinding(video, "poster");

      if (config.mode !== "hybrid" || !ImageConstructor) return video;

      let attempted = false;
      const probe = new ImageConstructor();
      const handleError = () => {
        if (attempted) return;
        attempted = true;
        setMediaProperty(video, "poster", resolveVercel(assetUrl));
      };
      const cleanup = () => {
        probe.removeEventListener("error", handleError);
      };

      probe.addEventListener("error", handleError);
      probe.addEventListener("load", cleanup, { once: true });
      rememberBinding(video, "poster", cleanup);
      probe.src = primaryUrl;
      return video;
    }

    function hydrate(root) {
      if (!root || typeof root.querySelectorAll !== "function") return root;

      const processedImages = new Set();

      root.querySelectorAll("picture").forEach(picture => {
        const image = picture.querySelector("img[data-media-src], img[src]");
        const imageAssetUrl = image && (image.dataset.mediaSrc || image.getAttribute("src"));
        if (!image || !isAssetUrl(imageAssetUrl)) return;

        const sources = Array.from(picture.querySelectorAll("source[data-media-srcset], source[srcset]"))
          .map(source => ({
            element: source,
            srcset: source.dataset.mediaSrcset || source.getAttribute("srcset")
          }))
          .filter(record => {
            const firstCandidate = record.srcset && record.srcset.split(",")[0].trim().split(/\s+/)[0];
            return isAssetUrl(firstCandidate);
          });

        setPicture(picture, image, imageAssetUrl, sources);
        processedImages.add(image);
      });

      root.querySelectorAll("img[data-media-src], img[src]").forEach(image => {
        const assetUrl = image.dataset.mediaSrc || image.getAttribute("src");
        if (!processedImages.has(image) && isAssetUrl(assetUrl)) setImage(image, assetUrl);
      });

      root.querySelectorAll("video[data-media-src], video[src]").forEach(video => {
        const assetUrl = video.dataset.mediaSrc || video.getAttribute("src");
        if (isAssetUrl(assetUrl)) setVideo(video, assetUrl);
      });

      root.querySelectorAll("video[data-media-poster], video[poster]").forEach(video => {
        const assetUrl = video.dataset.mediaPoster || video.getAttribute("poster");
        if (isAssetUrl(assetUrl)) setPoster(video, assetUrl);
      });

      root.querySelectorAll("video source[data-media-src], video source[src]").forEach(source => {
        const video = source.closest("video");
        const assetUrl = source.dataset.mediaSrc || source.getAttribute("src");
        if (!video || video.dataset.mediaSrc) return;
        if (isAssetUrl(assetUrl)) setVideoSource(video, source, assetUrl);
      });

      return root;
    }

    return Object.freeze({
      clear,
      config,
      hydrate,
      isAssetUrl,
      resolve,
      resolveSrcset,
      resolveVercel,
      resolveVercelSrcset,
      setImage,
      setPicture,
      setPoster,
      setVideo,
      setVideoSource
    });
  }

  return Object.freeze({
    createMediaUrlResolver,
    isAssetUrl,
    normalizeConfig,
    splitAssetUrl
  });
}));
