(function initializeCampaignsMobileGalleries(global) {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px)";
  const campaignsPage = document.getElementById("campaignsPage");

  if (!campaignsPage) return;

  const mediaQuery = global.matchMedia(MOBILE_QUERY);
  let galleryCleanups = [];

  function getVisualItems(media) {
    return Array.from(media.children).sort((itemA, itemB) => {
      const itemAIsVideo = itemA.matches("video") ? 1 : 0;
      const itemBIsVideo = itemB.matches("video") ? 1 : 0;
      return itemAIsVideo - itemBIsVideo;
    });
  }

  function createGallery(campaign, campaignIndex) {
    const media = campaign.querySelector(":scope > .campaign-media");
    if (!media) return null;

    const items = getVisualItems(media);
    const gallery = document.createElement("div");
    const title = campaign.querySelector(".campaign-title")?.textContent
      .replace(/\s+/g, " ")
      .trim() || `Campaign ${campaignIndex + 1}`;

    gallery.className = "campaign-gallery";
    media.before(gallery);
    gallery.append(media);
    media.setAttribute("role", "region");
    media.setAttribute("aria-label", `${title} media gallery`);

    let indicators = null;
    let buttons = [];
    let frameRequest = 0;
    let activeIndex = -1;
    const loadTargets = items.map(item => item.matches("picture")
      ? item.querySelector("img")
      : item
    ).filter(Boolean);

    function setActiveIndex(nextIndex) {
      if (nextIndex === activeIndex) return;
      activeIndex = nextIndex;

      buttons.forEach((button, index) => {
        const isActive = index === activeIndex;
        button.classList.toggle("is-active", isActive);

        if (isActive) {
          button.setAttribute("aria-current", "true");
        } else {
          button.removeAttribute("aria-current");
        }
      });
    }

    function updateActiveIndicator() {
      frameRequest = 0;
      if (!items.length) return;

      const galleryRect = media.getBoundingClientRect();
      let bestIndex = 0;
      let bestVisibleWidth = -1;
      let bestCenterDistance = Infinity;
      const galleryCenter = galleryRect.left + galleryRect.width / 2;

      items.forEach((item, index) => {
        const itemRect = item.getBoundingClientRect();
        const visibleWidth = Math.max(
          0,
          Math.min(itemRect.right, galleryRect.right) - Math.max(itemRect.left, galleryRect.left)
        );
        const itemCenter = itemRect.left + itemRect.width / 2;
        const centerDistance = Math.abs(itemCenter - galleryCenter);

        if (
          visibleWidth > bestVisibleWidth ||
          (visibleWidth === bestVisibleWidth && centerDistance < bestCenterDistance)
        ) {
          bestIndex = index;
          bestVisibleWidth = visibleWidth;
          bestCenterDistance = centerDistance;
        }
      });

      setActiveIndex(bestIndex);
    }

    function scheduleIndicatorUpdate() {
      if (frameRequest) return;
      frameRequest = global.requestAnimationFrame(updateActiveIndicator);
    }

    if (items.length > 1) {
      indicators = document.createElement("div");
      indicators.className = "campaign-gallery-indicators";
      indicators.setAttribute("role", "group");
      indicators.setAttribute("aria-label", `${title} gallery navigation`);
      indicators.style.setProperty("--campaign-gallery-count", items.length);

      buttons = items.map((item, index) => {
        const button = document.createElement("button");
        button.className = "campaign-gallery-dot";
        button.type = "button";
        button.setAttribute("aria-label", `Show media ${index + 1} of ${items.length}`);
        button.addEventListener("click", () => {
          const mediaRect = media.getBoundingClientRect();
          const itemRect = item.getBoundingClientRect();
          const targetLeft = media.scrollLeft + itemRect.left - mediaRect.left;
          const reduceMotion = global.matchMedia("(prefers-reduced-motion: reduce)").matches;

          media.scrollTo({
            left: targetLeft,
            behavior: reduceMotion ? "auto" : "smooth"
          });
        });
        indicators.append(button);
        return button;
      });

      gallery.append(indicators);
      setActiveIndex(0);
    }

    media.addEventListener("scroll", scheduleIndicatorUpdate, { passive: true });
    global.addEventListener("resize", scheduleIndicatorUpdate, { passive: true });
    global.addEventListener("load", scheduleIndicatorUpdate, { once: true });
    loadTargets.forEach(target => {
      target.addEventListener("load", scheduleIndicatorUpdate, { once: true });
      target.addEventListener("loadedmetadata", scheduleIndicatorUpdate, { once: true });
    });
    scheduleIndicatorUpdate();

    return () => {
      if (frameRequest) global.cancelAnimationFrame(frameRequest);
      media.removeEventListener("scroll", scheduleIndicatorUpdate);
      global.removeEventListener("resize", scheduleIndicatorUpdate);
      global.removeEventListener("load", scheduleIndicatorUpdate);
      loadTargets.forEach(target => {
        target.removeEventListener("load", scheduleIndicatorUpdate);
        target.removeEventListener("loadedmetadata", scheduleIndicatorUpdate);
      });
      media.removeAttribute("role");
      media.removeAttribute("aria-label");
      media.scrollLeft = 0;
      gallery.before(media);
      gallery.remove();
    };
  }

  function enableGalleries() {
    if (galleryCleanups.length) return;
    galleryCleanups = Array.from(campaignsPage.querySelectorAll(":scope > .campaign"))
      .map(createGallery)
      .filter(Boolean);
  }

  function disableGalleries() {
    galleryCleanups.forEach(cleanup => cleanup());
    galleryCleanups = [];
  }

  function synchronizeGalleries() {
    if (mediaQuery.matches) {
      enableGalleries();
    } else {
      disableGalleries();
    }
  }

  mediaQuery.addEventListener("change", synchronizeGalleries);
  global.addEventListener("pagehide", () => {
    mediaQuery.removeEventListener("change", synchronizeGalleries);
    disableGalleries();
  }, { once: true });

  synchronizeGalleries();
}(window));
