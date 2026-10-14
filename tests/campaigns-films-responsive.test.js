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
const mobileGalleries = read("campaigns-mobile-galleries.js");
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

test("Campaigns mobile keeps campaigns vertical with independent horizontal galleries", () => {
  assert.match(responsiveStyles, /@media \(max-width: 760px\)/);
  assert.match(responsiveStyles, /#campaignsPage\.campaigns-page\s*\{[\s\S]*?display:\s*block[\s\S]*?height:\s*auto[\s\S]*?overflow:\s*visible/);
  assert.match(responsiveStyles, /touch-action:\s*pan-x pan-y/);
  assert.match(responsiveStyles, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign\s*\{[\s\S]*?width:\s*100%[\s\S]*?grid-template-columns:\s*minmax\(112px, 34vw\) minmax\(0, 1fr\)[\s\S]*?margin:\s*0 0 clamp\(72px, 20vw, 92px\)/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign\.info-right\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(112px, 34vw\)/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign\.info-left \.campaign-info,[\s\S]*?#campaignsPage \.campaign\.info-right \.campaign-gallery\s*\{\s*order:\s*1/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign\.info-left \.campaign-gallery,[\s\S]*?#campaignsPage \.campaign\.info-right \.campaign-info\s*\{\s*order:\s*2/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media\s*\{[\s\S]*?flex-direction:\s*row[\s\S]*?overflow-x:\s*auto[\s\S]*?overflow-y:\s*hidden[\s\S]*?scroll-snap-type:\s*x proximity/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media picture\s*\{[\s\S]*?order:\s*1[\s\S]*?scroll-snap-align:\s*start/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media > video\s*\{[\s\S]*?order:\s*2[\s\S]*?scroll-snap-align:\s*start/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media picture\s*\{[\s\S]*?max-width:\s*calc\(100% - 30px\)/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media > video\s*\{[\s\S]*?max-width:\s*calc\(100% - 30px\)[\s\S]*?max-height:\s*clamp\(230px, 68vw, 292px\)[\s\S]*?object-fit:\s*contain/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media picture \.campaign-media-item,[\s\S]*?max-width:\s*100%[\s\S]*?height:\s*auto[\s\S]*?object-fit:\s*contain/);
  assert.doesNotMatch(responsiveStyles, /#campaignsPage \.campaign-media > :not\(:first-child\)/);
  assert.doesNotMatch(responsiveStyles, /autoplay|cloneNode/);
});

test("Campaigns mobile galleries create accessible variable-width pagination", () => {
  assert.match(campaignsPage, /<script src="campaigns-mobile-galleries\.js"><\/script>/);
  assert.match(mobileGalleries, /const MOBILE_QUERY = "\(max-width: 760px\)"/);
  assert.match(mobileGalleries, /querySelectorAll\(":scope > \.campaign"\)/);
  assert.match(mobileGalleries, /Array\.from\(media\.children\)\.sort/);
  assert.match(mobileGalleries, /itemA\.matches\("video"\)/);
  assert.match(mobileGalleries, /visibleWidth = Math\.max/);
  assert.match(mobileGalleries, /requestAnimationFrame\(updateActiveIndicator\)/);
  assert.match(mobileGalleries, /addEventListener\("load", scheduleIndicatorUpdate/);
  assert.match(mobileGalleries, /addEventListener\("loadedmetadata", scheduleIndicatorUpdate/);
  assert.match(mobileGalleries, /className = "campaign-gallery-dot"/);
  assert.match(mobileGalleries, /--campaign-gallery-count/);
  assert.match(mobileGalleries, /setAttribute\("aria-label", `Show media/);
  assert.match(mobileGalleries, /prefers-reduced-motion: reduce/);
  assert.match(mobileGalleries, /media\.scrollTo\(\{/);
  assert.doesNotMatch(mobileGalleries, /preventDefault|setInterval|cloneNode|autoplay/);
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
