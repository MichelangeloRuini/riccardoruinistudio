const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const publicPages = [
  "index.html",
  "clients.html",
  "campaigns.html",
  "films.html",
  "search.html",
  "project.html",
  "brand-identity.html",
  "events.html",
  "magazines-books.html",
  "about.html"
];

function createClassList() {
  const values = new Set();

  return {
    add: value => values.add(value),
    contains: value => values.has(value),
    remove: value => values.delete(value)
  };
}

function createFixture() {
  const ids = new Map();
  const documentListeners = new Map();

  class FakeElement {
    constructor(tagName, ownerDocument) {
      this.tagName = tagName.toUpperCase();
      this.ownerDocument = ownerDocument;
      this.children = [];
      this.listeners = new Map();
      this.attributes = new Map();
      this.classList = createClassList();
      this.dataset = {};
      this.hidden = false;
      this.isConnected = false;
      this.textContent = "";
    }

    set id(value) {
      this._id = value;
      ids.set(value, this);
    }

    get id() {
      return this._id || "";
    }

    set className(value) {
      this._className = value;
      value.split(/\s+/).filter(Boolean).forEach(name => this.classList.add(name));
    }

    get className() {
      return this._className || "";
    }

    append(...children) {
      children.forEach(child => this.appendChild(child));
    }

    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      child.isConnected = this.isConnected;
      return child;
    }

    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }

    dispatch(type, event = {}) {
      (this.listeners.get(type) || []).forEach(listener => listener(event));
    }

    setAttribute(name, value) {
      this.attributes.set(name, value);
    }

    getAttribute(name) {
      return this.attributes.get(name);
    }

    focus() {
      this.ownerDocument.activeElement = this;
    }
  }

  const document = {
    activeElement: null,
    head: null,
    addEventListener(type, listener, options) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push({ listener, options });
    },
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
    getElementById(id) {
      return ids.get(id) || null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".site-nav-cta") return [trigger];
      return [];
    }
  };
  document.body = new FakeElement("body", document);
  document.body.isConnected = true;

  const trigger = new FakeElement("a", document);
  trigger.className = "site-nav-cta";
  trigger.href = "#";
  trigger.isConnected = true;

  const context = {
    document,
    Event: class Event {},
    RRSUnifiedSearch: { normalize: value => String(value).toLowerCase() },
    setTimeout: () => {},
    URLSearchParams,
    window: {
      location: { href: "index.html", search: "" },
      scrollTo: () => {}
    }
  };
  vm.createContext(context);
  vm.runInContext(read("script.js"), context);

  function findByClass(rootElement, className) {
    if (rootElement.classList.contains(className)) return rootElement;
    for (const child of rootElement.children) {
      const match = findByClass(child, className);
      if (match) return match;
    }
    return null;
  }

  function findAllByTag(rootElement, tagName) {
    const matches = rootElement.tagName === tagName.toUpperCase() ? [rootElement] : [];
    rootElement.children.forEach(child => matches.push(...findAllByTag(child, tagName)));
    return matches;
  }

  return {
    context,
    document,
    documentListeners,
    findAllByTag,
    findByClass,
    trigger
  };
}

function clickEvent() {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

test("all public Start a Project links use the shared global hook", () => {
  publicPages.forEach(relativePath => {
    const source = read(relativePath);
    assert.match(source, /<a href="#" class="site-nav-cta">Start a Project<\/a>/);
    assert.match(source, /<script src="script\.js"><\/script>/);
  });
});

test("the modal is created once with its editorial hierarchy and official email", () => {
  const fixture = createFixture();
  const modal = fixture.document.getElementById("startProjectModal");
  const dialog = fixture.findByClass(modal, "start-project-modal__dialog");
  const exitButton = fixture.findByClass(modal, "start-project-modal__exit");
  const kicker = fixture.findByClass(modal, "start-project-modal__kicker");
  const title = fixture.findByClass(modal, "start-project-modal__title");
  const intro = fixture.findByClass(modal, "start-project-modal__intro");
  const separator = fixture.findByClass(modal, "start-project-modal__separator");
  const directLine = fixture.findByClass(modal, "start-project-modal__direct-line");
  const directLabel = fixture.findByClass(modal, "start-project-modal__direct-label");
  const email = fixture.findByClass(modal, "start-project-modal__email");
  const childCount = fixture.document.body.children.length;

  assert.ok(modal);
  assert.equal(dialog.getAttribute("role"), "dialog");
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(dialog.getAttribute("aria-labelledby"), "startProjectModalTitle");
  assert.equal(exitButton.tagName, "BUTTON");
  assert.equal(exitButton.textContent, "EXIT");
  assert.equal(exitButton.getAttribute("aria-label"), "Close Start a Project");
  assert.equal(kicker.textContent, "START A PROJECT");
  assert.equal(title.textContent, "LET’S WORK TOGETHER");
  assert.equal(intro.textContent, "TELL US ABOUT YOUR PROJECT AND WE’LL GET BACK TO YOU AS SOON AS POSSIBLE.");
  assert.equal(separator.getAttribute("aria-hidden"), "true");
  assert.equal(directLabel.textContent, "OR WRITE DIRECTLY TO ");
  assert.deepEqual(directLine.children, [directLabel, email]);
  assert.equal(email.href, "mailto:info@riccardoruinistudio.com");
  assert.equal(email.textContent, "INFO@RICCARDORUINISTUDIO.COM");

  fixture.context.initializeStartProjectModal();
  assert.equal(fixture.document.body.children.length, childCount);
});

test("the form exposes associated labels, correct field semantics, and only the requested options", () => {
  const fixture = createFixture();
  const modal = fixture.document.getElementById("startProjectModal");
  const labels = fixture.findAllByTag(modal, "label");
  const name = fixture.document.getElementById("startProjectName");
  const email = fixture.document.getElementById("startProjectEmail");
  const company = fixture.document.getElementById("startProjectCompany");
  const service = fixture.document.getElementById("startProjectService");
  const description = fixture.document.getElementById("startProjectDescription");
  const budget = fixture.document.getElementById("startProjectBudget");

  assert.deepEqual(
    labels.map(label => [label.textContent, label.htmlFor]),
    [
      ["FULL NAME", "startProjectName"],
      ["EMAIL", "startProjectEmail"],
      ["COMPANY / WEBSITE", "startProjectCompany"],
      ["SERVICE", "startProjectService"],
      ["PROJECT DESCRIPTION", "startProjectDescription"],
      ["ESTIMATED BUDGET", "startProjectBudget"]
    ]
  );
  assert.equal(name.type, "text");
  assert.equal(name.autocomplete, "name");
  assert.equal(name.placeholder, "FULL NAME");
  assert.equal(name.required, true);
  assert.equal(email.type, "email");
  assert.equal(email.autocomplete, "email");
  assert.equal(email.placeholder, "EMAIL");
  assert.equal(email.required, true);
  assert.equal(company.autocomplete, "organization");
  assert.equal(company.placeholder, "COMPANY / WEBSITE");
  assert.equal(description.tagName, "TEXTAREA");
  assert.equal(description.required, true);
  assert.equal(description.placeholder, "PROJECT DESCRIPTION");
  assert.equal(service.selectedIndex, -1);
  assert.equal(budget.selectedIndex, -1);
  assert.deepEqual(
    service.children.map(option => option.textContent),
    [
      "Creative Direction",
      "Brand Identity",
      "Campaigns",
      "Films & Content",
      "Events & Experiences",
      "Publishing",
      "Other"
    ]
  );
  assert.deepEqual(
    budget.children.map(option => option.textContent),
    ["Under €10K", "€10K–25K", "€25K–50K", "€50K–100K", "€100K+", "Prefer not to say"]
  );
});

test("submit is intercepted locally and reveals the honest temporary message without an API call", () => {
  const fixture = createFixture();
  const modal = fixture.document.getElementById("startProjectModal");
  const form = fixture.findByClass(modal, "start-project-modal__form");
  const message = fixture.findByClass(modal, "start-project-modal__form-message");
  const event = clickEvent();
  const initializer = read("script.js").match(
    /function initializeStartProjectModal\(\)[\s\S]*?\n}\n\ninitializeStartProjectModal\(\);/
  );

  assert.equal(message.hidden, true);
  form.dispatch("submit", event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(message.hidden, false);
  assert.equal(
    message.textContent,
    "FORM SUBMISSION WILL BE AVAILABLE SOON. PLEASE CONTACT US AT INFO@RICCARDORUINISTUDIO.COM"
  );
  assert.ok(initializer);
  assert.doesNotMatch(initializer[0], /fetch\(|XMLHttpRequest|\.submit\(\)|action\s*=/);
});

test("click opens without navigation and EXIT closes with scroll and focus restoration", () => {
  const fixture = createFixture();
  const modal = fixture.document.getElementById("startProjectModal");
  const exitButton = fixture.findByClass(modal, "start-project-modal__exit");
  const event = clickEvent();

  fixture.document.activeElement = fixture.trigger;
  fixture.trigger.dispatch("click", event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(fixture.context.window.location.href, "index.html");
  assert.equal(modal.hidden, false);
  assert.equal(fixture.document.body.classList.contains("is-start-project-modal-open"), true);
  assert.equal(fixture.document.activeElement, exitButton);

  exitButton.dispatch("click");
  assert.equal(modal.hidden, true);
  assert.equal(fixture.document.body.classList.contains("is-start-project-modal-open"), false);
  assert.equal(fixture.document.activeElement, fixture.trigger);
});

test("backdrop and Escape close, while clicks inside the dialog do not", () => {
  const fixture = createFixture();
  const modal = fixture.document.getElementById("startProjectModal");
  const backdrop = fixture.findByClass(modal, "start-project-modal__backdrop");
  const dialog = fixture.findByClass(modal, "start-project-modal__dialog");

  fixture.trigger.dispatch("click", clickEvent());
  dialog.dispatch("click", clickEvent());
  assert.equal(modal.hidden, false);

  backdrop.dispatch("click", clickEvent());
  assert.equal(modal.hidden, true);

  fixture.trigger.dispatch("click", clickEvent());
  const escapeEvent = {
    key: "Escape",
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      this.propagationStopped = true;
    }
  };
  const keydown = fixture.documentListeners.get("keydown").at(-1);
  keydown.listener(escapeEvent);

  assert.equal(keydown.options, true);
  assert.equal(escapeEvent.defaultPrevented, true);
  assert.equal(escapeEvent.propagationStopped, true);
  assert.equal(modal.hidden, true);
});

test("focus remains trapped across every form control and restores after close", () => {
  const fixture = createFixture();
  const modal = fixture.document.getElementById("startProjectModal");
  const exitButton = fixture.findByClass(modal, "start-project-modal__exit");
  const directEmail = fixture.findByClass(modal, "start-project-modal__email");
  const keydown = fixture.documentListeners.get("keydown").at(-1);

  fixture.document.activeElement = fixture.trigger;
  fixture.trigger.dispatch("click", clickEvent());
  fixture.document.activeElement = directEmail;

  const tab = {
    key: "Tab",
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  keydown.listener(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(fixture.document.activeElement, exitButton);

  const shiftTab = {
    key: "Tab",
    shiftKey: true,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  keydown.listener(shiftTab);
  assert.equal(shiftTab.defaultPrevented, true);
  assert.equal(fixture.document.activeElement, directEmail);

  exitButton.dispatch("click");
  assert.equal(fixture.document.activeElement, fixture.trigger);
});

test("the poster-like form stays geometric on desktop and becomes a safe single column on mobile", () => {
  const styles = read("style.css");
  const modalStyles = styles.slice(styles.indexOf("/* START A PROJECT MODAL */"));

  assert.match(modalStyles, /\.start-project-modal\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto/);
  assert.match(modalStyles, /\.start-project-modal__dialog\s*\{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;[^}]*overflow:\s*visible/);
  assert.match(modalStyles, /\.start-project-modal__content\s*\{[^}]*width:\s*min\(90vw, 1600px\)[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;[^}]*overflow:\s*visible/);
  assert.doesNotMatch(modalStyles, /\.start-project-modal__content\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(modalStyles, /\.start-project-modal__form\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(modalStyles, /\.start-project-modal__kicker\s*\{[\s\S]*?font-size:\s*clamp\(18px, 1\.4vw, 20px\)/);
  assert.match(modalStyles, /\.start-project-modal__title\s*\{[\s\S]*?font-size:\s*35\.5px;[\s\S]*?font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(modalStyles, /\.start-project-modal__intro\s*\{[\s\S]*?font-size:\s*clamp\(16px, 1\.2vw, 18px\)/);
  assert.match(modalStyles, /\.start-project-modal__field input,[\s\S]*?border:\s*2px solid var\(--site-background\);[\s\S]*?border-radius:\s*0/);
  assert.match(modalStyles, /\.start-project-modal__field input,[\s\S]*?height:\s*clamp\(64px, 4\.8vw, 72px\)[\s\S]*?text-align:\s*center/);
  assert.match(modalStyles, /\.start-project-modal__field textarea\s*\{[\s\S]*?min-height:\s*clamp\(150px, 11vw, 170px\)[\s\S]*?padding:\s*22px 24px/);
  assert.match(modalStyles, /\.start-project-modal__submit\s*\{[\s\S]*?height:\s*clamp\(64px, 4\.8vw, 72px\)[\s\S]*?background:\s*var\(--site-background\);[\s\S]*?color:\s*#000/);
  assert.match(modalStyles, /\.start-project-modal__separator\s*\{[\s\S]*?height:\s*2px;[\s\S]*?background:\s*var\(--site-background\)/);
  assert.match(modalStyles, /\.start-project-modal__email\s*\{[\s\S]*?font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(modalStyles, /\.start-project-modal__exit\s*\{[^}]*position:\s*fixed;[^}]*safe-area-inset-top[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/);
  assert.match(modalStyles, /@media \(max-width: 760px\)[\s\S]*?width:\s*calc\(100% - 40px\)[\s\S]*?\.start-project-modal__title\s*\{[\s\S]*?clamp\(36px, 10vw, 42px\)/);
  assert.match(modalStyles, /@media \(max-width: 760px\)[\s\S]*?\.start-project-modal__form\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(modalStyles, /@media \(max-width: 760px\)[\s\S]*?height:\s*clamp\(60px, 16vw, 68px\)/);
  assert.match(modalStyles, /@media \(max-width: 760px\)[\s\S]*?\.start-project-modal__direct-line\s*\{[\s\S]*?font-size:\s*clamp\(14px, 3\.8vw, 16px\)/);
});

test("the modal alone inverts the existing RRS cream and black palette", () => {
  const styles = read("style.css");
  const modalStyles = styles.slice(styles.indexOf("/* START A PROJECT MODAL */"));

  assert.match(styles, /--site-background:\s*#f8f6f2/);
  assert.match(modalStyles, /\.start-project-modal\s*\{[^}]*background:\s*#000;[^}]*color:\s*var\(--site-background\)/);
  assert.match(modalStyles, /\.start-project-modal__backdrop\s*\{[^}]*background:\s*#000/);
  assert.match(modalStyles, /\.start-project-modal__exit\s*\{[^}]*border:\s*2px solid var\(--site-background\);[^}]*border-radius:\s*0;[^}]*color:\s*var\(--site-background\)/);
  assert.match(modalStyles, /\.start-project-modal__field input,[\s\S]*?border:\s*2px solid var\(--site-background\);[\s\S]*?background:\s*transparent;[\s\S]*?color:\s*var\(--site-background\)/);
  assert.match(modalStyles, /input::placeholder,[\s\S]*?textarea::placeholder\s*\{[^}]*color:\s*var\(--site-background\)/);
  assert.match(modalStyles, /input:-webkit-autofill,[\s\S]*?-webkit-text-fill-color:\s*var\(--site-background\);[\s\S]*?caret-color:\s*var\(--site-background\)/);
  assert.match(modalStyles, /\.start-project-modal__field--select option\s*\{[^}]*background:\s*#000;[^}]*color:\s*var\(--site-background\)/);
  assert.match(modalStyles, /\.start-project-modal__submit\s*\{[^}]*border:\s*2px solid var\(--site-background\);[^}]*background:\s*var\(--site-background\);[^}]*color:\s*#000/);
  assert.match(modalStyles, /\.start-project-modal__submit:hover,[\s\S]*?background:\s*#000;[\s\S]*?color:\s*var\(--site-background\)/);
  assert.match(modalStyles, /\.start-project-modal__separator\s*\{[^}]*background:\s*var\(--site-background\)/);
});

test("Start a Project stays isolated from the Magazines & Books modal", () => {
  const script = read("script.js");
  const initializer = script.match(
    /function initializeStartProjectModal\(\)[\s\S]*?\n}\n\ninitializeStartProjectModal\(\);/
  );

  assert.ok(initializer);
  assert.doesNotMatch(initializer[0], /magazines-books|magazinesBooksModal|is-modal-open/);
  assert.match(initializer[0], /is-start-project-modal-open/);
  assert.match(initializer[0], /stopImmediatePropagation\(\)/);
});

test("datasets, CMS, admin, APIs, and assets remain unchanged", () => {
  execFileSync("git", [
    "diff",
    "--quiet",
    "HEAD",
    "--",
    "data",
    "cms",
    "admin.html",
    "admin-server.js",
    "admin.js",
    "admin-books.js",
    "admin-portfolio.js",
    "assets"
  ], { cwd: root });
});
