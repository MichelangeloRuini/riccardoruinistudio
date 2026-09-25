const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const script = read("script.js");
const styles = read("style.css");
const mobileHeaderMarker = "GLOBAL MOBILE / TABLET HEADER SHELL";
const responsiveClientsMarker = "GLOBAL RESPONSIVE FOOTER / MOBILE CLIENTS";
const mobileHeaderStyles = styles.slice(
  styles.indexOf(mobileHeaderMarker),
  styles.indexOf(responsiveClientsMarker)
);
const expectedLabels = [
  "START A PROJECT",
  "Clients",
  "Campaigns",
  "Films",
  "Visual Identity",
  "Events",
  "Magazines & Books",
  "About"
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
  const customEvents = [];
  const mediaQuery = {
    matches: true,
    listener: null,
    addEventListener(type, listener) {
      if (type === "change") this.listener = listener;
    }
  };

  class FakeElement {
    constructor(tagName, ownerDocument) {
      this.tagName = tagName.toUpperCase();
      this.ownerDocument = ownerDocument;
      this.children = [];
      this.listeners = new Map();
      this.attributes = new Map();
      this.classList = createClassList();
      this.hidden = false;
      this.inert = false;
      this.isConnected = true;
      this.innerHTML = "content";
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

    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }

    prepend(child) {
      this.children.unshift(child);
      child.parentNode = this;
    }

    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }

    dispatch(type, event = {}) {
      (this.listeners.get(type) || []).forEach(listener => listener(event));
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    getAttribute(name) {
      return this.attributes.get(name);
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    matches(selector) {
      return selector === ".site-nav-cta" && this.classList.contains("site-nav-cta");
    }

    focus() {
      this.ownerDocument.activeElement = this;
    }
  }

  const document = {
    activeElement: null,
    addEventListener(type, listener, options) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push({ listener, options });
    },
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
    dispatchEvent(event) {
      customEvents.push(event);
      (documentListeners.get(event.type) || []).forEach(({ listener }) => listener(event));
      return true;
    },
    getElementById(id) {
      return ids.get(id) || null;
    },
    querySelector(selector) {
      return selector === ".site-header" ? header : null;
    },
    querySelectorAll(selector) {
      return selector === ".search-suggestions" ? [suggestions] : [];
    }
  };

  document.body = new FakeElement("body", document);
  const header = new FakeElement("header", document);
  const navigation = new FakeElement("nav", document);
  const suggestions = new FakeElement("div", document);
  suggestions.className = "search-suggestions is-visible";
  const links = expectedLabels.map((label, index) => {
    const link = new FakeElement("a", document);
    link.textContent = label;
    if (index === 0) link.className = "site-nav-cta";
    if (index === 2) link.classList.add("active");
    navigation.appendChild(link);
    return link;
  });

  header.querySelector = selector => selector === ".site-nav" ? navigation : null;
  navigation.querySelectorAll = selector => selector === "a" ? links : [];
  header.appendChild(navigation);

  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  const context = {
    CustomEvent,
    document,
    window: {
      matchMedia(query) {
        assert.equal(query, "(max-width: 1100px)");
        return mediaQuery;
      }
    }
  };
  vm.createContext(context);
  const start = script.indexOf("function initializeMobileHeader()");
  const call = "initializeMobileHeader();";
  const end = script.indexOf(call, start) + call.length;
  vm.runInContext(script.slice(start, end), context);

  return {
    context,
    customEvents,
    document,
    documentListeners,
    header,
    links,
    mediaQuery,
    navigation,
    suggestions
  };
}

function eventFor(key) {
  return {
    key,
    shiftKey: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      this.propagationStopped = true;
    }
  };
}

test("the 1100px shell hides the desktop nav and exposes MENU without changing desktop CSS", () => {
  const headStyles = execFileSync("git", ["show", "HEAD:style.css"], {
    cwd: root,
    encoding: "utf8"
  });
  const mobileBlock = mobileHeaderStyles.slice(
    mobileHeaderStyles.indexOf("@media (max-width: 1100px)")
  );

  assert.ok(styles.startsWith(headStyles));
  assert.match(mobileBlock, /\.site-menu-toggle:not\(\[hidden\]\)\s*\{\s*display:\s*inline-flex/);
  assert.match(mobileBlock, /\.site-nav\.site-nav--editorial\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(mobileBlock, /visibility:\s*hidden/);
  assert.match(mobileBlock, /\.is-mobile-menu-open\s*\{[\s\S]*?visibility:\s*visible/);
  assert.match(headStyles, /GLOBAL MOBILE \/ TABLET HEADER SHELL/);
  assert.match(headStyles, /\.site-menu-toggle,/);
  assert.match(headStyles, /\.site-nav-exit/);
});

test("mobile navigation reuses the real eight links and preserves their order and active state", () => {
  const fixture = createFixture();
  const menuButton = fixture.document.getElementById("siteMenuToggle");

  assert.deepEqual(fixture.links.map(link => link.textContent), expectedLabels);
  assert.equal(fixture.links[2].classList.contains("active"), true);
  assert.equal(menuButton.tagName, "BUTTON");
  assert.equal(menuButton.textContent, "MENU");
  assert.equal(menuButton.getAttribute("aria-controls"), fixture.navigation.id);
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(fixture.navigation.getAttribute("aria-hidden"), "true");
  assert.equal(fixture.navigation.inert, true);

  const childCount = fixture.header.children.length;
  fixture.context.initializeMobileHeader();
  assert.equal(fixture.header.children.length, childCount);
});

test("MENU, EXIT, Escape, focus trap, scroll lock, and focus restoration work", () => {
  const fixture = createFixture();
  const menuButton = fixture.document.getElementById("siteMenuToggle");
  const exitButton = fixture.navigation.children[0];
  const keydown = fixture.documentListeners.get("keydown")[0];

  fixture.document.activeElement = menuButton;
  menuButton.dispatch("click");
  assert.equal(menuButton.getAttribute("aria-expanded"), "true");
  assert.equal(fixture.navigation.classList.contains("is-mobile-menu-open"), true);
  assert.equal(fixture.document.body.classList.contains("is-mobile-menu-open"), true);
  assert.equal(fixture.navigation.inert, false);
  assert.equal(fixture.document.activeElement, exitButton);
  assert.equal(fixture.suggestions.classList.contains("is-visible"), false);
  assert.equal(keydown.options, true);

  const tab = eventFor("Tab");
  keydown.listener(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(fixture.document.activeElement, fixture.links[0]);

  exitButton.dispatch("click");
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(fixture.document.body.classList.contains("is-mobile-menu-open"), false);
  assert.equal(fixture.document.activeElement, menuButton);

  menuButton.dispatch("click");
  const escape = eventFor("Escape");
  keydown.listener(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true);
  assert.equal(fixture.navigation.classList.contains("is-mobile-menu-open"), false);
  assert.equal(fixture.document.activeElement, menuButton);
});

test("mobile Start a Project closes navigation and requests the existing modal", () => {
  const fixture = createFixture();
  const menuButton = fixture.document.getElementById("siteMenuToggle");
  const event = eventFor("click");

  menuButton.dispatch("click");
  fixture.links[0].dispatch("click", event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
  assert.equal(menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(fixture.customEvents.length, 1);
  assert.equal(fixture.customEvents[0].type, "rrs:open-start-project");
  assert.equal(fixture.customEvents[0].detail.trigger, menuButton);
  assert.match(script, /document\.addEventListener\("rrs:open-start-project"[\s\S]*?openModal/);
});

test("Search remains visible and suggestions are anchored, contained, and touch friendly", () => {
  const mobileBlock = mobileHeaderStyles.slice(
    mobileHeaderStyles.indexOf("@media (max-width: 1100px)")
  );

  assert.match(script, /field\.className = "search-field"/);
  assert.match(script, /field\.append\(input, box\)/);
  assert.match(mobileBlock, /\.search-field\s*\{[\s\S]*?position:\s*relative/);
  assert.match(mobileBlock, /\.search-suggestions\s*\{[\s\S]*?left:\s*auto/);
  assert.match(mobileBlock, /right:\s*0/);
  assert.match(mobileBlock, /max-width:\s*calc\(100vw - 40px\)/);
  assert.match(mobileBlock, /\.search-suggestion\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(script, /value\.length < 2/);
  assert.match(script, /\.slice\(0, 8\)/);
});

test("public HTML, Search engine, datasets, CMS, APIs, assets, and renderers are unchanged", () => {
  execFileSync("git", [
    "diff",
    "--quiet",
    "HEAD",
    "--",
    "*.html",
    "data",
    "cms",
    "admin.html",
    "admin-server.js",
    "admin.js",
    "admin-books.js",
    "admin-portfolio.js",
    "assets",
    "utils/searchData.js",
    "utils/renderProject.js",
    "utils/renderPortfolio.js",
    "search.js",
    "campaigns.js",
    "films.js",
  ], { cwd: root });
});
