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

  execFileSync("git", ["diff", "--quiet", "HEAD", "--", "campaigns.js", "utils/renderProject.js"], {
    cwd: root
  });
});

test("the existing 761px to 820px Campaigns layout still stacks info before full-width media", () => {
  assert.match(responsiveStyles, /@media \(max-width: 820px\)/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?gap:\s*24px/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-info,[\s\S]*?#campaignsPage \.campaign-media,[\s\S]*?order:\s*0[\s\S]*?width:\s*100%/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-info-inner,[\s\S]*?position:\s*static[\s\S]*?top:\s*auto[\s\S]*?text-align:\s*left/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media-item,[\s\S]*?#campaignsPage \.campaign-media video,[\s\S]*?width:\s*100%[\s\S]*?height:\s*auto/);
  assert.doesNotMatch(responsiveStyles, /#searchResults|\.search-result-group/);
});

test("Campaigns mobile is one free-scrolling horizontal editorial wall", () => {
  assert.match(responsiveStyles, /@media \(max-width: 760px\)/);
  assert.match(responsiveStyles, /#campaignsPage\.campaigns-page\s*\{[\s\S]*?display:\s*grid[\s\S]*?height:\s*clamp\(620px, 80svh, 680px\)[\s\S]*?grid-template-rows:\s*repeat\(2, minmax\(0, 1fr\)\)[\s\S]*?grid-auto-flow:\s*column[\s\S]*?overflow-x:\s*auto[\s\S]*?overflow-y:\s*hidden/);
  assert.match(responsiveStyles, /touch-action:\s*pan-x pan-y/);
  assert.match(responsiveStyles, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign\s*\{[\s\S]*?width:\s*max-content[\s\S]*?grid-template-columns:\s*clamp\(148px, 42vw, 180px\) auto/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign\.info-left\s*\{\s*align-self:\s*flex-start/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign\.info-right\s*\{[\s\S]*?grid-template-columns:\s*auto clamp\(148px, 42vw, 180px\)[\s\S]*?align-self:\s*flex-end/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign\.info-left \.campaign-info,[\s\S]*?#campaignsPage \.campaign\.info-right \.campaign-media\s*\{\s*order:\s*1/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign\.info-left \.campaign-media,[\s\S]*?#campaignsPage \.campaign\.info-right \.campaign-info\s*\{\s*order:\s*2/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media\s*\{[\s\S]*?flex-direction:\s*row/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media > :not\(:first-child\)\s*\{\s*display:\s*none/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media-item,[\s\S]*?height:\s*clamp\(224px, 62vw, 260px\)[\s\S]*?object-fit:\s*contain/);
  assert.doesNotMatch(responsiveStyles, /scroll-snap|autoplay|cloneNode/);
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
    "campaigns.js",
    "utils/renderProject.js",
    "utils/viewportVideoPlayback.js",
    "search.js",
    "brand-identity.js",
    "magazines-books.js",
    "data",
    "cms",
    "admin.html",
    "admin-server.js",
    "admin.js",
    "admin-books.js",
    "admin-portfolio.js",
    "assets",
    ":(exclude)assets/ui/diavoletto-about.png",
    ":(exclude)assets/ui/diavoletto-clients-talents.png",
    ":(exclude)assets/ui/diavoletto-visual-identity.png",
    ":(exclude)assets/ui/diavoletto-films.png",
    ":(exclude)assets/ui/diavoletto-magazines-books.png"
  ], { cwd: root });
});
