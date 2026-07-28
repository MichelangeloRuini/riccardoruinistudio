const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const page = read("magazines-books.html");
const renderer = read("magazines-books.js");
const styles = read("style.css");
const datasetSource = read("data/magazines-books.js");
const menuPages = [
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
const protectedFiles = [
  "admin.html",
  "admin-books.js",
  "admin-server.js",
  "cms/magazines-books.js",
  "cms/section-config.js",
  "data/magazines-books.js",
  "tests/magazines-books-admin.test.js",
  "tests/magazines-books-crud.test.js"
];

function extractNavigation(html) {
  const match = html.match(/<nav class="site-nav site-nav--editorial"[\s\S]*?<\/nav>/);
  assert.ok(match, "editorial navigation must exist");
  return match[0];
}

function gitShowHead(relativePath) {
  return execFileSync("git", ["show", `HEAD:${relativePath}`], {
    cwd: root,
    encoding: "utf8"
  });
}

function expectedMenuOnlyChange(relativePath) {
  const baseline = gitShowHead(relativePath);
  const oldLink = '<a href="#">Magazines &amp; Books</a>';
  const newLink = '<a href="magazines-books.html">Magazines &amp; Books</a>';

  return baseline.includes(oldLink)
    ? baseline.replace(oldLink, newLink)
    : baseline;
}

test("public page loads the dataset and dedicated renderer inside the editorial shell", () => {
  assert.ok(fs.existsSync(path.join(root, "magazines-books.html")));
  assert.match(page, /<header class="site-header site-header--editorial">/);
  assert.match(page, /<footer class="footer">/);
  assert.match(page, /<script src="data\/magazines-books\.js"><\/script>/);
  assert.match(page, /<script src="magazines-books\.js"><\/script>/);
  assert.match(page, /href="magazines-books\.html" class="active" aria-current="page"/);
  assert.doesNotMatch(page, /project\.html/);
  assert.equal((page.match(/book-0[1-8]/g) || []).length, 0);
});

test("renderer builds accessible video cards dynamically from magazinesBooks", () => {
  assert.match(renderer, /typeof magazinesBooks !== "undefined"/);
  assert.match(renderer, /magazinesBooks\.filter\(isValidRecord\)/);
  assert.match(renderer, /records\.forEach\(record =>/);
  assert.match(renderer, /document\.createElement\("button"\)/);
  assert.match(renderer, /document\.createElement\("video"\)/);
  assert.match(renderer, /video\.muted = true/);
  assert.match(renderer, /video\.loop = true/);
  assert.match(renderer, /video\.playsInline = true/);
  assert.match(renderer, /video\.preload = "metadata"/);
  assert.match(renderer, /IntersectionObserver/);
  assert.match(renderer, /intersectionRatio >= 0\.5/);
  assert.match(renderer, /playPromise\.catch/);
  assert.doesNotMatch(renderer, /innerHTML/);
  assert.doesNotMatch(renderer, /localhost|\/api\/admin|admin-server/);
});

test("modal renders the selected title and ordered credits and supports every close path", () => {
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /aria-labelledby="magazinesBooksModalTitle"/);
  assert.match(page, /class="magazines-books-modal__close"/);
  assert.match(page, /class="magazines-books-modal__backdrop"/);
  assert.match(renderer, /modalTitle\.textContent = record\.title\.trim\(\)/);
  assert.match(renderer, /validCredits\(record\)\.forEach/);
  assert.match(renderer, /label\.textContent = credit\.label\.trim\(\)/);
  assert.match(renderer, /value\.textContent = credit\.value\.trim\(\)/);
  assert.match(renderer, /event\.key === "Escape"/);
  assert.match(renderer, /data-magazines-books-close/);
  assert.match(renderer, /document\.body\.classList\.add\("is-modal-open"\)/);
  assert.match(renderer, /document\.body\.classList\.remove\("is-modal-open"\)/);
  assert.match(renderer, /lastFocusedCard\.focus\(\)/);
  assert.match(renderer, /modalVideo\.removeAttribute\("src"\)/);
});

test("dataset yields eight ordered cards without hardcoding records in the frontend", () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${datasetSource.replace(/^const magazinesBooks\s*=\s*/, "globalThis.records = ")}\n`,
    context
  );

  assert.equal(context.records.length, 8);
  assert.deepEqual(
    Array.from(context.records, record => record.id),
    ["book-01", "book-02", "book-03", "book-04", "book-05", "book-06", "book-07", "book-08"]
  );
  assert.equal((renderer.match(/book-0[1-8]/g) || []).length, 0);
});

test("layout is five columns on desktop with isolated tablet and mobile adaptations", () => {
  assert.match(
    styles,
    /\.magazines-books-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/
  );
  assert.match(
    styles,
    /@media \(max-width: 1100px\)[\s\S]*?\.magazines-books-grid\s*\{[\s\S]*?repeat\(3,/
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.magazines-books-grid\s*\{[\s\S]*?repeat\(2,/
  );
  assert.match(styles, /body\.is-modal-open\s*\{[\s\S]*?overflow:\s*hidden/);
});

test("all real public menus use the approved order and only the new page is Books-active", () => {
  const labels = [
    "Start a Project",
    "Clients",
    "Campaigns",
    "Films",
    "Visual Identity",
    "Events",
    "Magazines &amp; Books",
    "About"
  ];

  menuPages.forEach(relativePath => {
    const navigation = extractNavigation(read(relativePath));
    let previousIndex = -1;

    labels.forEach(label => {
      const index = navigation.indexOf(label);
      assert.ok(index > previousIndex, `${relativePath}: ${label} must follow the approved order`);
      previousIndex = index;
    });

    assert.match(
      navigation,
      /href="magazines-books\.html"[^>]*>Magazines &amp; Books<\/a>/,
      `${relativePath}: Books link`
    );

    if (relativePath === "magazines-books.html") {
      assert.match(
        navigation,
        /href="magazines-books\.html" class="active" aria-current="page"/
      );
    } else {
      assert.doesNotMatch(
        navigation,
        /href="magazines-books\.html"[^>]*class="active"/,
        `${relativePath}: Books must not be active`
      );
    }
  });

  assert.match(extractNavigation(read("events.html")), /href="events\.html" class="active"/);
  assert.match(extractNavigation(read("about.html")), /href="about\.html" class="active"/);
  assert.match(
    extractNavigation(read("brand-identity.html")),
    /href="brand-identity\.html" class="active"/
  );
});

test("Campaigns and Visual Identity internals differ from HEAD only by the menu link", () => {
  assert.equal(read("campaigns.html"), expectedMenuOnlyChange("campaigns.html"));
  assert.equal(read("brand-identity.html"), expectedMenuOnlyChange("brand-identity.html"));
  assert.match(read("campaigns.html"), /id="campaignsPage"/);
  assert.match(read("campaigns.html"), /<script src="campaigns\.js"><\/script>/);
  assert.match(read("brand-identity.html"), /id="brandIdentityGrid"/);
  assert.match(read("brand-identity.html"), /<script src="brand-identity\.js"><\/script>/);
});

test("CMS, APIs, dataset, assets, and existing CMS tests remain outside the frontend diff", () => {
  execFileSync("git", ["diff", "--quiet", "HEAD", "--", ...protectedFiles], {
    cwd: root
  });

  const changedAssets = execFileSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", "assets/books"],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(changedAssets, "");
});
