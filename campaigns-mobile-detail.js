(function initializeMobileCampaignDetail(global) {
  "use strict";

  const MOBILE_QUERY = "(max-width: 760px)";

  function createResponsiveImage(campaign, file, className) {
    const picture = document.createElement("picture");
    const image = document.createElement("img");
    const webpFile = file.replace(/\.(jpg|jpeg)$/i, ".webp");

    if (webpFile !== file) {
      const source = document.createElement("source");
      source.type = "image/webp";
      picture.appendChild(source);

      RRSMedia.setPicture(picture, image, `${campaign.path}${file}`, [{
        element: source,
        srcset: `${campaign.path}${webpFile}`
      }]);
    } else {
      RRSMedia.setImage(image, `${campaign.path}${file}`);
    }

    image.className = className;
    image.alt = `${campaign.client} ${campaign.title}`;
    image.loading = "lazy";
    image.decoding = "async";
    if (campaign.border) image.classList.add("has-border");
    picture.appendChild(image);
    return picture;
  }

  function createCampaignCover(campaign) {
    const mediaFiles = Array.isArray(campaign.media) ? campaign.media : [];
    const imageFile = mediaFiles.find(file => !file.toLowerCase().endsWith(".mp4"));
    const coverFile = imageFile || mediaFiles.find(file => file.toLowerCase().endsWith(".mp4"));

    if (!coverFile) return null;
    if (!coverFile.toLowerCase().endsWith(".mp4")) {
      return createResponsiveImage(campaign, coverFile, "campaign-mobile-card__media");
    }

    const video = document.createElement("video");
    const poster = typeof campaign.poster === "string" ? campaign.poster.trim() : "";
    video.className = "campaign-mobile-card__media";
    video.muted = true;
    video.playsInline = true;
    video.preload = "none";
    video.tabIndex = -1;
    video.setAttribute("aria-hidden", "true");
    if (poster) RRSMedia.setPoster(video, `${campaign.path}${poster}`);
    video.dataset.viewportMediaSrc = `${campaign.path}${coverFile}#t=0.001`;
    return video;
  }

  function createCard(campaign) {
    const card = document.createElement("article");
    const client = document.createElement("div");
    const coverButton = document.createElement("button");
    const title = document.createElement("div");
    const hoverLabel = document.createElement("span");
    const cover = createCampaignCover(campaign);

    card.className = "campaign-mobile-card";
    card.dataset.campaignId = campaign.id;
    client.className = "campaign-mobile-card__client";
    client.textContent = campaign.client;
    coverButton.className = "campaign-mobile-card__cover";
    coverButton.type = "button";
    coverButton.dataset.campaignId = campaign.id;
    coverButton.setAttribute("aria-label", `Open ${campaign.client} — ${campaign.title}`);
    hoverLabel.className = "campaign-mobile-card__hover";
    hoverLabel.textContent = "VIEW ↗";
    title.className = "campaign-mobile-card__title";
    title.textContent = campaign.title;

    if (cover) {
      coverButton.append(cover, hoverLabel);
    } else {
      coverButton.disabled = true;
      coverButton.setAttribute("aria-label", `${campaign.client} — ${campaign.title}`);
    }

    card.append(client, coverButton, title);
    return card;
  }

  function createController(root, campaignRecords) {
    if (!root) return null;

    const records = Array.isArray(campaignRecords) ? campaignRecords : [];
    const recordById = new Map(records.map(campaign => [campaign.id, campaign]));
    const mobileQuery = global.matchMedia(MOBILE_QUERY);
    const header = document.querySelector(".site-header");
    const detail = document.createElement("section");
    const detailHeader = document.createElement("div");
    const detailIdentity = document.createElement("h1");
    const detailAside = document.createElement("div");
    const closeButton = document.createElement("button");
    const detailCredits = document.createElement("dl");
    const detailMedia = document.createElement("div");
    let activeCampaign = null;
    let lastTrigger = null;
    let lockedScrollY = 0;
    let savedBodyStyles = null;

    detail.className = "campaign-mobile-detail";
    detail.hidden = true;
    detail.setAttribute("role", "dialog");
    detail.setAttribute("aria-modal", "true");
    detail.setAttribute("aria-labelledby", "campaignMobileDetailTitle");
    detailHeader.className = "campaign-mobile-detail__header";
    detailIdentity.className = "campaign-mobile-detail__identity";
    detailIdentity.id = "campaignMobileDetailTitle";
    detailAside.className = "campaign-mobile-detail__aside";
    closeButton.className = "campaign-mobile-detail__close";
    closeButton.type = "button";
    closeButton.textContent = "CLOSE";
    closeButton.setAttribute("aria-label", "Close campaign detail");
    detailCredits.className = "campaign-mobile-detail__credits";
    detailMedia.className = "campaign-mobile-detail__media";
    detailAside.append(closeButton, detailCredits);
    detailHeader.append(detailIdentity, detailAside);
    detail.append(detailHeader, detailMedia);

    function setDetailOffset() {
      const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
      detail.style.setProperty("--campaign-detail-top", `${headerBottom}px`);
    }

    function createDetailVideo(campaign, file) {
      const video = document.createElement("video");
      const source = document.createElement("source");
      video.className = "campaign-mobile-detail__media-item";
      if (campaign.border) video.classList.add("has-border");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", `${campaign.client} ${campaign.title}`);
      source.type = "video/mp4";
      video.appendChild(source);
      RRSMedia.setVideoSource(video, source, `${campaign.path}${file}`);
      return video;
    }

    function renderIdentity(campaign) {
      const client = document.createElement("span");
      const title = document.createElement("span");
      client.textContent = campaign.client;
      title.textContent = campaign.title;
      detailIdentity.replaceChildren(client, title);
    }

    function renderCredits(campaign) {
      detailCredits.replaceChildren();

      (Array.isArray(campaign.credits) ? campaign.credits : []).forEach(credit => {
        if (!credit || typeof credit.label !== "string") return;
        const values = Array.isArray(credit.value) ? credit.value : [credit.value];
        const cleanValues = values.filter(value => typeof value === "string" && value.trim());
        if (!credit.label.trim() || cleanValues.length === 0) return;

        const group = document.createElement("div");
        const label = document.createElement("dt");
        const value = document.createElement("dd");
        label.textContent = `${credit.label.trim()}:`;

        cleanValues.forEach(item => {
          const link = document.createElement("a");
          link.href = `search.html?q=${encodeURIComponent(item.trim())}`;
          link.textContent = item.trim();
          value.appendChild(link);
        });

        group.append(label, value);
        detailCredits.appendChild(group);
      });

      detailCredits.hidden = detailCredits.childElementCount === 0;
    }

    function renderMedia(campaign) {
      const mediaFiles = Array.isArray(campaign.media) ? campaign.media : [];
      const photographs = mediaFiles.filter(file => !file.toLowerCase().endsWith(".mp4"));
      const videos = mediaFiles.filter(file => file.toLowerCase().endsWith(".mp4"));
      const fragment = document.createDocumentFragment();

      photographs.forEach(file => {
        const picture = createResponsiveImage(campaign, file, "");
        picture.className = "campaign-mobile-detail__media-item";
        fragment.appendChild(picture);
      });
      videos.forEach(file => fragment.appendChild(createDetailVideo(campaign, file)));
      detailMedia.replaceChildren(fragment);
    }

    function lockPageScroll() {
      const body = document.body;
      lockedScrollY = global.scrollY;
      savedBodyStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow
      };
      body.style.position = "fixed";
      body.style.top = `-${lockedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      body.classList.add("is-campaign-detail-open");
    }

    function unlockPageScroll() {
      if (!savedBodyStyles) return;
      const body = document.body;
      Object.assign(body.style, savedBodyStyles);
      body.classList.remove("is-campaign-detail-open");
      savedBodyStyles = null;
      global.scrollTo(0, lockedScrollY);
    }

    function clearDetailMedia() {
      detailMedia.querySelectorAll("video").forEach(video => {
        video.pause();
        RRSMedia.clear(video);
        video.querySelectorAll("source").forEach(source => source.removeAttribute("src"));
        video.load();
      });
      detailMedia.replaceChildren();
    }

    function getFocusableElements() {
      return Array.from(detail.querySelectorAll(
        'button:not([disabled]), video[controls], a[href], [tabindex]:not([tabindex="-1"])'
      )).filter(element => !element.hidden && typeof element.focus === "function");
    }

    function setBackgroundAvailability(isDetailOpen) {
      Array.from(root.children).forEach(child => {
        if (child === detail) return;

        if (isDetailOpen) {
          child.setAttribute("aria-hidden", "true");
          child.setAttribute("inert", "");
          return;
        }

        child.removeAttribute("aria-hidden");
        child.removeAttribute("inert");
      });
    }

    function openDetail(campaign, trigger) {
      if (!mobileQuery.matches || activeCampaign) return;
      activeCampaign = campaign;
      lastTrigger = trigger;
      renderIdentity(campaign);
      renderCredits(campaign);
      renderMedia(campaign);
      setDetailOffset();
      detail.hidden = false;
      detail.scrollTop = 0;
      setBackgroundAvailability(true);
      lockPageScroll();
      closeButton.focus();
    }

    function closeDetail({ restoreFocus = true } = {}) {
      if (!activeCampaign) return;
      const focusTarget = lastTrigger;
      activeCampaign = null;
      detail.hidden = true;
      clearDetailMedia();
      detailIdentity.replaceChildren();
      detailCredits.replaceChildren();
      setBackgroundAvailability(false);
      unlockPageScroll();
      lastTrigger = null;

      if (restoreFocus && focusTarget?.isConnected) {
        global.requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
      }
    }

    function trapFocus(event) {
      if (!activeCampaign || event.key !== "Tab") return;
      const focusable = getFocusableElements();
      const first = focusable[0] || closeButton;
      const last = focusable[focusable.length - 1] || closeButton;
      const focusOutside = !detail.contains(document.activeElement);

      if (event.shiftKey && (document.activeElement === first || focusOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusOutside)) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleRootClick(event) {
      const trigger = event.target.closest(".campaign-mobile-card__cover");
      if (!trigger || !mobileQuery.matches) return;
      const campaign = recordById.get(trigger.dataset.campaignId);
      if (campaign) openDetail(campaign, trigger);
    }

    function handleKeydown(event) {
      if (event.key === "Escape" && activeCampaign) {
        event.preventDefault();
        closeDetail();
        return;
      }
      trapFocus(event);
    }

    function handleResize() {
      if (activeCampaign) setDetailOffset();
    }

    function prepareForRender() {
      closeDetail({ restoreFocus: false });
      detail.remove();
    }

    function refresh() {
      const hasCards = Boolean(root.querySelector(".campaign-mobile-card__cover"));
      if (mobileQuery.matches && hasCards && !detail.isConnected) root.appendChild(detail);
      if ((!mobileQuery.matches || !hasCards) && detail.isConnected) detail.remove();
    }

    function handleBreakpointChange(event) {
      if (!event.matches) closeDetail({ restoreFocus: false });
      refresh();
    }

    function destroy() {
      closeDetail({ restoreFocus: false });
      root.removeEventListener("click", handleRootClick);
      closeButton.removeEventListener("click", closeDetail);
      document.removeEventListener("keydown", handleKeydown);
      global.removeEventListener("resize", handleResize);
      mobileQuery.removeEventListener("change", handleBreakpointChange);
      detail.remove();
    }

    root.addEventListener("click", handleRootClick);
    closeButton.addEventListener("click", closeDetail);
    document.addEventListener("keydown", handleKeydown);
    global.addEventListener("resize", handleResize, { passive: true });
    global.addEventListener("pagehide", destroy, { once: true });
    mobileQuery.addEventListener("change", handleBreakpointChange);

    return {
      destroy,
      matches: () => mobileQuery.matches,
      prepareForRender,
      refresh
    };
  }

  global.RRSMobileCampaignDetail = {
    create: createController,
    createCard
  };

  const campaignsPage = document.getElementById("campaignsPage");
  const campaignRecords = typeof campaigns !== "undefined" ? campaigns : [];

  if (campaignsPage && typeof renderProject === "function") {
    const controller = createController(campaignsPage, campaignRecords);

    function renderCampaignsPage() {
      controller.prepareForRender();
      RRSViewportVideoPlayback.unobserve(campaignsPage);

      if (controller.matches()) {
        const list = document.createElement("div");
        list.className = "campaigns-mobile-list";
        campaignRecords.forEach(campaign => list.appendChild(createCard(campaign)));
        campaignsPage.replaceChildren(list);
      } else {
        campaignsPage.innerHTML = campaignRecords
          .map((campaign, index) => renderProject(campaign, index, campaign.media))
          .join("");
        RRSMedia.hydrate(campaignsPage);
      }

      RRSViewportVideoPlayback.observe(campaignsPage);
      controller.refresh();
    }

    global.matchMedia(MOBILE_QUERY).addEventListener("change", renderCampaignsPage);
    renderCampaignsPage();
  }
}(window));
