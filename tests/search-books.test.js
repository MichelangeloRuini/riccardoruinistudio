const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function loadCollection(relativePath, collectionName) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${read(relativePath)}\nthis.value = ${collectionName};`, context);
  return context.value;
}

function loadSearchData() {
  const context = { window: {} };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read("utils/searchData.js"), context);
  return context.RRSUnifiedSearch;
}

const books = loadCollection("data/magazines-books.js", "magazinesBooks");
const campaigns = loadCollection("data/campaigns.js", "campaigns");
const portfolio = loadCollection("data/portfolio-projects.js", "portfolioProjects");
const search = loadSearchData();
const searchPage = read("search.html");
const searchRenderer = read("search.js");
const globalSearch = read("script.js");

test("Search loads and indexes all eight Magazines & Books records", () => {
  assert.match(searchPage, /<script src="data\/magazines-books\.js"><\/script>/);
  assert.ok(
    searchPage.indexOf('src="data/magazines-books.js"')
      < searchPage.indexOf('src="utils/searchData.js"')
  );
  assert.equal(books.length, 8);
  assert.equal(
    books.filter(record => search.getSearchableValues(record, "magazines-books").length > 0).length,
    8
  );
});

test("Books matching uses the existing normalization for title, stable ID, and credits", () => {
  const matches = query => books.filter(record =>
    search.matches(record, "magazines-books", query)
  );

  assert.deepEqual(Array.from(matches("gq magazine"), record => record.id), ["book-01"]);
  assert.deepEqual(Array.from(matches("BOOK 01"), record => record.id), ["book-01"]);
  assert.deepEqual(Array.from(matches("BOOK 08"), record => record.id), ["book-08"]);
  assert.deepEqual(Array.from(matches("Guido Mocafico"), record => record.id), ["book-07"]);

  const futureCreditShape = {
    id: "book-09",
    title: "Future title",
    credits: [{ label: "Creative Direction", value: "Riccardo Ruini Studio" }]
  };
  assert.equal(search.matches(futureCreditShape, "magazines-books", "creative direction"), true);
  assert.equal(search.matches(futureCreditShape, "magazines-books", "Riccardo Ruini Studio"), true);
});

test("Books results use their dedicated group, renderer, and modal URL", () => {
  assert.match(
    searchRenderer,
    /\["MAGAZINES & BOOKS", matchingMagazinesBooks, renderMagazinesBooksSearchResult\]/
  );
  assert.match(
    searchRenderer,
    /detailLink\.href = RRSUnifiedSearch\.getMagazinesBooksUrl\(record\)/
  );
  assert.equal(
    search.getMagazinesBooksUrl(books[0]),
    "magazines-books.html?project=book-01"
  );

  const booksRenderer = searchRenderer.match(
    /function renderMagazinesBooksSearchResult[\s\S]*?\n}\n\nfunction renderSearch/
  );
  assert.ok(booksRenderer);
  assert.doesNotMatch(booksRenderer[0], /renderPortfolioSearchProject|project\.html/);
});

test("header suggestions include Books and preserve direct modal URLs", () => {
  const suggestions = search.getSuggestionItems(campaigns, portfolio, books);
  const firstBook = suggestions.find(item =>
    item.label === "GQ MAGAZINE RE-DESIGN & CREATIVE DIRECTION"
  );

  assert.deepEqual(
    { label: firstBook.label, url: firstBook.url },
    {
      label: "GQ MAGAZINE RE-DESIGN & CREATIVE DIRECTION",
      url: "magazines-books.html?project=book-01"
    }
  );
  assert.match(globalSearch, /RRSUnifiedSearch\.getSuggestionItems/);
  assert.match(globalSearch, /button\.dataset\.url = match\.url/);
  assert.match(globalSearch, /window\.location\.href = active\.dataset\.url/);
  assert.match(globalSearch, /typeof magazinesBooks !== "undefined"/);
});

test("Campaigns, Visual Identity, and Films keep their existing matching model", () => {
  const campaign = campaigns[0];
  const identity = portfolio.find(project => project.section === "brand-identity");
  const film = {
    id: "film-test",
    section: "films",
    client: "Film Client",
    title: "Film Title"
  };

  assert.equal(search.matches(campaign, "campaign", campaign.client), true);
  assert.equal(search.matches(identity, "portfolio", identity.client), true);
  assert.equal(search.matches(film, "portfolio", "Film Title"), true);
  assert.equal(search.formatSection("brand-identity"), "Visual Identity");
  assert.equal(search.formatSection("films"), "Films");
  assert.match(
    searchRenderer,
    /\["CAMPAIGNS", matchingCampaigns[\s\S]*?renderProject\(safeCampaign/
  );
  assert.match(
    searchRenderer,
    /\["FILMS", portfolioGroups\.films, renderPortfolioSearchProject\]/
  );
});

test("datasets, CMS, admin, protected renderers, and assets remain unchanged", () => {
  execFileSync("git", [
    "diff",
    "--quiet",
    "HEAD",
    "--",
    "data/campaigns.js",
    "data/portfolio-projects.js",
    "data/magazines-books.js",
    "campaigns.js",
    "brand-identity.js",
    "admin-server.js",
    "cms",
    "assets"
  ], { cwd: root });
});
