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
const responsiveStyles = styles.slice(styles.indexOf(marker));
const tabletStart = responsiveStyles.indexOf("@media (max-width: 1100px)");
const mobileStart = responsiveStyles.indexOf("@media (max-width: 760px)");
const tabletStyles = responsiveStyles.slice(tabletStart, mobileStart);
const mobileStyles = responsiveStyles.slice(mobileStart);

test("the global footer uses two fluid columns at 1100px and preserves desktop CSS", () => {
  const headStyles = execFileSync("git", ["show", "HEAD:style.css"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.ok(styles.startsWith(headStyles));
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

test("Clients mobile uses compact type, real side padding, and proportional movement", () => {
  assert.match(mobileStyles, /\.clients-section\s*\{[\s\S]*?padding:\s*0 20px 48px/);
  assert.match(mobileStyles, /\.clients-wall-wrapper\s*\{[\s\S]*?width:\s*100%[\s\S]*?margin-left:\s*0/);
  assert.match(mobileStyles, /\.clients-wall\s*\{[\s\S]*?font-size:\s*clamp\(28px, 7\.5vw, 32px\)/);
  assert.match(mobileStyles, /line-height:\s*1/);
  assert.match(mobileStyles, /animation:\s*wallMoveMobile 28s linear infinite/);
  assert.match(mobileStyles, /translateX\(-12vw\)/);
  assert.doesNotMatch(mobileStyles, /translateX\(-420px\)/);
});

test("the landing has a vh fallback and a dynamic viewport height on mobile", () => {
  assert.match(mobileStyles, /\.landing\s*\{\s*height:\s*100vh;\s*height:\s*100dvh/);
  assert.match(mobileStyles, /\.site\s*\{\s*min-height:\s*100vh;\s*min-height:\s*100dvh/);
  assert.match(mobileStyles, /\.landing-logo img\s*\{[\s\S]*?max-width:\s*100%/);
});

test("Clients data, Search/filter, and the approved Step 1 JavaScript remain protected", () => {
  const headScript = execFileSync("git", ["show", "HEAD:script.js"], {
    cwd: root,
    encoding: "utf8"
  });
  const searchSuggestionsMarker = "/* SEARCH SUGGESTIONS */";
  const clientsStart = "const clients = [";
  const clientsEnd = "const landing = document.getElementById";
  const filterStart = "if (searchInput && clientsWall)";

  assert.equal(
    script.slice(script.indexOf(clientsStart), script.indexOf(clientsEnd)),
    headScript.slice(headScript.indexOf(clientsStart), headScript.indexOf(clientsEnd))
  );
  assert.equal(
    script.slice(script.indexOf(filterStart), script.indexOf(searchSuggestionsMarker)),
    headScript.slice(headScript.indexOf(filterStart), headScript.indexOf(searchSuggestionsMarker))
  );
  assert.match(script, /matchMedia\("\(max-width: 760px\)"\)\.matches/);
  assert.match(script, /list\.length > 8 && !isMobileClientsLayout/);
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
    "data",
    "cms",
    "admin.html",
    "admin-server.js",
    "admin.js",
    "admin-books.js",
    "admin-portfolio.js",
    "assets",
    "utils/searchData.js",
    "utils/renderProject.js",
    "utils/renderPortfolio.js",
    "search.js",
    "campaigns.js",
    "films.js",
  ], { cwd: root });
});
