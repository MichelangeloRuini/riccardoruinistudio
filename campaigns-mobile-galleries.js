(function initializeCampaignsMobileGalleries(global) {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px)";
  const campaignsPage = document.getElementById("campaignsPage");

  if (!campaignsPage) return;

  const mediaQuery = global.matchMedia(MOBILE_QUERY);
  let galleryCleanups = [];

  function getVisualItems(media) {
    return Array.from(media.children)
      .filter(item => item.matches("picture, video"))
      .sort((itemA, itemB) => {
        const itemAIsVideo = itemA.matches("video") ? 1 : 0;
        const itemBIsVideo = itemB.matches("video") ? 1 : 0;
        return itemAIsVideo - itemBIsVideo;
      });
  }

  function createGallery(campaign, campaignIndex) {
    const media = campaign.querySelector(":scope > .campaign-media");
    const info = campaign.querySelector(":scope > .campaign-info");
    if (!media || !info) return null;

    const originalMediaItems = Array.from(media.children);
    const items = getVisualItems(media);
    const isMirrored = campaign.classList.contains("info-right");
    const visualItems = isMirrored ? items.slice().reverse() : items;
    const gallery = document.createElement("div");
    const title = campaign.querySelector(".campaign-title")?.textContent
      .replace(/\s+/g, " ")
      .trim() || `Campaign ${campaignIndex + 1}`;

    gallery.className = "campaign-gallery";
    info.before(gallery);
    visualItems.forEach(item => media.append(item));

    if (isMirrored) {
      media.append(info);
    } else {
      media.prepend(info);
    }

    gallery.append(media);
    media.setAttribute("role", "region");
    media.setAttribute("aria-label", `${title} horizontal campaign`);

    let initialScrollRequest = 0;
    let hasUserExplored = false;
    const loadTargets = items.map(item => item.matches("picture")
      ? item.querySelector("img")
      : item
    ).filter(Boolean);

    function positionMirroredAtStart() {
      initialScrollRequest = 0;
      if (!isMirrored || hasUserExplored) return;

      media.scrollLeft = media.scrollWidth - media.clientWidth;
    }

    function scheduleMirroredStartPosition() {
      if (!isMirrored || hasUserExplored || initialScrollRequest) return;
      initialScrollRequest = global.requestAnimationFrame(positionMirroredAtStart);
    }

    function markAsExplored() {
      hasUserExplored = true;
      if (initialScrollRequest) {
        global.cancelAnimationFrame(initialScrollRequest);
        initialScrollRequest = 0;
      }
    }

    function handleLayoutChange() {
      scheduleMirroredStartPosition();
    }

    media.addEventListener("pointerdown", markAsExplored, { passive: true });
    media.addEventListener("touchstart", markAsExplored, { passive: true });
    media.addEventListener("wheel", markAsExplored, { passive: true });
    global.addEventListener("resize", handleLayoutChange, { passive: true });
    global.addEventListener("load", handleLayoutChange, { once: true });
    loadTargets.forEach(target => {
      target.addEventListener("load", handleLayoutChange, { once: true });
      target.addEventListener("loadedmetadata", handleLayoutChange, { once: true });
    });
    scheduleMirroredStartPosition();

    return () => {
      if (initialScrollRequest) global.cancelAnimationFrame(initialScrollRequest);
      media.removeEventListener("pointerdown", markAsExplored);
      media.removeEventListener("touchstart", markAsExplored);
      media.removeEventListener("wheel", markAsExplored);
      global.removeEventListener("resize", handleLayoutChange);
      global.removeEventListener("load", handleLayoutChange);
      loadTargets.forEach(target => {
        target.removeEventListener("load", handleLayoutChange);
        target.removeEventListener("loadedmetadata", handleLayoutChange);
      });
      media.removeAttribute("role");
      media.removeAttribute("aria-label");
      media.scrollLeft = 0;
      info.remove();
      originalMediaItems.forEach(item => media.append(item));
      gallery.before(info, media);
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
