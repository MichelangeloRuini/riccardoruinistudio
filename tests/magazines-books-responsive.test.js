const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const styles = read("style.css");
const renderer = read("magazines-books.js");
const page = read("magazines-books.html");
const marker = "STEP 4 RESPONSIVE: MAGAZINES & BOOKS";
const markerIndex = styles.indexOf(marker);
const responsiveStyles = styles.slice(markerIndex);
const tabletStart = responsiveStyles.indexOf("@media (max-width: 1100px)");
const mobileStart = responsiveStyles.indexOf("@media (max-width: 760px)");
const narrowStart = responsiveStyles.indexOf("@media (max-width: 340px)");
const tabletStyles = responsiveStyles.slice(tabletStart, mobileStart);
const mobileStyles = responsiveStyles.slice(mobileStart, narrowStart);
const narrowStyles = responsiveStyles.slice(narrowStart);

test("Books desktop CSS is unchanged and tablet keeps three square columns", () => {
  const headStyles = execFileSync("git", ["show", "HEAD:style.css"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.ok(markerIndex > 0);
  assert.ok(styles.startsWith(headStyles));
  assert.match(headStyles, /\.magazines-books-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(headStyles, /\.magazines-books-card\s*\{[^}]*aspect-ratio:\s*1 \/ 1/);
  assert.match(headStyles, /\.magazines-books-video\s*\{[^}]*object-fit:\s*cover/);
  assert.match(tabletStyles, /\.magazines-books-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(tabletStyles, /\.magazines-books-video\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover[^}]*object-position:\s*center/);
});

test("Books uses two mobile columns through 375px and one only at 340px", () => {
  assert.match(mobileStyles, /\.magazines-books-page\s*\{\s*padding:\s*38px 20px 60px/);
  assert.match(mobileStyles, /\.magazines-books-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*gap:\s*10px/);
  assert.match(narrowStyles, /\.magazines-books-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(responsiveStyles, /@media \(max-width: 480px\)/);
});

test("mobile Books modal is portrait-safe and places video before in-flow details", () => {
  assert.match(mobileStyles, /\.magazines-books-modal\s*\{[^}]*height:\s*100vh;\s*height:\s*100dvh/);
  assert.match(mobileStyles, /env\(safe-area-inset-top\)/);
  assert.match(mobileStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(mobileStyles, /\.magazines-books-modal__content\s*\{[^}]*overflow-y:\s*hidden/);
  assert.match(mobileStyles, /\.magazines-books-modal__close\s*\{[^}]*position:\s*static[^}]*min-width:\s*44px[^}]*min-height:\s*44px[^}]*flex:\s*0 0 44px/);
  assert.match(mobileStyles, /\.magazines-books-modal__video\s*\{[^}]*order:\s*2[^}]*width:\s*100%[^}]*height:\s*auto[^}]*aspect-ratio:\s*auto[^}]*object-fit:\s*contain/);
  assert.match(mobileStyles, /\.magazines-books-modal__details\s*\{[^}]*position:\s*static[^}]*order:\s*3[^}]*min-height:\s*0[^}]*padding:\s*20px 0 0[^}]*overflow-y:\s*auto/);
  assert.match(mobileStyles, /\.magazines-books-modal__credits\s*\{[^}]*font-weight:\s*var\(--font-weight-light\)/);
  assert.ok(page.indexOf("magazines-books-modal__video") < page.indexOf("magazines-books-modal__details"));
});

test("modal behavior retains playback, close paths, query routing, and adds focus containment", () => {
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /aria-labelledby="magazinesBooksModalTitle"/);
  assert.match(page, /class="magazines-books-modal__video"[\s\S]*?muted[\s\S]*?loop[\s\S]*?playsinline[\s\S]*?controls[\s\S]*?preload="metadata"/);
  assert.match(renderer, /IntersectionObserver/);
  assert.match(renderer, /event\.key === "Escape"/);
  assert.match(renderer, /data-magazines-books-close/);
  assert.match(renderer, /document\.body\.classList\.add\("is-modal-open"\)/);
  assert.match(renderer, /lastFocusedCard\.focus\(\)/);
  assert.match(renderer, /new URLSearchParams\(window\.location\.search\)\.get\("project"\)/);
  assert.match(renderer, /function containModalFocus\(event\)/);
  assert.match(renderer, /event\.key !== "Tab"/);
  assert.match(renderer, /modalContent\.contains\(document\.activeElement\)/);
  assert.match(renderer, /event\.shiftKey/);
});

test("dataset order and protected site areas remain unchanged", () => {
  execFileSync("git", [
    "diff",
    "--quiet",
    "HEAD",
    "--",
    "magazines-books.html",
    "data",
    "cms",
    "assets",
    "admin.html",
    "admin-server.js",
    "admin.js",
    "admin-books.js",
    "admin-portfolio.js",
    "script.js",
    "search.js",
    "utils",
    "index.html",
    "clients.html",
    "campaigns.html",
    "films.html",
    "search.html",
    "project.html",
    "brand-identity.html",
    "events.html",
    "about.html"
  ], { cwd: root });

  const dataset = read("data/magazines-books.js");
  assert.deepEqual(
    [...dataset.matchAll(/"id": "(book-\d{2})"/g)].map(match => match[1]),
    ["book-01", "book-02", "book-03", "book-04", "book-05", "book-06", "book-07", "book-08"]
  );
});
