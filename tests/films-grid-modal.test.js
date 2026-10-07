const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const page = read("films.html");
const controller = read("films.js");
const renderer = read("utils/renderFilmsGrid.js");
const playback = read("utils/viewportVideoPlayback.js");
const styles = read("style.css");

test("Films has dedicated markup and rendering without changing Campaigns", () => {
  assert.match(page, /class="films-page" id="filmsPage"/);
  assert.match(page, /class="films-grid" id="filmsGrid"/);
  assert.match(page, /utils\/renderFilmsGrid\.js/);
  assert.doesNotMatch(page, /utils\/renderProject\.js|class="campaigns-page"/);
  assert.doesNotMatch(renderer, /renderProject|campaign-info|campaign-media/);

  execFileSync("git", [
    "diff", "--quiet", "HEAD", "--",
    "campaigns.html", "campaigns.js", "utils/renderProject.js", "utils/viewportVideoPlayback.js"
  ], { cwd: root });
});

test("the existing Films filter produces 74 tiles from real campaign video records", () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${read("data/campaigns.js")}\n;globalThis.records = campaigns;`, context);

  const videos = context.records.flatMap(campaign => (
    campaign.films && campaign.films.length > 0
      ? campaign.films
      : campaign.media.filter(file => file.toLowerCase().endsWith(".mp4"))
  ));

  assert.equal(videos.length, 74);
  assert.match(renderer, /Array\.isArray\(campaign\.films\) && campaign\.films\.length > 0/);
  assert.match(renderer, /campaign\.media\.filter\([\s\S]*?endsWith\("\.mp4"\)/);
});

test("grid is three, two, and one columns at the requested breakpoints", () => {
  assert.match(styles, /\.films-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*?\.films-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.films-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.films-card\s*\{[\s\S]*?aspect-ratio:\s*16 \/ 9/);
  assert.match(styles, /\.films-card-video\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%[\s\S]*?object-fit:\s*cover/);
});

test("grid videos are muted looping inline metadata videos without controls", () => {
  assert.match(renderer, /video\.muted = true/);
  assert.match(renderer, /video\.loop = true/);
  assert.match(renderer, /video\.playsInline = true/);
  assert.match(renderer, /video\.preload = "metadata"/);
  assert.match(renderer, /video\.controls = false/);
  assert.match(renderer, /data-viewport-playback/);
  assert.match(playback, /IntersectionObserver/);
  assert.match(playback, /intersectionRatio >= 0\.5/);
  assert.match(playback, /playPromise\.catch/);
});

test("title appears on hover and focus and remains visible on touch and mobile", () => {
  assert.match(styles, /\.films-card:hover \.films-card-overlay,[\s\S]*?\.films-card:focus-visible \.films-card-overlay\s*\{\s*opacity:\s*1/);
  assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.films-card-overlay\s*\{\s*opacity:\s*1/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.films-card-overlay\s*\{[\s\S]*?opacity:\s*1/);
  assert.match(renderer, /card\.addEventListener\("click", \(\) => openModal\(record, card\)\)/);
  assert.doesNotMatch(renderer, /location|project\.html/);
});

test("modal is accessible, uses the selected source, and renders ordered real credits", () => {
  assert.match(page, /class="films-modal" id="filmsModal" hidden/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /aria-labelledby="filmsModalTitle"/);
  assert.match(page, /<button class="films-modal__close" type="button" data-films-close>EXIT<\/button>/);
  assert.match(page, /class="films-modal__video"[\s\S]*?muted[\s\S]*?loop[\s\S]*?playsinline[\s\S]*?controls/);
  assert.match(controller, /modalVideo\.src = record\.source/);
  assert.match(controller, /campaign\.credits\.forEach/);
  assert.match(controller, /term\.textContent = label/);
  assert.match(controller, /cleanValues\.forEach\(value =>/);
  assert.match(controller, /description\.appendChild\(link\)/);
  assert.match(styles, /\.films-modal__video\s*\{[\s\S]*?object-fit:\s*contain/);
});

test("modal credit labels stay plain while each real value links to the existing Search", () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${read("data/campaigns.js")}\n;globalThis.records = campaigns;`, context);

  const filmCampaigns = context.records.filter(campaign =>
    campaign.media.some(file => file.toLowerCase().endsWith(".mp4"))
  );
  const filmCreditValues = filmCampaigns.flatMap(campaign =>
    campaign.credits.flatMap(credit => Array.isArray(credit.value) ? credit.value : [credit.value])
  );

  assert.ok(filmCreditValues.includes("Mert Alas and Marcus Piggott"));
  assert.ok(filmCreditValues.includes("Jennifer Lopez"));
  assert.match(controller, /const term = document\.createElement\("dt"\)/);
  assert.doesNotMatch(controller, /term\.appendChild\(link\)|term\.href/);
  assert.match(controller, /const link = document\.createElement\("a"\)/);
  assert.match(controller, /link\.href = `search\.html\?q=\$\{encodeURIComponent\(value\)\}`/);
  assert.match(controller, /link\.textContent = value/);
  assert.doesNotMatch(controller, /link\.target|target="_blank"/);
  assert.equal(
    `search.html?q=${encodeURIComponent("Mert Alas and Marcus Piggott")}`,
    "search.html?q=Mert%20Alas%20and%20Marcus%20Piggott"
  );
  assert.equal(
    `search.html?q=${encodeURIComponent("Jennifer Lopez")}`,
    "search.html?q=Jennifer%20Lopez"
  );
});

test("credit links remain interactive on desktop and touch without becoming modal close controls", () => {
  assert.match(styles, /\.films-modal__details\s*\{[\s\S]*?pointer-events:\s*auto/);
  assert.match(styles, /\.films-modal__credit-link\s*\{[\s\S]*?color:\s*inherit[\s\S]*?text-decoration:\s*none/);
  assert.match(styles, /\.films-modal__credit-link:hover,[\s\S]*?text-decoration:\s*underline/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.films-modal__credit-link\s*\{[\s\S]*?min-height:\s*32px/);
  assert.match(controller, /modal\.querySelectorAll\("\[data-films-close\]"\)/);
  assert.doesNotMatch(controller, /link\.(?:dataset\.filmsClose|setAttribute\("data-films-close")/);
});

test("modal close paths, focus management, scroll lock, and playback lifecycle are complete", () => {
  assert.match(controller, /event\.key === "Escape"/);
  assert.match(controller, /data-films-close/);
  assert.match(controller, /films-modal__backdrop/);
  assert.match(controller, /function trapFocus\(/);
  assert.match(controller, /lastFocusedCard\.focus\(\)/);
  assert.match(controller, /classList\.add\("is-films-modal-open"\)/);
  assert.match(controller, /classList\.remove\("is-films-modal-open"\)/);
  assert.match(styles, /body\.is-films-modal-open\s*\{\s*overflow:\s*hidden/);
  assert.match(controller, /RRSViewportVideoPlayback\.unobserve\(grid\)/);
  assert.match(controller, /modalVideo\.currentTime = 0/);
  assert.match(controller, /RRSViewportVideoPlayback\.observe\(grid\)/);
});

test("mobile modal follows EXIT, video, details order with safe-area and no horizontal overflow", () => {
  assert.ok(page.indexOf("films-modal__close") < page.indexOf("films-modal__video"));
  assert.ok(page.indexOf("films-modal__video") < page.indexOf("films-modal__details"));
  assert.match(styles, /\.films-modal\s*\{[\s\S]*?height:\s*100vh;[\s\S]*?height:\s*100dvh;[\s\S]*?safe-area-inset-top/);
  assert.match(styles, /\.films-modal__content\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(styles, /\.films-modal__close\s*\{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/);
});

test("dataset, Search, CMS, APIs, assets, and unrelated sections remain unchanged", () => {
  execFileSync("git", [
    "diff", "--quiet", "HEAD", "--",
    "data", "search.html", "search.js", "utils/searchData.js", "cms", "admin.html",
    "admin-server.js", "admin.js", "admin-books.js", "admin-portfolio.js", "assets",
    "magazines-books.html", "magazines-books.js", "brand-identity.html", "brand-identity.js",
    "events.html", "events.js", "about.html", "index.html", "clients.html"
  ], { cwd: root });
});
