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
const responsiveStyles = styles.slice(markerIndex);

test("Campaigns and Films desktop CSS is unchanged above 820px", () => {
  const headStyles = execFileSync("git", ["show", "HEAD:style.css"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.ok(markerIndex > 0);
  assert.ok(styles.startsWith(headStyles));
  assert.match(headStyles, /\.campaign\s*\{[\s\S]*?grid-template-columns:\s*235px 1fr[\s\S]*?gap:\s*22px/);
  assert.match(headStyles, /\.campaign\.info-right\s*\{\s*grid-template-columns:\s*1fr 235px/);
  assert.match(headStyles, /\.campaign-info-inner\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*118px/);
  assert.match(headStyles, /\.campaign-media\s*\{[\s\S]*?gap:\s*18px/);
  assert.match(headStyles, /\.campaign-media-item\.has-border\s*\{\s*border:\s*1px solid #000/);
});

test("the 820px layout stacks info before full-width media on both pages", () => {
  assert.match(responsiveStyles, /@media \(max-width: 820px\)/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign,[\s\S]*?#filmsPage \.campaign\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?gap:\s*24px/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-info,[\s\S]*?#filmsPage \.campaign-media\s*\{[\s\S]*?order:\s*0[\s\S]*?width:\s*100%/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-info-inner,[\s\S]*?#filmsPage \.campaign\.info-right \.campaign-info-inner\s*\{[\s\S]*?position:\s*static[\s\S]*?top:\s*auto[\s\S]*?text-align:\s*left/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media-item,[\s\S]*?#filmsPage \.campaign-media video\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*auto/);
  assert.doesNotMatch(responsiveStyles, /#searchResults|\.search-result-group/);
});

test("real page structure preserves DOM order and uses the shared renderer", () => {
  assert.match(campaignsPage, /<section class="campaigns-page" id="campaignsPage"><\/section>/);
  assert.match(filmsPage, /<section class="campaigns-page" id="filmsPage"><\/section>/);
  assert.ok(renderer.indexOf('<aside class="campaign-info">') < renderer.indexOf('<div class="campaign-media">'));
  assert.match(renderer, /const layout = index % 2 === 0 \? "info-left" : "info-right"/);
  assert.match(renderer, /class="campaign-media-item \$\{campaign\.border \? "has-border" : ""\}"/);
});

test("video controls and viewport-aware playback remain unchanged", () => {
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
    "films.html",
    "films.js",
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
    "script.js",
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
