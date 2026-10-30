(function initializeViewportVideoPlayback(global) {
  const VIDEO_SELECTOR = "video[data-viewport-playback]";
  const observedVideos = new Set();
  const visibleVideos = new Set();
  const loadedVideos = new WeakSet();

  function loadVideoMedia(video) {
    if (loadedVideos.has(video)) return;

    const videoAssetUrl = video.dataset.viewportMediaSrc;
    const source = video.querySelector("source[data-viewport-media-src]");
    const sourceAssetUrl = source?.dataset.viewportMediaSrc;

    if (videoAssetUrl) {
      video.preload = "metadata";
      RRSMedia.setVideo(video, videoAssetUrl);
      video.load();
      loadedVideos.add(video);
    } else if (source && sourceAssetUrl) {
      video.preload = "metadata";
      RRSMedia.setVideoSource(video, source, sourceAssetUrl);
      loadedVideos.add(video);
    }
  }

  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        const supportsPlayback = video.hasAttribute("data-viewport-playback");
        const shouldPlay = supportsPlayback
          && entry.isIntersecting
          && entry.intersectionRatio >= 0.5;

        if (!video.isConnected) {
          unobserveVideo(video);
          return;
        }

        if (entry.isIntersecting) loadVideoMedia(video);

        if (!shouldPlay) {
          visibleVideos.delete(video);
          video.pause();
          return;
        }

        visibleVideos.add(video);

        if (document.hidden) return;

        const playPromise = video.play();

        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            // Playback can be blocked transiently while the page is loading.
          });
        }
      });
    }, {
      threshold: [0, 0.5]
    })
    : null;

  function collectVideos(root) {
    const videos = [];

    if (root instanceof Element && (
      root.matches(VIDEO_SELECTOR)
      || root.matches("video[data-viewport-media-src]")
      || (root.matches("video") && root.querySelector("source[data-viewport-media-src]"))
    )) {
      videos.push(root);
    }

    if (root && typeof root.querySelectorAll === "function") {
      root.querySelectorAll("video").forEach(video => {
        if (
          video.matches(VIDEO_SELECTOR)
          || video.dataset.viewportMediaSrc
          || video.querySelector("source[data-viewport-media-src]")
        ) {
          videos.push(video);
        }
      });
    }

    return videos;
  }

  function observeVideo(video) {
    if (observedVideos.has(video)) return;

    video.autoplay = false;
    video.removeAttribute("autoplay");
    if (!video.src && !video.querySelector("source[src]")) video.preload = "none";
    video.pause();
    observedVideos.add(video);

    if (observer) observer.observe(video);
    else loadVideoMedia(video);
  }

  function unobserveVideo(video) {
    video.pause();
    visibleVideos.delete(video);
    observedVideos.delete(video);

    if (observer) observer.unobserve(video);
  }

  function observe(root = document) {
    collectVideos(root).forEach(observeVideo);
  }

  function unobserve(root = document) {
    collectVideos(root).forEach(unobserveVideo);
  }

  function disconnect() {
    observedVideos.forEach(video => video.pause());
    observedVideos.clear();
    visibleVideos.clear();

    if (observer) observer.disconnect();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      visibleVideos.forEach(video => video.pause());
      return;
    }

    visibleVideos.forEach(video => {
      const playPromise = video.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Playback can remain blocked until the next visibility change.
        });
      }
    });
  });

  global.addEventListener("pagehide", disconnect, { once: true });

  global.RRSViewportVideoPlayback = {
    disconnect,
    observe,
    unobserve
  };
}(window));
