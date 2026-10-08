const clients = [
  { name: "Yasmin Le Bon", type: "talent" },
  { name: "Dusan Reljin", type: "talent" },
  { name: "Blazé", type: "brand" },
  { name: "Norman Jean Roy", type: "talent" },
  { name: "Jennifer Lopez", type: "talent" },
  { name: "Jacob Bixenman", type: "talent" },
  { name: "Bulgari", type: "brand" },
  { name: "Francesco Carrozzini", type: "talent" },
  { name: "Brianna Capozzi", type: "talent" },
  { name: "Bulgari Hotel & Residences London", type: "brand" },
  { name: "Georgia May Jagger", type: "talent" },
  { name: "Gia Coppola", type: "talent" },
  { name: "Irina Shayk", type: "talent" },
  { name: "Cerruti", type: "brand" },
  { name: "Chris Colls", type: "talent" },
  { name: "Cedric Buchet", type: "talent" },
  { name: "Chantecler", type: "brand" },
  { name: "Dree Hemingway", type: "talent" },
  { name: "Arizona Muse", type: "talent" },
  { name: "Henrik Purienne", type: "talent" },
  { name: "Diesel", type: "brand" },
  { name: "Mert Alas and Marcus Piggott", type: "talent" },
  { name: "Lily Aldridge", type: "talent" },
  { name: "Dirk Bikkembergs", type: "brand" },
  { name: "Steve Aoki", type: "talent" },
  { name: "Juergen Teller", type: "talent" },
  { name: "Vittoria Ceretti", type: "talent" },
  { name: "Dondup", type: "brand" },
  { name: "Adut Akech", type: "talent" },
  { name: "Grace Hartzel", type: "talent" },
  { name: "Elie Saab", type: "brand" },
  { name: "Mikael Jansson", type: "talent" },
  { name: "Kaia Gerber", type: "talent" },
  { name: "Inez and Vinoodh", type: "talent" },
  { name: "Elisabetta Franchi", type: "brand" },
  { name: "Gigi Hadid", type: "talent" },
  { name: "Rianne Van Rampaey", type: "talent" },
  { name: "Emilio Pucci", type: "brand" },
  { name: "Troye Sivan", type: "talent" },
  { name: "Ellen Von Unwerth", type: "talent" },
  { name: "Terry Richardson", type: "talent" },
  { name: "Ermanno Scervino", type: "brand" },
  { name: "Carmelo Anthony", type: "talent" },
  { name: "David Bailey", type: "talent" },
  { name: "Kes Glozier", type: "talent" },
  { name: "Falconeri", type: "brand" },
  { name: "David Sims", type: "talent" },
  { name: "Chiara Clemente", type: "talent" },
  { name: "Fendi", type: "brand" },
  { name: "Kendall Jenner", type: "talent" },
  { name: "Peter Lindbergh", type: "talent" },
  { name: "Maria Carla Boscono", type: "talent" },
  { name: "Ferragamo", type: "brand" },
  { name: "Baby Strange", type: "talent" },
  { name: "Christy Turlington", type: "talent" },
  { name: "Feudi di San Gregorio", type: "brand" },
  { name: "Liya Kebede", type: "talent" },
  { name: "Mark Borthwick", type: "talent" },
  { name: "Kenya Kinski", type: "talent" },
  { name: "Francesco Scognamiglio", type: "brand" },
  { name: "Will Peltz", type: "talent" },
  { name: "Steven Meisel", type: "talent" },
  { name: "Gucci", type: "brand" },
  { name: "Karen Elson", type: "talent" },
  { name: "Birdy", type: "talent" },
  { name: "Steve Mccurry", type: "talent" },
  { name: "Hogan", type: "brand" },
  { name: "Bruce Weber", type: "talent" },
  { name: "Patricia Arquette", type: "talent" },
  { name: "Intimissimi", type: "brand" },
  { name: "Ben Barnes", type: "talent" },
  { name: "Michal Pudelka", type: "talent" },
  { name: "Venetia Scott", type: "talent" },
  { name: "La Perla", type: "brand" },
  { name: "Sølve Sundsbø", type: "talent" },
  { name: "Mario Sorrenti", type: "talent" },
  { name: "Liberty", type: "brand" },
  { name: "Gisele Bundchen", type: "talent" },
  { name: "Malgosia Bela", type: "talent" },
  { name: "Angelo Pennetta", type: "talent" },
  { name: "Liu Jo", type: "brand" },
  { name: "Kasia Smutniak", type: "talent" },
  { name: "Stefano Accorsi", type: "talent" },
  { name: "Loewe", type: "brand" },
  { name: "Lykke Li", type: "talent" },
  { name: "Craig McDean", type: "talent" },
  { name: "Jeff Burton", type: "talent" },
  { name: "Marella", type: "brand" },
  { name: "Kate Moss", type: "talent" },
  { name: "Blake Lively", type: "talent" },
  { name: "Guido Mocafico", type: "talent" },
  { name: "Marina Rinaldi", type: "brand" },
  { name: "Abbey Lee", type: "talent" },
  { name: "Penelope Cruz", type: "talent" },
  { name: "Missoni", type: "brand" },
  { name: "Sarah Moon", type: "talent" },
  { name: "Amber Valletta", type: "talent" },
  { name: "Matteo Garrone", type: "talent" },
  { name: "Paciotti", type: "brand" },
  { name: "Eric Bana", type: "talent" },
  { name: "Charlotte Casiraghi", type: "talent" },
  { name: "Patrizia Pepe", type: "brand" },
  { name: "James Franco", type: "talent" },
  { name: "Deborah Turbeville", type: "talent" },
  { name: "Nicolas Winding Refn", type: "talent" },
  { name: "Peuterey", type: "brand" },
  { name: "Nathaniel Goldberg", type: "talent" },
  { name: "Frank Miller", type: "talent" },
  { name: "Pinko", type: "brand" },
  { name: "Evan Rachel Wood", type: "talent" },
  { name: "Chris Evans", type: "talent" },
  { name: "Clive Owen", type: "talent" },
  { name: "RED Valentino", type: "brand" },
  { name: "Kirsten Dunst", type: "talent" },
  { name: "Stephanie Seymour", type: "talent" },
  { name: "Trussardi", type: "brand" },
  { name: "Laetitia Casta", type: "talent" },
  { name: "Julianne Moore", type: "talent" },
  { name: "Chris Cunningham", type: "talent" },
  { name: "Valentino", type: "brand" },
  { name: "Karlie Kloss", type: "talent" },
  { name: "Clare Danes", type: "talent" },
  { name: "Vilebrequin", type: "brand" },
  { name: "Rihanna", type: "talent" },
  { name: "David Lynch", type: "talent" },
  { name: "Drew Barrymore", type: "talent" },
  { name: "Vionnet", type: "brand" },
  { name: "Willy Vanderperre", type: "talent" },
  { name: "Rie Rasmussen", type: "talent" },
  { name: "Philip Lorca Di Corcia", type: "talent" },
  { name: "Walk For Giants", type: "brand" }
];

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

  list.forEach((item, index) => {
    const entry = typeof item === "string"
      ? { name: item }
      : item;
    const link = document.createElement("a");
    link.className = "client-name is-clickable";
    link.href = `search.html?q=${encodeURIComponent(entry.name)}`;
    link.textContent = entry.name;

    clientsWall.appendChild(link);

    if (index < list.length - 1) {
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
  const kicker = document.createElement("p");
  const title = document.createElement("h2");
  const intro = document.createElement("p");
  const form = document.createElement("form");
  const nameInput = document.createElement("input");
  const emailInput = document.createElement("input");
  const companyInput = document.createElement("input");
  const serviceSelect = document.createElement("select");
  const descriptionInput = document.createElement("textarea");
  const budgetSelect = document.createElement("select");
  const submitArea = document.createElement("div");
  const submitButton = document.createElement("button");
  const formMessage = document.createElement("p");
  const directContact = document.createElement("div");
  const separator = document.createElement("div");
  const directLine = document.createElement("p");
  const directLabel = document.createElement("span");
  const email = document.createElement("a");
  const serviceOptions = [
    "Creative Direction",
    "Brand Identity",
    "Campaigns",
    "Films & Content",
    "Events & Experiences",
    "Publishing",
    "Other"
  ];
  const budgetOptions = [
    "Under €10K",
    "€10K–25K",
    "€25K–50K",
    "€50K–100K",
    "€100K+",
    "Prefer not to say"
  ];
  let activeTrigger = null;
  let previouslyFocusedElement = null;
  let modalIsOpen = false;

  function createField(labelText, control, modifier = "") {
    const field = document.createElement("div");
    const label = document.createElement("label");

    field.className = `start-project-modal__field${modifier ? ` ${modifier}` : ""}`;
    label.className = "start-project-modal__label";
    label.htmlFor = control.id;
    label.textContent = labelText;
    field.append(label, control);
    return field;
  }

  function appendOptions(select, options) {
    options.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

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
  kicker.className = "start-project-modal__kicker";
  kicker.textContent = "START A PROJECT";
  title.id = "startProjectModalTitle";
  title.className = "start-project-modal__title";
  title.textContent = "LET’S WORK TOGETHER";
  intro.className = "start-project-modal__intro";
  intro.textContent = "TELL US ABOUT YOUR PROJECT AND WE’LL GET BACK TO YOU AS SOON AS POSSIBLE.";

  form.className = "start-project-modal__form";
  form.setAttribute("aria-describedby", "startProjectFormMessage");

  nameInput.id = "startProjectName";
  nameInput.name = "name";
  nameInput.type = "text";
  nameInput.autocomplete = "name";
  nameInput.placeholder = "FULL NAME";
  nameInput.required = true;

  emailInput.id = "startProjectEmail";
  emailInput.name = "email";
  emailInput.type = "email";
  emailInput.autocomplete = "email";
  emailInput.placeholder = "EMAIL";
  emailInput.required = true;

  companyInput.id = "startProjectCompany";
  companyInput.name = "company";
  companyInput.type = "text";
  companyInput.autocomplete = "organization";
  companyInput.placeholder = "COMPANY / WEBSITE";

  serviceSelect.id = "startProjectService";
  serviceSelect.name = "service";
  appendOptions(serviceSelect, serviceOptions);
  serviceSelect.selectedIndex = -1;

  descriptionInput.id = "startProjectDescription";
  descriptionInput.name = "description";
  descriptionInput.rows = 5;
  descriptionInput.required = true;
  descriptionInput.placeholder = "PROJECT DESCRIPTION";

  budgetSelect.id = "startProjectBudget";
  budgetSelect.name = "budget";
  appendOptions(budgetSelect, budgetOptions);
  budgetSelect.selectedIndex = -1;

  submitArea.className = "start-project-modal__submit-area";
  submitButton.type = "submit";
  submitButton.className = "start-project-modal__submit";
  submitButton.textContent = "SEND INQUIRY";
  formMessage.id = "startProjectFormMessage";
  formMessage.className = "start-project-modal__form-message";
  formMessage.setAttribute("aria-live", "polite");
  formMessage.hidden = true;
  formMessage.textContent = "FORM SUBMISSION WILL BE AVAILABLE SOON. PLEASE CONTACT US AT INFO@RICCARDORUINISTUDIO.COM";
  submitArea.append(submitButton, formMessage);

  const serviceField = createField(
    "SERVICE",
    serviceSelect,
    "start-project-modal__field--select"
  );
  const budgetField = createField(
    "ESTIMATED BUDGET",
    budgetSelect,
    "start-project-modal__field--select"
  );

  serviceSelect.addEventListener("change", () => serviceField.classList.add("has-value"));
  budgetSelect.addEventListener("change", () => budgetField.classList.add("has-value"));

  form.append(
    createField("FULL NAME", nameInput),
    createField("EMAIL", emailInput),
    createField("COMPANY / WEBSITE", companyInput),
    serviceField,
    createField("PROJECT DESCRIPTION", descriptionInput, "start-project-modal__field--wide"),
    budgetField,
    submitArea
  );

  directContact.className = "start-project-modal__direct";
  separator.className = "start-project-modal__separator";
  separator.setAttribute("aria-hidden", "true");
  directLine.className = "start-project-modal__direct-line";
  directLabel.className = "start-project-modal__direct-label";
  directLabel.textContent = "OR WRITE DIRECTLY TO ";
  email.className = "start-project-modal__email";
  email.href = "mailto:info@riccardoruinistudio.com";
  email.textContent = "INFO@RICCARDORUINISTUDIO.COM";
  directLine.append(directLabel, email);
  directContact.append(separator, directLine);

  content.append(kicker, title, intro, form, directContact);
  dialog.append(exitButton, content);
  modal.append(backdrop, dialog);
  document.body.appendChild(modal);

  function openModal(trigger) {
    activeTrigger = trigger;
    previouslyFocusedElement = document.activeElement;
    modalIsOpen = true;
    modal.hidden = false;
    formMessage.hidden = true;
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
  form.addEventListener("submit", event => {
    event.preventDefault();
    formMessage.hidden = false;
  });

  document.addEventListener("keydown", event => {
    if (!modalIsOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = [
      exitButton,
      nameInput,
      emailInput,
      companyInput,
      serviceSelect,
      descriptionInput,
      budgetSelect,
      submitButton,
      email
    ];
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
