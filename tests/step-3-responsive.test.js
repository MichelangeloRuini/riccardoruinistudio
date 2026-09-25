const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const styles = read("style.css");
const marker = "STEP 3 RESPONSIVE: ABOUT / EVENTS / VISUAL IDENTITY";
const markerIndex = styles.indexOf(marker);
const responsiveStyles = styles.slice(markerIndex);
const tabletStart = responsiveStyles.indexOf("@media (max-width: 1100px)");
const mobileStart = responsiveStyles.indexOf("@media (max-width: 760px)");
const tabletStyles = responsiveStyles.slice(tabletStart, mobileStart);
const mobileStyles = responsiveStyles.slice(mobileStart);
const aboutHtml = read("about.html");
const eventsHtml = read("events.html");
const brandIdentityHtml = read("brand-identity.html");

test("Step 3 is append-only and preserves the approved desktop declarations", () => {
  const headStyles = execFileSync("git", ["show", "HEAD:style.css"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.ok(markerIndex > 0);
  assert.ok(styles.startsWith(headStyles));
  assert.match(headStyles, /\.about-page \.about-services\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(headStyles, /\.brand-identity-columns\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(headStyles, /\.events-page \.events-video\s*\{[\s\S]*?aspect-ratio:\s*16 \/ 9[\s\S]*?object-fit:\s*cover/);
  assert.match(headStyles, /\.brand-identity-page \.brand-identity-columns \.portfolio-card-visual\s*\{\s*aspect-ratio:\s*1800 \/ 1253/);
  assert.match(headStyles, /\.brand-identity-page \.brand-identity-columns \.portfolio-card-visual img\s*\{[\s\S]*?object-fit:\s*cover/);
});

test("About uses two tablet columns and one readable mobile column", () => {
  assert.match(tabletStyles, /\.about-page \.about-services\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobileStyles, /\.about-page,[\s\S]*?padding:\s*38px 20px 60px/);
  assert.match(mobileStyles, /\.about-page \.about-services\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?row-gap:\s*48px/);
  assert.match(mobileStyles, /\.about-page \.about-introduction\s*\{[\s\S]*?font-size:\s*12px[\s\S]*?letter-spacing:\s*0\.065em/);
  assert.match(mobileStyles, /\.about-page \.about-introduction \.editorial-emphasis,[\s\S]*?letter-spacing:\s*0\.025em/);

  const serviceTitles = [...aboutHtml.matchAll(/class="about-service-title">([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(serviceTitles, [
    "BRAND STRATEGY",
    "BRANDING",
    "CREATIVE DIRECTION",
    "FILM &amp; VIDEO CREATION",
    "EVENTS &amp; EXPERIENCES",
    "HOSPITALITY",
    "DIGITAL",
    "ART BUYING",
    "PUBLISHING"
  ]);
});

test("Events keeps its editorial paragraphs and unchanged 16:9 playback", () => {
  assert.match(mobileStyles, /\.events-page \.events-introduction\s*\{[\s\S]*?font-size:\s*12\.5px[\s\S]*?letter-spacing:\s*0\.065em/);
  assert.match(mobileStyles, /\.events-page \.events-introduction \.editorial-emphasis\s*\{\s*letter-spacing:\s*0\.025em/);
  assert.match(mobileStyles, /\.events-page \.events-media,[\s\S]*?\.events-page \.events-video\s*\{\s*width:\s*100%/);
  assert.equal((eventsHtml.match(/<section class="events-introduction"[\s\S]*?<\/section>/) || [""])[0].match(/<p>/g).length, 2);
  assert.match(eventsHtml, /<video class="events-video" autoplay muted loop playsinline preload="metadata">/);
  assert.match(eventsHtml, /<source src="assets\/events\/cattleya-ruini-events\.mp4" type="video\/mp4">/);
});

test("Visual Identity remains a two-column grid on tablet and a one-column grid on mobile", () => {
  assert.match(tabletStyles, /\.brand-identity-page \.brand-identity-columns\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(tabletStyles, /\.brand-identity-page \.brand-identity-columns \.portfolio-card-visual\s*\{\s*min-height:\s*0/);
  assert.match(mobileStyles, /\.brand-identity-page \.brand-identity-columns\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?row-gap:\s*56px/);
  assert.match(mobileStyles, /\.brand-identity-page \.brand-identity-introduction\s*\{[\s\S]*?font-size:\s*12\.5px[\s\S]*?letter-spacing:\s*0\.065em/);
  assert.match(mobileStyles, /\.brand-identity-page \.brand-identity-introduction br::after\s*\{\s*content:\s*" "/);
  assert.match(brandIdentityHtml, /<div class="brand-identity-columns" id="brandIdentityGrid"><\/div>/);
});

test("protected pages, shell, footer, data, CMS, APIs, assets, and renderers are unchanged", () => {
  execFileSync("git", [
    "diff",
    "--quiet",
    "HEAD",
    "--",
    "about.html",
    "events.html",
    "brand-identity.html",
    "project.html",
    "script.js",
    "brand-identity.js",
    "campaigns.html",
    "campaigns.js",
    "films.html",
    "films.js",
    "magazines-books.html",
    "magazines-books.js",
    "search.html",
    "search.js",
    "data",
    "cms",
    "admin.html",
    "admin-server.js",
    "admin.js",
    "admin-books.js",
    "admin-portfolio.js",
    "assets",
    "utils"
  ], { cwd: root });

  const headStyles = execFileSync("git", ["show", "HEAD:style.css"], {
    cwd: root,
    encoding: "utf8"
  });
  for (const protectedMarker of [
    "GLOBAL MOBILE / TABLET HEADER SHELL",
    "GLOBAL RESPONSIVE FOOTER / MOBILE CLIENTS"
  ]) {
    const start = headStyles.indexOf(protectedMarker);
    const currentStart = styles.indexOf(protectedMarker);
    const headSection = headStyles.slice(start, headStyles.indexOf("/* ==========================================================", start + protectedMarker.length));
    assert.equal(styles.slice(currentStart, currentStart + headSection.length), headSection);
  }
});
