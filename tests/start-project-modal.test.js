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

  return {
    context,
    document,
    documentListeners,
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

test("the modal is created once with accessible neutral content and the official email", () => {
  const fixture = createFixture();
  const modal = fixture.document.getElementById("startProjectModal");
  const dialog = fixture.findByClass(modal, "start-project-modal__dialog");
  const exitButton = fixture.findByClass(modal, "start-project-modal__exit");
  const email = fixture.findByClass(modal, "start-project-modal__email");
  const childCount = fixture.document.body.children.length;

  assert.ok(modal);
  assert.equal(dialog.getAttribute("role"), "dialog");
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(dialog.getAttribute("aria-labelledby"), "startProjectModalTitle");
  assert.equal(exitButton.tagName, "BUTTON");
  assert.equal(exitButton.textContent, "EXIT");
  assert.equal(email.href, "mailto:info@riccardoruinistudio.com");
  assert.equal(email.textContent, "INFO@RICCARDORUINISTUDIO.COM");

  fixture.context.initializeStartProjectModal();
  assert.equal(fixture.document.body.children.length, childCount);
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

test("datasets, CMS, admin, APIs, assets, and public HTML remain unchanged", () => {
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
    "assets",
    ...publicPages
  ], { cwd: root });
});
