(function initializeViewportVideoPlayback(global) {
  const VIDEO_SELECTOR = "video[data-viewport-playback]";
  const observedVideos = new Set();
  const visibleVideos = new Set();

  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        const shouldPlay = entry.isIntersecting && entry.intersectionRatio >= 0.5;

        if (!video.isConnected) {
          unobserveVideo(video);
          return;
        }

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

    if (root instanceof Element && root.matches(VIDEO_SELECTOR)) {
      videos.push(root);
    }

    if (root && typeof root.querySelectorAll === "function") {
      videos.push(...root.querySelectorAll(VIDEO_SELECTOR));
    }

    return videos;
  }

  function observeVideo(video) {
    if (observedVideos.has(video)) return;

    video.autoplay = false;
    video.removeAttribute("autoplay");
    video.pause();
    observedVideos.add(video);

    if (observer) observer.observe(video);
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
