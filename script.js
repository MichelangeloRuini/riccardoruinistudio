const nonClickableClients = new Set([
  "Kristin Scott Thomas",
  "Jack Huston"
]);

const clients = [
  "Yasmin Le Bon",
  "Dusan Reljin",
  "Norman Jean Roy",
  "Jennifer Lopez",
  "Jacob Bixenman",
  "Francesco Carrozzini",
  "Brianna Capozzi",
  "Georgia May Jagger",
  "Gia Coppola",
  "Irina Shayk",
  "Chris Colls",
  "Cedric Buchet",
  "Dree Hemingway",
  "Arizona Muse",
  "Henrik Purienne",
  "Mert Alas and Marcus Piggott",
  "Lily Aldridge",
  "Steve Aoki",
  "Juergen Teller",
  "Vittoria Ceretti",
  "Adut Akech",
  "Grace Hartzel",
  "Mikael Jansson",
  "Kaia Gerber",
  "Inez and Vinoodh",
  "Gigi Hadid",
  "Rianne Van Rampaey",
  "Troye Sivan",
  "Ellen Von Unwerth",
  "Terry Richardson",
  "Carmelo Anthony",
  "David Bailey",
  "Kes Glozier",
  "David Sims",
  "Kristin Scott Thomas",
  "Chiara Clemente",
  "Kendall Jenner",
  "Peter Lindbergh",
  "Maria Carla Boscono",
  "Baby Strange",
  "Christy Turlington",
  "Liya Kebede",
  "Mark Borthwick",
  "Kenya Kinski",
  "Will Peltz",
  "Steven Meisel",
  "Karen Elson",
  "Birdy",
  "Steve Mccurry",
  "Bruce Weber",
  "Patricia Arquette",
  "Ben Barnes",
  "Michal Pudelka",
  "Venetia Scott",
  "Sølve Sundsbø",
  "Mario Sorrenti",
  "Gisele Bundchen",
  "Malgosia Bela",
  "Angelo Pennetta",
  "Kasia Smutniak",
  "Stefano Accorsi",
  "Lykke Li",
  "Craig McDean",
  "Jeff Burton",
  "Kate Moss",
  "Blake Lively",
  "Guido Mocafico",
  "Abbey Lee",
  "Penelope Cruz",
  "Sarah Moon",
  "Amber Valletta",
  "Matteo Garrone",
  "Eric Bana",
  "Charlotte Casiraghi",
  "James Franco",
  "Deborah Turbeville",
  "Jack Huston",
  "Nicolas Winding Refn",
  "Nathaniel Goldberg",
  "Frank Miller",
  "Evan Rachel Wood",
  "Chris Evans",
  "Clive Owen",
  "Kirsten Dunst",
  "Stephanie Seymour",
  "Laetitia Casta",
  "Julianne Moore",
  "Chris Cunningham",
  "Karlie Kloss",
  "Clare Danes",
  "Rihanna",
  "David Lynch",
  "Drew Barrymore",
  "Willy Vanderperre",
  "Rie Rasmussen",
  "Philip Lorca Di Corcia"
].map(name => ({
  name,
  clickable: !nonClickableClients.has(name)
}));

const landing = document.getElementById("landing");
const cursor = document.querySelector(".custom-cursor");
const clientsWall = document.getElementById("clientsWall");
const searchInput = document.getElementById("searchInput");

function normalize(text) {
  return RRSUnifiedSearch.normalize(text);
}

function enterSite() {
  if (!landing) return;

  landing.classList.add("is-leaving");

  setTimeout(() => {
    document.body.classList.remove("landing-active");
    document.body.classList.add("entered");
    window.scrollTo(0, 0);
  }, 600);
}

if (landing) {
  const skipLanding = new URLSearchParams(window.location.search).get("skipLanding");

  if (skipLanding === "true") {
    document.body.classList.remove("landing-active");
    document.body.classList.add("entered");
  } else {
    landing.addEventListener("click", enterSite);
  }
}

if (cursor) {
  document.addEventListener("mousemove", event => {
    cursor.style.left = event.clientX + "px";
    cursor.style.top = event.clientY + "px";
  });
}

function getSearchTerms() {
  const campaignRecords = typeof campaigns !== "undefined" ? campaigns : [];
  const portfolioRecords = typeof portfolioProjects !== "undefined"
    ? portfolioProjects
    : [];
  const magazinesBooksRecords = typeof magazinesBooks !== "undefined"
    ? magazinesBooks
    : [];

  return RRSUnifiedSearch.getTerms(
    campaignRecords,
    portfolioRecords,
    magazinesBooksRecords
  );
}

function getSearchSuggestionItems() {
  const campaignRecords = typeof campaigns !== "undefined" ? campaigns : [];
  const portfolioRecords = typeof portfolioProjects !== "undefined"
    ? portfolioProjects
    : [];
  const magazinesBooksRecords = typeof magazinesBooks !== "undefined"
    ? magazinesBooks
    : [];

  return RRSUnifiedSearch.getSuggestionItems(
    campaignRecords,
    portfolioRecords,
    magazinesBooksRecords
  );
}

function ensureMagazinesBooksSearchData() {
  if (typeof magazinesBooks !== "undefined") return;
  if (!document.head || typeof document.createElement !== "function") return;
  if (document.querySelector('script[src="data/magazines-books.js"]')) return;

  const datasetScript = document.createElement("script");
  datasetScript.src = "data/magazines-books.js";
  datasetScript.addEventListener("load", () => {
    document.querySelectorAll(".search").forEach(input => {
      if (input.value.trim().length >= 2) {
        input.dispatchEvent(new Event("input"));
      }
    });
  }, { once: true });
  document.head.appendChild(datasetScript);
}

function goToSearch(value) {
  if (!value) return;
  window.location.href = `search.html?q=${encodeURIComponent(value)}`;
}

function renderClients(list) {
  if (!clientsWall) return;

  clientsWall.innerHTML = "";

  if (list.length === 0) {
    clientsWall.innerHTML = `<span class="client-name">NO RESULTS</span>`;
    return;
  }

  const isMobileClientsLayout = typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 760px)").matches;
  const repeatedList = list.length > 8 && !isMobileClientsLayout
    ? [...list, ...list]
    : list;

  repeatedList.forEach((item, index) => {
    const entry = typeof item === "string"
      ? { name: item, clickable: true }
      : item;
    const span = document.createElement("span");
    span.className = "client-name";
    span.textContent = entry.name;

    if (entry.clickable) {
      span.classList.add("is-clickable");
      span.addEventListener("click", () => {
        goToSearch(entry.name);
      });
    } else {
      span.style.color = "var(--text-grey)";
      span.style.cursor = "default";
    }

    clientsWall.appendChild(span);

    if (index < repeatedList.length - 1) {
      clientsWall.append(" / ");
    }
  });
}

if (searchInput && clientsWall) {
  searchInput.addEventListener("input", () => {
    const value = normalize(searchInput.value.trim());

    if (value === "") {
      clientsWall.classList.remove("is-filtered");
      renderClients(clients);
      return;
    }

    clientsWall.classList.add("is-filtered");

    const terms = getSearchTerms();

    const filtered = terms.filter(term =>
      normalize(term).includes(value)
    );

    renderClients(filtered);
  });

  renderClients(clients);
}

/* SEARCH SUGGESTIONS */

function createSuggestionsBox(input) {
  const field = document.createElement("div");
  const box = document.createElement("div");

  field.className = "search-field";
  box.className = "search-suggestions";
  input.parentNode.insertBefore(field, input);
  field.append(input, box);
  return box;
}

function renderSuggestions(input, box) {
  const value = normalize(input.value.trim());

  if (value.length < 2) {
    box.innerHTML = "";
    box.classList.remove("is-visible");
    input.dataset.activeIndex = "-1";
    return;
  }

  const matches = getSearchSuggestionItems()
    .filter(item => normalize(item.label).includes(value))
    .slice(0, 8);

  if (matches.length === 0) {
    box.innerHTML = "";
    box.classList.remove("is-visible");
    input.dataset.activeIndex = "-1";
    return;
  }

  box.replaceChildren();

  matches.forEach(match => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-suggestion";
    button.textContent = match.label;
    button.dataset.url = match.url;
    box.appendChild(button);
  });

  box.classList.add("is-visible");
  input.dataset.activeIndex = "-1";

  box.querySelectorAll(".search-suggestion").forEach(button => {
    button.addEventListener("click", () => {
      window.location.href = button.dataset.url;
    });
  });
}

function updateActiveSuggestion(input, box, direction) {
  const buttons = Array.from(box.querySelectorAll(".search-suggestion"));
  if (buttons.length === 0) return;

  let index = Number(input.dataset.activeIndex || -1);
  index += direction;

  if (index < 0) index = buttons.length - 1;
  if (index >= buttons.length) index = 0;

  buttons.forEach(button => button.classList.remove("is-active"));
  buttons[index].classList.add("is-active");

  input.dataset.activeIndex = String(index);
}

document.querySelectorAll(".search").forEach(input => {
  const suggestionsBox = createSuggestionsBox(input);

  input.addEventListener("input", () => {
    renderSuggestions(input, suggestionsBox);
  });

  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateActiveSuggestion(input, suggestionsBox, 1);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateActiveSuggestion(input, suggestionsBox, -1);
    }

    if (event.key === "Enter") {
      const active = suggestionsBox.querySelector(".search-suggestion.is-active");

      if (active) {
        window.location.href = active.dataset.url;
      } else {
        goToSearch(input.value.trim());
      }
    }

    if (event.key === "Escape") {
      suggestionsBox.innerHTML = "";
      suggestionsBox.classList.remove("is-visible");
      input.dataset.activeIndex = "-1";
    }
  });
});

document.addEventListener("click", event => {
  if (!event.target.closest(".site-header-left")) {
    document.querySelectorAll(".search-suggestions").forEach(box => {
      box.innerHTML = "";
      box.classList.remove("is-visible");
    });
  }
});

/* MOBILE NAVIGATION */

function initializeMobileHeader() {
  const header = document.querySelector(".site-header");
  const navigation = header && header.querySelector(".site-nav");

  if (!header || !navigation || document.getElementById("siteMenuToggle")) return;

  const menuButton = document.createElement("button");
  const exitButton = document.createElement("button");
  const navigationLinks = Array.from(navigation.querySelectorAll("a"));
  const mobileQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 1100px)")
    : { matches: false };
  let menuIsOpen = false;
  let previouslyFocusedElement = null;

  if (!navigation.id) navigation.id = "siteNavigation";

  menuButton.id = "siteMenuToggle";
  menuButton.className = "site-menu-toggle";
  menuButton.type = "button";
  menuButton.textContent = "MENU";
  menuButton.setAttribute("aria-controls", navigation.id);
  menuButton.setAttribute("aria-expanded", "false");

  exitButton.className = "site-nav-exit";
  exitButton.type = "button";
  exitButton.textContent = "EXIT";
  exitButton.setAttribute("aria-label", "Close navigation");

  navigation.prepend(exitButton);
  header.appendChild(menuButton);

  function setNavigationAvailability() {
    const isMobile = mobileQuery.matches;

    menuButton.hidden = !isMobile;
    exitButton.hidden = !isMobile;

    if (isMobile) {
      navigation.setAttribute("aria-hidden", menuIsOpen ? "false" : "true");
      navigation.inert = !menuIsOpen;
      return;
    }

    navigation.removeAttribute("aria-hidden");
    navigation.inert = false;
  }

  function closeMenu({ restoreFocus = true } = {}) {
    if (!menuIsOpen) return;

    menuIsOpen = false;
    navigation.classList.remove("is-mobile-menu-open");
    document.body.classList.remove("is-mobile-menu-open");
    menuButton.setAttribute("aria-expanded", "false");
    setNavigationAvailability();

    if (restoreFocus && menuButton.isConnected) {
      menuButton.focus();
    }

    previouslyFocusedElement = null;
  }

  function openMenu() {
    if (!mobileQuery.matches || menuIsOpen) return;

    previouslyFocusedElement = document.activeElement;
    menuIsOpen = true;
    navigation.classList.add("is-mobile-menu-open");
    document.body.classList.add("is-mobile-menu-open");
    menuButton.setAttribute("aria-expanded", "true");
    setNavigationAvailability();

    document.querySelectorAll(".search-suggestions").forEach(box => {
      box.innerHTML = "";
      box.classList.remove("is-visible");
    });

    exitButton.focus();
  }

  menuButton.addEventListener("click", openMenu);
  exitButton.addEventListener("click", () => closeMenu());

  navigationLinks.forEach(link => {
    link.addEventListener("click", event => {
      if (!menuIsOpen) return;

      if (link.matches(".site-nav-cta")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeMenu({ restoreFocus: false });
        document.dispatchEvent(new CustomEvent("rrs:open-start-project", {
          detail: { trigger: menuButton }
        }));
        return;
      }

      closeMenu({ restoreFocus: false });
    });
  });

  document.addEventListener("keydown", event => {
    if (!menuIsOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = [exitButton, ...navigationLinks];
    const currentIndex = focusableElements.indexOf(document.activeElement);
    let nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1) nextIndex = 0;
    if (nextIndex < 0) nextIndex = focusableElements.length - 1;
    if (nextIndex >= focusableElements.length) nextIndex = 0;

    event.preventDefault();
    focusableElements[nextIndex].focus();
  }, true);

  function handleBreakpointChange() {
    if (!mobileQuery.matches && menuIsOpen) {
      closeMenu({ restoreFocus: false });
    }

    setNavigationAvailability();
  }

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", handleBreakpointChange);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(handleBreakpointChange);
  }

  setNavigationAvailability();
}

initializeMobileHeader();

/* START A PROJECT */

function initializeStartProjectModal() {
  const triggers = Array.from(document.querySelectorAll(".site-nav-cta"));

  if (triggers.length === 0 || document.getElementById("startProjectModal")) return;

  const modal = document.createElement("div");
  const backdrop = document.createElement("div");
  const dialog = document.createElement("section");
  const exitButton = document.createElement("button");
  const content = document.createElement("div");
  const title = document.createElement("h2");
  const copy = document.createElement("p");
  const email = document.createElement("a");
  let activeTrigger = null;
  let previouslyFocusedElement = null;
  let modalIsOpen = false;

  modal.id = "startProjectModal";
  modal.className = "start-project-modal";
  modal.hidden = true;

  backdrop.className = "start-project-modal__backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  dialog.className = "start-project-modal__dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "startProjectModalTitle");

  exitButton.type = "button";
  exitButton.className = "start-project-modal__exit";
  exitButton.textContent = "EXIT";
  exitButton.setAttribute("aria-label", "Close Start a Project");

  content.className = "start-project-modal__content";
  title.id = "startProjectModalTitle";
  title.className = "start-project-modal__title";
  title.textContent = "START A PROJECT";
  copy.className = "start-project-modal__copy";
  copy.textContent = "FOR PROJECT INQUIRIES, COLLABORATIONS AND NEW BUSINESS:";
  email.className = "start-project-modal__email";
  email.href = "mailto:info@riccardoruinistudio.com";
  email.textContent = "INFO@RICCARDORUINISTUDIO.COM";

  content.append(title, copy, email);
  dialog.append(exitButton, content);
  modal.append(backdrop, dialog);
  document.body.appendChild(modal);

  function openModal(trigger) {
    activeTrigger = trigger;
    previouslyFocusedElement = document.activeElement;
    modalIsOpen = true;
    modal.hidden = false;
    document.body.classList.add("is-start-project-modal-open");
    exitButton.focus();
  }

  function closeModal() {
    if (!modalIsOpen) return;

    modalIsOpen = false;
    modal.hidden = true;
    document.body.classList.remove("is-start-project-modal-open");

    const focusTarget = activeTrigger || previouslyFocusedElement;
    if (focusTarget && focusTarget.isConnected && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }

    activeTrigger = null;
    previouslyFocusedElement = null;
  }

  triggers.forEach(trigger => {
    trigger.addEventListener("click", event => {
      event.preventDefault();
      openModal(trigger);
    });
  });

  document.addEventListener("rrs:open-start-project", event => {
    const requestedTrigger = event.detail && event.detail.trigger;
    openModal(requestedTrigger || triggers[0]);
  });

  exitButton.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  document.addEventListener("keydown", event => {
    if (!modalIsOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = [exitButton, email];
    const currentIndex = focusableElements.indexOf(document.activeElement);
    let nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1) nextIndex = 0;
    if (nextIndex < 0) nextIndex = focusableElements.length - 1;
    if (nextIndex >= focusableElements.length) nextIndex = 0;

    event.preventDefault();
    focusableElements[nextIndex].focus();
  }, true);
}

initializeStartProjectModal();

ensureMagazinesBooksSearchData();
