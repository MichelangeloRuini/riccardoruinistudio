const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const style = fs.readFileSync(path.join(root, "style.css"), "utf8");
const publicPages = [
  "about.html",
  "brand-identity.html",
  "campaigns.html",
  "clients.html",
  "events.html",
  "films.html",
  "index.html",
  "magazines-books.html",
  "project.html",
  "search.html"
];

test("footer WebP frames are lossless Retina assets with transparency", async () => {
  for (const suffix of ["01", "02"]) {
    const pngPath = path.join(root, "assets", "ui", `logo-footer-${suffix}.png`);
    const webpPath = path.join(root, "assets", "ui", `logo-footer-${suffix}.webp`);
    const metadata = await sharp(webpPath).metadata();
    const resizedPng = await sharp(pngPath)
      .rotate()
      .resize({ width: 380, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const decodedWebp = await sharp(webpPath).ensureAlpha().raw().toBuffer();

    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 380);
    assert.equal(metadata.height, 291);
    assert.equal(metadata.hasAlpha, true);
    assert.ok(fs.statSync(webpPath).size < 50 * 1024);
    assert.deepEqual(decodedWebp, resizedPng);
  }
});

test("all public footers reference the optimized frames while the landing defers them", () => {
  publicPages.forEach(file => {
    const html = fs.readFileSync(path.join(root, file), "utf8");

    assert.doesNotMatch(html, /logo-footer-0[12]\.png/);
    assert.match(html, /logo-footer-01\.webp/);
    assert.match(html, /logo-footer-02\.webp/);
  });

  assert.match(indexHtml, /data-media-deferred-src="assets\/ui\/logo-footer-01\.webp"/);
  assert.match(indexHtml, /data-media-deferred-src="assets\/ui\/logo-footer-02\.webp"/);
  assert.doesNotMatch(indexHtml, /data-media-src="assets\/ui\/logo-footer-0[12]\.webp"/);
});

test("Enter and skipLanding bind deferred frames before revealing the site", () => {
  const loader = script.indexOf("function loadDeferredFooterFrames()");
  const enterLoader = script.indexOf("loadDeferredFooterFrames();", script.indexOf("function enterSite()"));
  const leave = script.indexOf('landing.classList.add("is-leaving")');
  const skipBranch = script.indexOf('if (skipLanding === "true")');
  const skipLoader = script.indexOf("loadDeferredFooterFrames();", skipBranch);
  const showSite = script.indexOf('document.body.classList.add("entered")', skipBranch);

  assert.ok(loader >= 0);
  assert.ok(enterLoader < leave);
  assert.ok(skipLoader < showSite);
  assert.match(script, /RRSMedia\.setImage\(frame, assetUrl\)/);
  assert.match(script, /removeAttribute\("data-media-deferred-src"\)/);
});

test("footer frame geometry and two-step alternation remain unchanged", () => {
  assert.match(style, /\.footer-logo-frame\s*\{[^}]*width:\s*190px;[^}]*height:\s*auto;/s);
  assert.match(style, /\.frame-1\s*\{[^}]*animation:\s*footerLogoOne 2s steps\(1, end\) infinite;/s);
  assert.match(style, /\.frame-2\s*\{[^}]*animation:\s*footerLogoTwo 2s steps\(1, end\) infinite;/s);
});
