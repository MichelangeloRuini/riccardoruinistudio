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
  "assets/ui/diavoletto-clients-talents.png",
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

  const normalizeWallMotion = value => value.replace(
    /animation:\s*wallMoveMobile 28s [^;]+;/,
    "animation: <authorized-wall-motion>;"
  );
  assert.equal(
    normalizeWallMotion(responsiveStyles),
    normalizeWallMotion(headResponsiveStyles)
  );
  assert.match(tabletStyles, /\.footer\.footer\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(tabletStyles, /\.clients-wall-wrapper\s*\{[\s\S]*?width:\s*100%[\s\S]*?margin-left:\s*0/);
  assert.match(tabletStyles, /\.footer\.footer\s*>\s*\*\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(tabletStyles, /\.footer-newsletter input\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*100%/);
  assert.match(headStyles, /GLOBAL RESPONSIVE FOOTER \/ MOBILE CLIENTS/);
  assert.match(headStyles, /\.footer\.footer\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("the global footer becomes one column at 760px with a responsive logo", () => {
  assert.match(mobileStyles, /\.footer\.footer\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(mobileStyles, /\.footer \.footer-newsletter,[\s\S]*?\.footer \.footer-logo\s*\{\s*grid-column:\s*1/);
  assert.match(mobileStyles, /\.footer \.footer-logo\s*\{[\s\S]*?width:\s*min\(150px, 100%\)[\s\S]*?height:\s*95px/);
  assert.match(mobileStyles, /padding:\s*75px 20px 30px/);
});

test("section footer characters use one centralized page map and the existing frame pair", () => {
  const expectedMappings = {
    "about.html": "assets/ui/diavoletto-about.png",
    "clients.html": "assets/ui/diavoletto-clients-talents.png",
    "brand-identity.html": "assets/ui/diavoletto-visual-identity.png",
    "films.html": "assets/ui/diavoletto-films.png",
    "magazines-books.html": "assets/ui/diavoletto-magazines-books.png"
  };

  Object.entries(expectedMappings).forEach(([page, asset]) => {
    assert.match(script, new RegExp(`"${page}": "${asset}"`));
  });

  assert.match(script, /document\.querySelectorAll\("\.footer-logo-frame"\)\.forEach/);
  assert.match(script, /frame\.src = character/);
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

test("Clients mobile uses compact type, real side padding, and proportional movement", () => {
  assert.match(mobileStyles, /\.clients-section\s*\{[\s\S]*?padding:\s*0 20px 48px/);
  assert.match(mobileStyles, /\.clients-wall-wrapper\s*\{[\s\S]*?width:\s*100%[\s\S]*?margin-left:\s*0/);
  assert.match(mobileStyles, /\.clients-wall\s*\{[\s\S]*?font-size:\s*clamp\(28px, 7\.5vw, 32px\)/);
  assert.match(mobileStyles, /line-height:\s*1/);
  assert.match(mobileStyles, /animation:\s*wallMoveMobile 28s linear infinite alternate/);
  assert.match(mobileStyles, /translateX\(-12vw\)/);
  assert.doesNotMatch(mobileStyles, /translateX\(-420px\)/);
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

  assert.equal(
    script.slice(script.indexOf(landingStart), script.indexOf(rendererStart)),
    headScript.slice(headScript.indexOf(landingStart), headScript.indexOf(rendererStart))
  );
  assert.equal(
    script.slice(script.indexOf(filterStart), script.indexOf(searchSuggestionsMarker)),
    headScript.slice(headScript.indexOf(filterStart), headScript.indexOf(searchSuggestionsMarker))
  );
  assert.equal(
    removeFooterCharacterInitializer(script.slice(script.indexOf(searchSuggestionsMarker))),
    removeFooterCharacterInitializer(headScript.slice(headScript.indexOf(searchSuggestionsMarker)))
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
    ":(exclude)assets/ui/diavoletto-clients-talents.png",
    ":(exclude)assets/ui/diavoletto-visual-identity.png",
    ":(exclude)assets/ui/diavoletto-films.png",
    ":(exclude)assets/ui/diavoletto-magazines-books.png",
    "utils/searchData.js",
    "utils/renderProject.js",
    "utils/renderPortfolio.js",
    "search.js",
    "campaigns.js",
  ], { cwd: root });
});
