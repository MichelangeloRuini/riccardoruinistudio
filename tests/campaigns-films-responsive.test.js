const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const styles = read("style.css");
const campaignsPage = read("campaigns.html");
const filmsPage = read("films.html");
const renderer = read("utils/renderProject.js");
const marker = "STEP 5 RESPONSIVE: CAMPAIGNS / FILMS";
const markerIndex = styles.indexOf(marker);
const nextMarker = "STEP 6 RESPONSIVE: SEARCH RESULTS / PROJECT DETAIL";
const nextMarkerIndex = styles.indexOf(nextMarker, markerIndex);
const responsiveStyles = styles.slice(markerIndex, nextMarkerIndex);

test("Campaigns desktop CSS and implementation remain unchanged", () => {
  const headStyles = execFileSync("git", ["show", "HEAD:style.css"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.ok(markerIndex > 0);
  assert.match(headStyles, /\.campaign\s*\{[\s\S]*?grid-template-columns:\s*235px 1fr[\s\S]*?gap:\s*22px/);
  assert.match(styles, /\.campaign\s*\{[\s\S]*?grid-template-columns:\s*235px 1fr[\s\S]*?gap:\s*22px/);
  assert.match(headStyles, /\.campaign\.info-right\s*\{\s*grid-template-columns:\s*1fr 235px/);
  assert.match(styles, /\.campaign\.info-right\s*\{\s*grid-template-columns:\s*1fr 235px/);
  assert.match(headStyles, /\.campaign-info-inner\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*118px/);
  assert.match(styles, /\.campaign-info-inner\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*118px/);
  assert.match(headStyles, /\.campaign-media\s*\{[\s\S]*?gap:\s*18px/);
  assert.match(styles, /\.campaign-media\s*\{[\s\S]*?gap:\s*18px/);
  assert.match(headStyles, /\.campaign-media-item\.has-border\s*\{\s*border:\s*1px solid #000/);
  assert.match(styles, /\.campaign-media-item\.has-border\s*\{\s*border:\s*1px solid #000/);

  execFileSync("git", ["diff", "--quiet", "HEAD", "--", "campaigns.html", "campaigns.js", "utils/renderProject.js"], {
    cwd: root
  });
});

test("the existing 820px Campaigns layout still stacks info before full-width media", () => {
  assert.match(responsiveStyles, /@media \(max-width: 820px\)/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?gap:\s*24px/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-info,[\s\S]*?#campaignsPage \.campaign-media,[\s\S]*?order:\s*0[\s\S]*?width:\s*100%/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-info-inner,[\s\S]*?position:\s*static[\s\S]*?top:\s*auto[\s\S]*?text-align:\s*left/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media-item,[\s\S]*?#campaignsPage \.campaign-media video,[\s\S]*?width:\s*100%[\s\S]*?height:\s*auto/);
  assert.doesNotMatch(responsiveStyles, /#searchResults|\.search-result-group/);
});

test("Campaigns preserves DOM order while Films uses a dedicated grid", () => {
  assert.match(campaignsPage, /<section class="campaigns-page" id="campaignsPage"><\/section>/);
  assert.match(filmsPage, /<section class="films-page" id="filmsPage">/);
  assert.match(filmsPage, /<div class="films-grid" id="filmsGrid"/);
  assert.doesNotMatch(filmsPage, /utils\/renderProject\.js/);
  assert.match(filmsPage, /utils\/renderFilmsGrid\.js/);
  assert.ok(renderer.indexOf('<aside class="campaign-info">') < renderer.indexOf('<div class="campaign-media">'));
  assert.match(renderer, /const layout = index % 2 === 0 \? "info-left" : "info-right"/);
  assert.match(renderer, /class="campaign-media-item \$\{campaign\.border \? "has-border" : ""\}"/);
});

test("Campaigns video controls and viewport-aware playback remain unchanged", () => {
  assert.match(renderer, /data-viewport-playback/);
  assert.match(renderer, /muted[\s\S]*?loop[\s\S]*?playsinline[\s\S]*?controls[\s\S]*?preload="metadata"/);
  assert.match(campaignsPage, /<script src="utils\/viewportVideoPlayback\.js"><\/script>/);
  assert.match(filmsPage, /<script src="utils\/viewportVideoPlayback\.js"><\/script>/);
});

test("renderers, Search, data, CMS, APIs, assets, and prior responsive work are unchanged", () => {
  execFileSync("git", [
    "diff",
    "--quiet",
    "HEAD",
    "--",
    "campaigns.html",
    "campaigns.js",
    "utils/renderProject.js",
    "utils/viewportVideoPlayback.js",
    "search.html",
    "search.js",
    "project.html",
    "brand-identity.html",
    "brand-identity.js",
    "about.html",
    "events.html",
    "magazines-books.html",
    "magazines-books.js",
    "index.html",
    "clients.html",
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
