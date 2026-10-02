(function initializeFilmsPage() {
  "use strict";

  const filmsPage = document.getElementById("filmsPage");
  const grid = document.getElementById("filmsGrid");
  const modal = document.getElementById("filmsModal");
  const modalContent = modal && modal.querySelector(".films-modal__content");
  const modalVideo = modal && modal.querySelector(".films-modal__video");
  const modalTitle = document.getElementById("filmsModalTitle");
  const modalCredits = document.getElementById("filmsModalCredits");
  const closeButton = modal && modal.querySelector(".films-modal__close");
  let lastFocusedCard = null;
  let modalIsOpen = false;

  if (
    !filmsPage
    || !grid
    || !modal
    || !modalContent
    || !modalVideo
    || !modalTitle
    || !modalCredits
    || !closeButton
    || typeof RRSRenderFilmsGrid !== "function"
  ) {
    return;
  }

  function safePlay(video) {
    const playPromise = video.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Playback may be blocked until the browser receives a user gesture.
      });
    }
  }

  function renderModalTitle(campaign) {
    const client = document.createElement("span");
    const project = document.createElement("span");

    client.textContent = campaign.client;
    project.textContent = campaign.title;
    modalTitle.replaceChildren(client, project);
  }

  function renderModalCredits(campaign) {
    modalCredits.replaceChildren();

    if (!Array.isArray(campaign.credits)) {
      modalCredits.hidden = true;
      return;
    }

    campaign.credits.forEach(credit => {
      if (!credit || typeof credit.label !== "string") return;

      const values = Array.isArray(credit.value) ? credit.value : [credit.value];
      const cleanValues = values
        .filter(value => typeof value === "string" && value.trim())
        .map(value => value.trim());
      const label = credit.label.trim();

      if (!label || cleanValues.length === 0) return;

      const group = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");

      term.textContent = label;
      description.textContent = cleanValues.join("\n");
      group.append(term, description);
      modalCredits.appendChild(group);
    });

    modalCredits.hidden = modalCredits.childElementCount === 0;
  }

  function getFocusableElements() {
    return Array.from(modalContent.querySelectorAll(
      'button:not([disabled]), video[controls], [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(element => !element.hidden && typeof element.focus === "function");
  }

  function trapFocus(event) {
    if (!modalIsOpen || event.key !== "Tab") return;

    const focusableElements = getFocusableElements();

    if (focusableElements.length === 0) {
      event.preventDefault();
      modalContent.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const focusIsOutside = !modalContent.contains(document.activeElement);

    if (event.shiftKey && (document.activeElement === firstElement || focusIsOutside)) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && (document.activeElement === lastElement || focusIsOutside)) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function openModal(record, card) {
    lastFocusedCard = card;
    modalIsOpen = true;
    RRSViewportVideoPlayback.unobserve(grid);
    renderModalTitle(record.campaign);
    renderModalCredits(record.campaign);
    modalVideo.muted = true;
    modalVideo.src = record.source;
    modalVideo.load();
    modal.hidden = false;
    document.body.classList.add("is-films-modal-open");
    closeButton.focus();
    safePlay(modalVideo);
  }

  function closeModal() {
    if (!modalIsOpen) return;

    modalIsOpen = false;
    modalVideo.pause();

    try {
      modalVideo.currentTime = 0;
    } catch {
      // Seeking can fail before video metadata is available.
    }

    modalVideo.removeAttribute("src");
    modalVideo.load();
    modal.hidden = true;
    document.body.classList.remove("is-films-modal-open");
    modalTitle.replaceChildren();
    modalCredits.replaceChildren();

    if (lastFocusedCard && lastFocusedCard.isConnected) {
      lastFocusedCard.focus();
    }

    lastFocusedCard = null;
    RRSViewportVideoPlayback.observe(grid);
  }

  RRSRenderFilmsGrid(campaigns, grid, openModal);
  RRSViewportVideoPlayback.observe(grid);

  modal.querySelectorAll("[data-films-close]").forEach(control => {
    control.addEventListener("click", event => {
      if (control.classList.contains("films-modal__backdrop") && event.target !== control) {
        return;
      }

      closeModal();
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modalIsOpen) {
      event.preventDefault();
      closeModal();
      return;
    }

    trapFocus(event);
  });

  document.addEventListener("visibilitychange", () => {
    if (!modalIsOpen) return;

    if (document.hidden) {
      modalVideo.pause();
    } else {
      safePlay(modalVideo);
    }
  });

  window.addEventListener("pagehide", () => {
    modalVideo.pause();
    RRSViewportVideoPlayback.unobserve(grid);
  }, { once: true });
}());
