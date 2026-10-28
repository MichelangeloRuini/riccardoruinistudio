const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const styles = read("style.css");
const script = read("script.js");
const marker = "/* ==========================================================\n   GLOBAL RESPONSIVE FOOTER / MOBILE CLIENTS";
const nextMarker = "/* ==========================================================\n   STEP 3 RESPONSIVE: ABOUT / EVENTS / VISUAL IDENTITY";
const responsiveStyles = styles.slice(styles.indexOf(marker), styles.indexOf(nextMarker));
const tabletStart = responsiveStyles.indexOf("@media (max-width: 1100px)");
const mobileStart = responsiveStyles.indexOf("@media (max-width: 760px)");
const tabletStyles = responsiveStyles.slice(tabletStart, mobileStart);
const mobileStyles = responsiveStyles.slice(mobileStart);
const footerCharacterAssets = [
  "assets/ui/diavoletto-about.png",
  "assets/ui/diavoletto-clients-talents-v2.png",
  "assets/ui/diavoletto-visual-identity.png",
  "assets/ui/diavoletto-films.png",
  "assets/ui/diavoletto-magazines-books.png"
];

test("the global footer uses two fluid columns at 1100px and preserves desktop CSS", () => {
  const headStyles = execFileSync("git", ["show", "HEAD:style.css"], {
    cwd: root,
    encoding: "utf8"
  });

  const headResponsiveStyles = headStyles.slice(
    headStyles.indexOf(marker),
    headStyles.indexOf(nextMarker)
  );
  const headTabletStart = headResponsiveStyles.indexOf("@media (max-width: 1100px)");
  const headMobileStart = headResponsiveStyles.indexOf("@media (max-width: 760px)");
  const headTabletStyles = headResponsiveStyles.slice(headTabletStart, headMobileStart);

  assert.equal(
    tabletStyles,
    headTabletStyles
  );
  assert.match(tabletStyles, /\.footer\.footer\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(tabletStyles, /\.clients-wall-wrapper\s*\{[\s\S]*?width:\s*100%[\s\S]*?margin-left:\s*0/);
  assert.match(tabletStyles, /\.footer\.footer\s*>\s*\*\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(tabletStyles, /\.footer-newsletter input\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*100%/);
  assert.match(headStyles, /GLOBAL RESPONSIVE FOOTER \/ MOBILE CLIENTS/);
  assert.match(headStyles, /\.footer\.footer\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("the global mobile footer uses the editorial two-column layout", () => {
  assert.match(mobileStyles, /\.footer\.footer\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.5fr\) minmax\(120px, 1fr\)/);
  assert.match(mobileStyles, /grid-template-areas:\s*"social address"\s*"legal logo"\s*"newsletter logo"/);
  assert.match(mobileStyles, /\.footer \.footer-address\s*\{\s*grid-area:\s*address/);
  assert.match(mobileStyles, /\.footer \.footer-social\s*\{\s*grid-area:\s*social/);
  assert.match(mobileStyles, /\.footer \.footer-legal\s*\{\s*grid-area:\s*legal/);
  assert.match(mobileStyles, /\.footer \.footer-newsletter\s*\{\s*grid-area:\s*newsletter/);
  assert.match(mobileStyles, /\.footer \.footer-newsletter,[\s\S]*?\.footer \.footer-newsletter input\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*100%/);
  assert.match(mobileStyles, /\.footer \.footer-logo\s*\{[\s\S]*?grid-area:\s*logo[\s\S]*?max-width:\s*126px[\s\S]*?height:\s*120px/);
  assert.match(mobileStyles, /\.footer \.footer-logo-frame,[\s\S]*?object-position:\s*right bottom/);
  assert.match(mobileStyles, /padding:\s*64px 20px max\(28px, env\(safe-area-inset-bottom\)\)/);
});

test("section footer characters use one centralized page map and the existing frame pair", () => {
  const expectedMappings = {
    "about.html": "assets/ui/diavoletto-about.png",
    "clients.html": "assets/ui/diavoletto-clients-talents-v2.png",
    "brand-identity.html": "assets/ui/diavoletto-visual-identity.png",
    "films.html": "assets/ui/diavoletto-films.png",
    "magazines-books.html": "assets/ui/diavoletto-magazines-books.png"
  };

  Object.entries(expectedMappings).forEach(([page, asset]) => {
    assert.match(script, new RegExp(`"${page}": "${asset}"`));
  });

  assert.match(script, /document\.querySelectorAll\("\.footer-logo-frame"\)\.forEach/);
  assert.match(script, /frame\.dataset\.mediaSrc = character/);
  assert.match(script, /RRSMedia\.setImage\(frame, character\)/);
  assert.match(script, /frame\.classList\.add\("is-section-character"\)/);
  assert.match(styles, /\.footer-logo-frame\.is-section-character\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*contain[^}]*object-position:\s*right top/);

  footerCharacterAssets.forEach(asset => {
    const contents = fs.readFileSync(path.join(root, asset));
    assert.deepEqual([...contents.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
});

test("Campaigns and unmapped pages retain the original animated footer character", () => {
  ["campaigns.html", "index.html", "search.html", "project.html", "events.html"].forEach(page => {
    const html = read(page);
    assert.equal((html.match(/<footer class="footer">/g) || []).length, 1);
    assert.match(html, /assets\/ui\/logo-footer-01\.png/);
    assert.match(html, /assets\/ui\/logo-footer-02\.png/);
  });

  assert.doesNotMatch(script, /"campaigns\.html"\s*:|"index\.html"\s*:|"search\.html"\s*:|"project\.html"\s*:|"events\.html"\s*:/);
  assert.match(styles, /\.frame-1\s*\{[^}]*animation:\s*footerLogoOne 2s steps\(1, end\) infinite/);
  assert.match(styles, /\.frame-2\s*\{[^}]*animation:\s*footerLogoTwo 2s steps\(1, end\) infinite/);
});

test("Clients mobile is one manually scrollable editorial poster", () => {
  assert.match(mobileStyles, /\.clients-section\s*\{[\s\S]*?padding:\s*0 0 128px[\s\S]*?overflow:\s*visible/);
  assert.match(mobileStyles, /\.clients-wall-wrapper\s*\{[\s\S]*?width:\s*100%[\s\S]*?overflow-x:\s*auto[\s\S]*?overflow-y:\s*hidden/);
  assert.match(mobileStyles, /touch-action:\s*pan-x pan-y/);
  assert.match(mobileStyles, /\.clients-wall-hint\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*calc\(100svh - 128px\)[\s\S]*?height:\s*128px[\s\S]*?margin-bottom:\s*-128px[\s\S]*?pointer-events:\s*none/);
  assert.match(mobileStyles, /background:\s*linear-gradient\([\s\S]*?rgba\(248, 246, 242, 0\)[\s\S]*?rgba\(248, 246, 242, 0\.9\) 100%[\s\S]*?font-size:\s*11px[\s\S]*?font-weight:\s*var\(--font-weight-light\)[\s\S]*?letter-spacing:\s*0\.11em/);
  assert.match(mobileStyles, /transition:\s*opacity 300ms ease, visibility 0s linear 300ms/);
  assert.match(mobileStyles, /@media \(max-width: 760px\) and \(prefers-reduced-motion: reduce\)[\s\S]*?\.clients-wall-hint\s*\{\s*transition:\s*none/);
  assert.match(mobileStyles, /\.clients-wall\s*\{[\s\S]*?width:\s*1575px/);
  assert.match(mobileStyles, /font-size:\s*28px/);
  assert.match(mobileStyles, /font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(mobileStyles, /line-height:\s*1\.05/);
  assert.match(mobileStyles, /\.clients-wall,\s*\.clients-wall \.client-name\s*\{[\s\S]*?-webkit-text-size-adjust:\s*100%[\s\S]*?text-size-adjust:\s*100%/);
  assert.match(mobileStyles, /animation:\s*none/);
  assert.match(mobileStyles, /transform:\s*none/);
  assert.doesNotMatch(mobileStyles, /wallMoveMobile|scroll-snap/);

  ["index.html", "clients.html"].forEach(page => {
    const html = read(page);
    assert.match(html, /<p class="clients-wall-hint">← DRAG TO EXPLORE →<\/p>[\s\S]*?class="clients-wall-wrapper" role="region" aria-label="Clients and talents — horizontal scroll" tabindex="0"/);
  });
});

test("the landing has a vh fallback and a dynamic viewport height on mobile", () => {
  assert.match(mobileStyles, /\.landing\s*\{\s*height:\s*100vh;\s*height:\s*100dvh/);
  assert.match(mobileStyles, /\.site\s*\{\s*min-height:\s*100vh;\s*min-height:\s*100dvh/);
  assert.match(mobileStyles, /\.landing-logo img\s*\{[\s\S]*?max-width:\s*100%/);
});

test("the curated wall may change while unrelated landing, Search, and modal logic stays protected", () => {
  const headScript = execFileSync("git", ["show", "HEAD:script.js"], {
    cwd: root,
    encoding: "utf8"
  });
  const searchSuggestionsMarker = "/* SEARCH SUGGESTIONS */";
  const landingStart = "const landing = document.getElementById";
  const rendererStart = "function renderClients";
  const filterStart = "if (searchInput && clientsWall)";
  const removeFooterCharacterInitializer = value => value.replace(
    /\n\/\* SECTION FOOTER CHARACTERS \*\/[\s\S]*?\ninitializeSectionFooterCharacter\(\);\n/,
    ""
  );
  const removeStartProjectInitializer = value => value.replace(
    /\n\/\* START A PROJECT \*\/[\s\S]*?\ninitializeStartProjectModal\(\);\n/,
    ""
  );

  assert.equal(
    script.slice(script.indexOf(landingStart), script.indexOf(rendererStart)),
    headScript.slice(headScript.indexOf(landingStart), headScript.indexOf(rendererStart))
  );
  assert.equal(
    script.slice(script.indexOf(filterStart), script.indexOf(searchSuggestionsMarker)),
    headScript.slice(headScript.indexOf(filterStart), headScript.indexOf(searchSuggestionsMarker))
  );
  assert.equal(
    removeStartProjectInitializer(removeFooterCharacterInitializer(script.slice(script.indexOf(searchSuggestionsMarker)))),
    removeStartProjectInitializer(removeFooterCharacterInitializer(headScript.slice(headScript.indexOf(searchSuggestionsMarker))))
  );
  assert.match(script, /document\.createElement\("a"\)/);
  assert.doesNotMatch(script.slice(script.indexOf(rendererStart), script.indexOf(filterStart)), /repeatedList/);
  assert.match(script, /function initializeMobileHeader\(\)/);
  assert.match(script, /document\.addEventListener\("rrs:open-start-project"/);
});

test("HTML, datasets, CMS, APIs, assets, Search, and renderers remain untouched", () => {
  execFileSync("git", [
    "diff",
    "--quiet",
    "HEAD",
    "--",
    "*.html",
    ":(exclude)index.html",
    ":(exclude)clients.html",
    ":(exclude)campaigns.html",
    ":(exclude)films.html",
    ":(exclude)search.html",
    ":(exclude)project.html",
    ":(exclude)brand-identity.html",
    ":(exclude)events.html",
    ":(exclude)magazines-books.html",
    ":(exclude)about.html",
    "data",
    "cms",
    "admin.html",
    "admin-server.js",
    "admin.js",
    "admin-books.js",
    "admin-portfolio.js",
    "assets",
    ":(exclude)assets/ui/diavoletto-about.png",
    ":(exclude)assets/ui/diavoletto-clients-talents-v2.png",
    ":(exclude)assets/ui/diavoletto-visual-identity.png",
    ":(exclude)assets/ui/diavoletto-films.png",
    ":(exclude)assets/ui/diavoletto-magazines-books.png",
    "utils/searchData.js",
    "campaigns.js",
  ], { cwd: root });
});
