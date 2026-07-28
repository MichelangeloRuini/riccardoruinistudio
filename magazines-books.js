(function initializeMagazinesBooks() {
  "use strict";

  const grid = document.getElementById("magazinesBooksGrid");
  const emptyState = document.getElementById("magazinesBooksEmpty");
  const modal = document.getElementById("magazinesBooksModal");
  const modalContent = modal && modal.querySelector(".magazines-books-modal__content");
  const modalVideo = modal && modal.querySelector(".magazines-books-modal__video");
  const modalTitle = document.getElementById("magazinesBooksModalTitle");
  const modalCredits = document.getElementById("magazinesBooksModalCredits");
  const closeButton = modal && modal.querySelector(".magazines-books-modal__close");
  const observedVideos = new Set();
  const visibleVideos = new Set();
  let lastFocusedCard = null;
  let modalIsOpen = false;

  if (!grid || !emptyState || !modal || !modalContent || !modalVideo || !modalTitle || !modalCredits || !closeButton) {
    return;
  }

  function safePlay(video) {
    const playPromise = video.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay can be blocked until the user interacts with the page.
      });
    }
  }

  function pauseGridVideos() {
    observedVideos.forEach(video => video.pause());
  }

  function resumeVisibleVideos() {
    if (modalIsOpen || document.hidden) return;

    visibleVideos.forEach(video => {
      if (video.isConnected && !video.classList.contains("has-load-error")) {
        safePlay(video);
      }
    });
  }

  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        const isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;

        if (!video.isConnected) {
          visibleVideos.delete(video);
          observedVideos.delete(video);
          observer.unobserve(video);
          return;
        }

        if (!isVisible) {
          visibleVideos.delete(video);
          video.pause();
          return;
        }

        visibleVideos.add(video);

        if (!modalIsOpen && !document.hidden && !video.classList.contains("has-load-error")) {
          safePlay(video);
        }
      });
    }, {
      threshold: [0, 0.5]
    })
    : null;

  function isValidRecord(record) {
    return Boolean(
      record
      && typeof record === "object"
      && typeof record.id === "string"
      && record.id.trim()
      && typeof record.title === "string"
      && record.title.trim()
      && typeof record.video === "string"
      && record.video.trim()
      && !record.video.includes("..")
      && !/^(?:[a-z]+:)?\/\//i.test(record.video)
    );
  }

  function validCredits(record) {
    if (!Array.isArray(record.credits)) return [];

    return record.credits.filter(credit => (
      credit
      && typeof credit === "object"
      && typeof credit.label === "string"
      && credit.label.trim()
      && typeof credit.value === "string"
      && credit.value.trim()
    ));
  }

  function renderCredits(record) {
    modalCredits.replaceChildren();

    validCredits(record).forEach(credit => {
      const group = document.createElement("div");
      const label = document.createElement("dt");
      const value = document.createElement("dd");

      label.textContent = credit.label.trim();
      value.textContent = credit.value.trim();
      group.append(label, value);
      modalCredits.appendChild(group);
    });

    modalCredits.hidden = modalCredits.childElementCount === 0;
  }

  function openModal(record, card) {
    lastFocusedCard = card;
    modalIsOpen = true;
    pauseGridVideos();
    modalTitle.textContent = record.title.trim();
    renderCredits(record);
    modalVideo.muted = true;
    modalVideo.src = record.video.trim();
    modalVideo.load();
    modal.hidden = false;
    document.body.classList.add("is-modal-open");
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
      // Some browsers reject seeks before metadata is available.
    }

    modalVideo.removeAttribute("src");
    modalVideo.load();
    modal.hidden = true;
    document.body.classList.remove("is-modal-open");
    modalTitle.textContent = "";
    modalCredits.replaceChildren();

    if (lastFocusedCard && lastFocusedCard.isConnected) {
      lastFocusedCard.focus();
    }

    lastFocusedCard = null;
    resumeVisibleVideos();
  }

  function createCard(record) {
    const card = document.createElement("button");
    const video = document.createElement("video");

    card.type = "button";
    card.className = "magazines-books-card";
    card.setAttribute("aria-label", `Open ${record.title.trim()}`);

    video.className = "magazines-books-video";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = record.video.trim();
    video.setAttribute("aria-hidden", "true");
    video.tabIndex = -1;

    video.addEventListener("error", () => {
      video.classList.add("has-load-error");
      video.pause();
      visibleVideos.delete(video);
      card.classList.add("has-video-error");
    });

    card.addEventListener("click", () => {
      openModal(record, card);
    });

    card.appendChild(video);
    observedVideos.add(video);

    if (observer) {
      observer.observe(video);
    } else {
      video.pause();
    }

    return card;
  }

  const records = typeof magazinesBooks !== "undefined" && Array.isArray(magazinesBooks)
    ? magazinesBooks.filter(isValidRecord)
    : [];

  records.forEach(record => {
    grid.appendChild(createCard(record));
  });

  if (records.length === 0) {
    grid.hidden = true;
    emptyState.hidden = false;
  }

  modal.querySelectorAll("[data-magazines-books-close]").forEach(control => {
    control.addEventListener("click", event => {
      if (
        control.classList.contains("magazines-books-modal__backdrop")
        && event.target !== control
      ) {
        return;
      }

      closeModal();
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modalIsOpen) {
      event.preventDefault();
      closeModal();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseGridVideos();
      modalVideo.pause();
      return;
    }

    if (modalIsOpen) {
      safePlay(modalVideo);
    } else {
      resumeVisibleVideos();
    }
  });

  window.addEventListener("pagehide", () => {
    pauseGridVideos();
    modalVideo.pause();

    if (observer) {
      observer.disconnect();
    }

    observedVideos.clear();
    visibleVideos.clear();
  }, { once: true });
}());
