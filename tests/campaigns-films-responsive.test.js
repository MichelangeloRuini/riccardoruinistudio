const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const styles = read("style.css");
const campaignsPage = read("campaigns.html");
const filmsPage = read("films.html");
const renderer = read("utils/renderProject.js");
const campaignsController = read("campaigns-mobile-detail.js");
const marker = "STEP 5 RESPONSIVE: CAMPAIGNS / FILMS";
const markerIndex = styles.indexOf(marker);
const nextMarker = "STEP 6 RESPONSIVE: SEARCH RESULTS / PROJECT DETAIL";
const nextMarkerIndex = styles.indexOf(nextMarker, markerIndex);
const responsiveStyles = styles.slice(markerIndex, nextMarkerIndex);
const mobileStart = responsiveStyles.indexOf("@media (max-width: 760px)");
const tabletStyles = responsiveStyles.slice(0, mobileStart);
const mobileStyles = responsiveStyles.slice(mobileStart);

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

  execFileSync("git", ["diff", "--quiet", "HEAD", "--", "campaigns.js"], { cwd: root });
  assert.match(campaignsController, /campaignsPage\.innerHTML = campaignRecords[\s\S]*?renderProject\(campaign, index, campaign\.media\)/);
  assert.match(campaignsController, /RRSViewportVideoPlayback\.observe\(campaignsPage\)/);
  assert.match(renderer, /class="campaign mobile-campaign-layout \$\{layout\}"/);
});

test("the existing 761px to 820px Campaigns layout still stacks info before full-width media", () => {
  assert.match(responsiveStyles, /@media \(max-width: 820px\)/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?gap:\s*24px/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-info,[\s\S]*?#campaignsPage \.campaign-media,[\s\S]*?order:\s*0[\s\S]*?width:\s*100%/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-info-inner,[\s\S]*?position:\s*static[\s\S]*?top:\s*auto[\s\S]*?text-align:\s*left/);
  assert.match(responsiveStyles, /#campaignsPage \.campaign-media-item,[\s\S]*?#campaignsPage \.campaign-media video,[\s\S]*?width:\s*100%[\s\S]*?height:\s*auto/);
  assert.doesNotMatch(tabletStyles, /#searchResults|\.search-result-group/);
});

test("Campaigns mobile renders a vertical list with one uncropped cover per campaign", () => {
  assert.match(responsiveStyles, /@media \(max-width: 760px\)/);
  assert.match(responsiveStyles, /#campaignsPage\.campaigns-page\s*\{[\s\S]*?display:\s*block[\s\S]*?height:\s*auto[\s\S]*?overflow:\s*visible/);
  assert.match(campaignsController, /const imageFile = mediaFiles\.find\(file => !file\.toLowerCase\(\)\.endsWith\("\.mp4"\)\)/);
  assert.match(campaignsController, /campaignRecords\.forEach\(campaign => list\.appendChild\(createCard\(campaign\)\)\)/);
  assert.match(campaignsController, /card\.append\(client, coverButton, title\)/);
  assert.match(mobileStyles, /:is\(#campaignsPage, #searchResults\) \.campaign-mobile-card\s*\{[\s\S]*?border-bottom:\s*1px solid #000/);
  assert.match(mobileStyles, /campaign-mobile-card__client[\s\S]*?text-align:\s*left/);
  assert.match(mobileStyles, /campaign-mobile-card__title[\s\S]*?text-align:\s*right/);
  assert.match(mobileStyles, /campaign-mobile-card__media[\s\S]*?height:\s*auto[\s\S]*?object-fit:\s*contain/);
  const mobileBranch = campaignsController.slice(
    campaignsController.indexOf("if (controller.matches())"),
    campaignsController.indexOf("campaignsPage.innerHTML = campaignRecords")
  );
  assert.doesNotMatch(mobileBranch, /renderProject\(/);
});

test("Campaigns mobile detail opens accessibly and lazily creates complete credits and media", () => {
  assert.match(campaignsPage, /<script src="campaigns-mobile-detail\.js"><\/script>/);
  assert.doesNotMatch(campaignsPage, /campaigns-mobile-galleries\.js|<script src="campaigns\.js"/);
  assert.match(campaignsController, /const MOBILE_QUERY = "\(max-width: 760px\)"/);
  assert.match(campaignsController, /detail\.setAttribute\("role", "dialog"\)/);
  assert.match(campaignsController, /detail\.setAttribute\("aria-modal", "true"\)/);
  assert.match(campaignsController, /function handleRootClick\(event\)[\s\S]*?openDetail\(campaign, trigger\)/);
  assert.match(campaignsController, /root\.addEventListener\("click", handleRootClick\)/);
  assert.match(campaignsController, /\(Array\.isArray\(campaign\.credits\) \? campaign\.credits : \[\]\)\.forEach/);
  assert.match(campaignsController, /const photographs = mediaFiles\.filter\(file => !file\.toLowerCase\(\)\.endsWith\("\.mp4"\)\)/);
  assert.match(campaignsController, /photographs\.forEach[\s\S]*?videos\.forEach/);
  assert.match(campaignsController, /detailMedia\.replaceChildren\(fragment\)/);
  assert.match(campaignsController, /clearDetailMedia\(\)[\s\S]*?detailMedia\.replaceChildren\(\)/);
  assert.match(mobileStyles, /campaign-mobile-detail[\s\S]*?background:\s*#000[\s\S]*?color:\s*#fff/);
  assert.match(mobileStyles, /campaign-mobile-detail__media\s*\{[\s\S]*?flex-direction:\s*column[\s\S]*?gap:\s*20px/);
  assert.doesNotMatch(campaignsController, /autoplay|\.play\(/);
});

test("video-only campaigns receive a non-autoplay video cover fallback", () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${read("data/campaigns.js")}\n;globalThis.records = campaigns;`, context);
  const videoOnly = context.records.filter(campaign => (
    campaign.media.length > 0
    && campaign.media.every(file => file.toLowerCase().endsWith(".mp4"))
  ));

  assert.equal(videoOnly.length, 3);
  assert.match(campaignsController, /const coverFile = imageFile \|\| mediaFiles\.find\(file => file\.toLowerCase\(\)\.endsWith\("\.mp4"\)\)/);
  assert.match(campaignsController, /video\.preload = "metadata"/);
  assert.match(campaignsController, /if \(poster\) video\.poster/);
  assert.match(campaignsController, /#t=0\.001/);
});

test("closing Campaigns detail restores scroll and focus, and crossing 760px restores desktop", () => {
  assert.match(campaignsController, /lockedScrollY = global\.scrollY/);
  assert.match(campaignsController, /body\.style\.position = "fixed"/);
  assert.match(campaignsController, /global\.scrollTo\(0, lockedScrollY\)/);
  assert.match(campaignsController, /focusTarget\.focus\(\{ preventScroll: true \}\)/);
  assert.match(campaignsController, /event\.key === "Escape"[\s\S]*?closeDetail\(\)/);
  assert.match(campaignsController, /event\.key !== "Tab"/);
  assert.match(campaignsController, /mobileQuery\.addEventListener\("change", handleBreakpointChange\)/);
  assert.match(campaignsController, /function handleBreakpointChange\(event\)[\s\S]*?if \(!event\.matches\) closeDetail\(\{ restoreFocus: false \}\)[\s\S]*?refresh\(\)/);
  assert.match(campaignsController, /global\.matchMedia\(MOBILE_QUERY\)\.addEventListener\("change", renderCampaignsPage\)/);
});

test("Campaigns mobile refinements preserve touch targets and reuse the Visual Identity hover language", () => {
  assert.match(campaignsController, /hoverLabel\.textContent = "VIEW ↗"/);
  assert.match(mobileStyles, /campaign-mobile-card__hover[\s\S]*?background:\s*rgba\(0, 0, 0, 0\.12\)[\s\S]*?transition:\s*opacity 250ms ease/);
  assert.match(mobileStyles, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?campaign-mobile-card__cover:hover[\s\S]*?opacity:\s*1/);
  assert.match(mobileStyles, /campaign-mobile-card__cover:focus-visible \.campaign-mobile-card__hover[\s\S]*?opacity:\s*1/);
  assert.doesNotMatch(mobileStyles.slice(mobileStyles.indexOf("campaign-mobile-card__cover")), /transform:\s*scale/);
  assert.match(mobileStyles, /campaign-mobile-detail__close\s*\{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px[\s\S]*?font-size:\s*10px[\s\S]*?font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(mobileStyles, /campaign-mobile-detail__close::after\s*\{[\s\S]*?border:\s*1px solid #fff/);
  assert.match(mobileStyles, /campaign-mobile-detail__credits\s*\{[\s\S]*?font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(mobileStyles, /campaign-mobile-detail__credits dt,[\s\S]*?campaign-mobile-detail__credits a\s*\{[\s\S]*?font-weight:\s*var\(--font-weight-bold\)/);
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
    "utils/viewportVideoPlayback.js",
    "campaigns.js",
    "campaigns-mobile-galleries.js",
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
