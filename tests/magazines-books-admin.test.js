const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const { magazinesBooksService } = require("../admin-server");
const { createSectionConfig } = require("../cms/section-config");

const projectRoot = path.resolve(__dirname, "..");
const expectedIds = Array.from(
  { length: 8 },
  (_, index) => `book-${String(index + 1).padStart(2, "0")}`
);

function readProjectFile(filename) {
  return fs.readFileSync(path.join(projectRoot, filename), "utf8");
}

function readHeadFile(filename) {
  return execFileSync("git", ["show", `HEAD:${filename}`], {
    cwd: projectRoot,
    encoding: "utf8"
  });
}

test("Magazines & Books has a dedicated enabled section configuration", () => {
  const root = path.resolve("/tmp/rrs-magazines-books-config");
  const config = createSectionConfig(root);
  const section = config["magazines-books"];

  assert.ok(section);
  assert.equal(section.key, "magazines-books");
  assert.equal(section.label, "Magazines & Books");
  assert.equal(section.dataKind, "magazines-books");
  assert.equal(section.dataFile, path.resolve(root, "data/magazines-books.js"));
  assert.equal(section.collectionName, "magazinesBooks");
  assert.equal(section.assetRoot, path.resolve(root, "assets/books"));
  assert.equal(section.trashRoot, path.resolve(root, "trash/books"));
  assert.equal(section.publicPage, "magazines-books.html");
  assert.equal(section.cmsEnabled, true);
  assert.notEqual(section.detailPage, "project.html");
  assert.notEqual(section.collectionName, "portfolioProjects");
  assert.notEqual(section.dataKind, "portfolio");
});

test("Magazines & Books GET service returns eight records without side effects", () => {
  const datasetBefore = readProjectFile("data/magazines-books.js");
  const items = magazinesBooksService.listItems();
  assert.equal(Array.isArray(items), true);
  assert.equal(items.length, 8);
  assert.deepEqual(items.map(item => item.id), expectedIds);
  items.forEach(item => {
    assert.deepEqual(Object.keys(item), ["id", "title", "credits", "video"]);
  });

  const source = readProjectFile("data/magazines-books.js");
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.items = magazinesBooks;`, context);
  assert.equal(JSON.stringify(items), JSON.stringify(context.items));
  assert.equal(readProjectFile("data/magazines-books.js"), datasetBefore);
});

test("admin markup and Books script expose the complete isolated CMS", () => {
  const adminSource = readProjectFile("admin.html");
  const scriptSource = readProjectFile("admin-books.js");
  const panelStart = adminSource.indexOf('<div\n    id="magazinesBooksPanel"');
  const panelEnd = adminSource.indexOf('  <script src="admin.js?v=2"></script>');
  const panelSource = adminSource.slice(panelStart, panelEnd);

  assert.ok(panelStart >= 0);
  assert.ok(panelEnd > panelStart);
  assert.match(adminSource, /<option value="magazines-books">Magazines &amp; Books<\/option>/);
  assert.match(panelSource, /data-cms-section-panel="magazines-books"/);
  assert.match(panelSource, /id="magazinesBooksList"/);
  assert.match(panelSource, /id="magazinesBooksEmpty"/);
  assert.match(panelSource, /id="magazinesBooksError"/);
  [
    "booksSaveOrder",
    "booksRefresh",
    "booksTitle",
    "booksCreditsList",
    "booksAddCredit",
    "booksPosition",
    "booksVideoFile",
    "booksCreate",
    "booksSaveEdit",
    "booksCancelEdit",
    "booksReplaceVideoFile"
  ].forEach(id => assert.match(panelSource, new RegExp(`id="${id}"`)));
  assert.match(adminSource, /<script src="admin-books\.js\?v=1"><\/script>/);

  [
    "/api/magazines-books",
    "/api/create-magazines-book",
    "/api/edit-magazines-book",
    "/api/replace-magazines-book-video",
    "/api/delete-magazines-book",
    "/api/reorder-magazines-books",
    "/api/duplicate-magazines-book"
  ].forEach(endpoint => assert.ok(scriptSource.includes(endpoint), `${endpoint} is missing.`));
  assert.match(scriptSource, /method:\s*"GET"/);
  assert.match(scriptSource, /method:\s*"POST"/);
  assert.match(scriptSource, /video\.muted\s*=\s*true/);
  assert.match(scriptSource, /video\.loop\s*=\s*true/);
  assert.match(scriptSource, /video\.playsInline\s*=\s*true/);
  assert.match(scriptSource, /video\.preload\s*=\s*"metadata"/);
  assert.match(scriptSource, /video\.controls\s*=\s*false/);
  assert.match(scriptSource, /"mouseenter"/);
  assert.match(scriptSource, /"mouseleave"/);
  assert.match(scriptSource, /"focus"/);
  assert.match(scriptSource, /"blur"/);
  assert.match(scriptSource, /books-admin-credit-row/);
  assert.match(scriptSource, /books-admin-credit-input/);
  assert.match(scriptSource, /placeholder = "Credit"/);
  assert.match(scriptSource, /\.map\(row =>[\s\S]*?\.filter\(Boolean\)/);
  assert.doesNotMatch(scriptSource, /books-admin-credit-(label|value)/);
  assert.match(scriptSource, /JSON\.stringify\(\{\s*orderedIds\s*\}\)/);
  assert.doesNotMatch(scriptSource, /\/api\/(campaigns|portfolio-projects|publish|git-status)/);
  assert.doesNotMatch(scriptSource, /\b(campaigns|portfolioProjects)\b/);
});

test("Books styles are isolated and protected files and routes remain unchanged", () => {
  const styles = readProjectFile("style.css");

  assert.match(styles, /\.magazines-books-page\s*\{/);
  assert.match(
    styles,
    /\.magazines-books-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/
  );
  [
    ".magazines-books-card",
    ".magazines-books-video",
    ".magazines-books-empty",
    ".magazines-books-modal",
    ".magazines-books-modal__backdrop",
    ".magazines-books-modal__content",
    ".magazines-books-modal__close",
    ".magazines-books-modal__video",
    ".magazines-books-modal__details",
    ".magazines-books-modal__credits",
    ".books-admin",
    ".books-admin-list",
    ".books-admin-card",
    ".books-admin-credit-row"
  ].forEach(selector => {
    assert.ok(styles.includes(`${selector} {`), `Missing dedicated selector: ${selector}`);
  });
  assert.match(styles, /\.magazines-books-modal\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(styles, /body\.is-modal-open\s*\{[^}]*overflow:\s*hidden/);
  assert.match(
    styles,
    /@media \(max-width: 1100px\)\s*\{[^}]*\.magazines-books-grid\s*\{[^}]*repeat\(3,/
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.magazines-books-grid\s*\{[^}]*repeat\(2,/
  );
  assert.match(
    styles,
    /@media \(max-width: 480px\)\s*\{[^}]*\.magazines-books-grid\s*\{[^}]*grid-template-columns:\s*1fr/
  );

  [
    "admin.js",
    "admin-portfolio.js",
    "cms/portfolio-projects.js",
    "data/campaigns.js",
    "data/portfolio-projects.js"
  ].forEach(filename => {
    assert.equal(readProjectFile(filename), readHeadFile(filename), `${filename} changed.`);
  });

  function getRoutes(source) {
    return Array.from(
      source.matchAll(/app\.(get|post)\("([^"]+)"/g),
      match => `${match[1].toUpperCase()} ${match[2]}`
    );
  }

  const previousRoutes = getRoutes(readHeadFile("admin-server.js"));
  const currentRoutes = getRoutes(readProjectFile("admin-server.js"));
  assert.deepEqual(currentRoutes, previousRoutes);

  const booksRoutes = getRoutes(readProjectFile("cms/magazines-books.js"));
  assert.deepEqual(booksRoutes, [
    "GET /api/magazines-books",
    "POST /api/create-magazines-book",
    "POST /api/edit-magazines-book",
    "POST /api/replace-magazines-book-video",
    "POST /api/delete-magazines-book",
    "POST /api/reorder-magazines-books",
    "POST /api/duplicate-magazines-book"
  ]);
});
