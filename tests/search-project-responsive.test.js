const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const styles = read("style.css");
const searchRenderer = read("search.js");
const projectScript = read("project.js");
const marker = "STEP 6 RESPONSIVE: SEARCH RESULTS / PROJECT DETAIL";
const markerIndex = styles.indexOf(marker);
const responsiveStyles = styles.slice(markerIndex);
const searchStart = responsiveStyles.indexOf("@media (max-width: 820px)");
const projectStart = responsiveStyles.indexOf("@media (max-width: 760px)");
const searchStyles = responsiveStyles.slice(searchStart, projectStart);
const projectStyles = responsiveStyles.slice(projectStart);

test("Search and Project desktop CSS remains unchanged", () => {
  const headStyles = execFileSync("git", ["show", "HEAD:style.css"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.ok(markerIndex > 0);
  const headMarkerIndex = headStyles.indexOf(marker);
  const headResponsiveStyles = headStyles.slice(headMarkerIndex);

  assert.equal(responsiveStyles, headResponsiveStyles);
  assert.match(headStyles, /\.search-results-header\s*\{\s*padding:\s*40px 55px 0/);
  assert.match(headStyles, /\.search-result-group-heading\s*\{[\s\S]*?font-size:\s*20px/);
  assert.match(headStyles, /\.portfolio-project-page\s*\{\s*padding:\s*58px var\(--side-margin\) 80px/);
  assert.match(headStyles, /\.portfolio-project-header\s*\{[\s\S]*?display:\s*flex[\s\S]*?margin-bottom:\s*65px/);
});

test("Search results stack at 820px with readable groups and full-width media", () => {
  assert.match(searchStyles, /\.search-results-header\s*\{[\s\S]*?padding:\s*24px 20px 0[\s\S]*?line-height:\s*1\.3/);
  assert.match(searchStyles, /#searchResults\.campaigns-page\s*\{[\s\S]*?padding:\s*24px 20px 72px/);
  assert.match(searchStyles, /#searchResults \.campaign\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?gap:\s*24px/);
  assert.match(searchStyles, /#searchResults \.campaign-info,[\s\S]*?#searchResults \.campaign-media\s*\{[\s\S]*?order:\s*0[\s\S]*?width:\s*100%/);
  assert.match(searchStyles, /#searchResults \.campaign-info-inner,[\s\S]*?position:\s*static[\s\S]*?text-align:\s*left/);
  assert.match(searchStyles, /#searchResults \.campaign-media-item,[\s\S]*?width:\s*100%[\s\S]*?height:\s*auto/);
  assert.match(searchStyles, /#searchResults \.no-results\s*\{[\s\S]*?font-size:\s*clamp\(32px, 10vw, 47px\)/);
});

test("Search groups, URLs, and Books integration remain unchanged", () => {
  assert.match(searchRenderer, /group\.className = "search-result-group"/);
  assert.match(searchRenderer, /title\.className = "search-result-group-heading"/);
  assert.match(searchRenderer, /\["MAGAZINES & BOOKS", matchingMagazinesBooks, renderMagazinesBooksSearchResult\]/);
  assert.match(searchRenderer, /detailLink\.href = RRSUnifiedSearch\.getMagazinesBooksUrl\(record\)/);
  assert.match(searchRenderer, /window\.location\.href = `search\.html\?q=\$\{encodeURIComponent\(value\)\}`/);
});

test("Project Detail stacks its header and preserves complete full-width media", () => {
  assert.match(projectStyles, /#portfolioProjectPage\.portfolio-project-page,[\s\S]*?padding:\s*38px 20px 60px/);
  assert.match(projectStyles, /#portfolioProjectPage \.portfolio-project-header\s*\{[\s\S]*?flex-direction:\s*column[\s\S]*?gap:\s*16px[\s\S]*?margin-bottom:\s*32px/);
  assert.match(projectStyles, /#portfolioProjectPage \.portfolio-project-media\s*\{[\s\S]*?gap:\s*clamp\(28px, 8vw, 48px\)/);
  assert.match(projectStyles, /#portfolioProjectPage \.portfolio-detail-media-item,[\s\S]*?width:\s*100%[\s\S]*?height:\s*auto/);
  assert.match(projectStyles, /#portfolioProjectPage \.portfolio-detail-media-item img,[\s\S]*?object-fit:\s*contain/);
  assert.match(projectScript, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(projectScript, /renderPortfolioDetail\(projectMedia, selectedProject\)/);
});

test("Search engine, renderers, data, prior pages, CMS, APIs, and assets remain unchanged", () => {
  execFileSync("git", [
    "diff",
    "--quiet",
    "HEAD",
    "--",
    "search.js",
    "project.js",
    "utils/searchData.js",
    "utils/renderProject.js",
    "utils/renderPortfolio.js",
    "utils/renderPortfolioSearch.js",
    "campaigns.js",
    "brand-identity.js",
    "events.html",
    "magazines-books.js",
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
