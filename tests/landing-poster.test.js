const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const posterPath = path.join(root, "assets", "hero-poster.webp");
const desktopVideoPath = path.join(root, "assets", "hero-desktop.mp4");
const mobileVideoPath = path.join(root, "assets", "hero-mobile.mp4");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("landing poster is a lightweight 16:9 WebP", async () => {
  const stats = fs.statSync(posterPath);
  const metadata = await sharp(posterPath).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 720);
  assert.ok(stats.size < 150 * 1024, `poster is ${stats.size} bytes`);
});

test("landing resolves the poster during parsing without changing video playback attributes", () => {
  const video = html.match(/<video\b[^>]*class="landing-video"[^>]*>/)?.[0] || "";
  const posterBinding = "RRSMedia.setPoster(landingVideo, \"assets/hero-poster.webp\");";

  assert.match(video, /\bautoplay\b/);
  assert.match(video, /\bmuted\b/);
  assert.match(video, /\bloop\b/);
  assert.match(video, /\bplaysinline\b/);
  assert.match(video, /data-media-poster="assets\/hero-poster\.webp"/);
  assert.ok(html.includes(posterBinding));
  assert.ok(html.indexOf(posterBinding) < html.indexOf("data/campaigns.js"));
});

test("landing selects exactly one optimized video before binding the source", () => {
  assert.match(html, /data-media-src-desktop="assets\/hero-desktop\.mp4"/);
  assert.match(html, /data-media-src-mobile="assets\/hero-mobile\.mp4"/);
  assert.match(html, /matchMedia\("\(max-width: 760px\)"\)/);
  assert.match(html, /navigator\.maxTouchPoints > 0/);
  assert.match(html, /Math\.min\(screen\.width, screen\.height\) <= 760/);
  assert.match(html, /landingSource\.dataset\.mediaSrc = videoAssetUrl/);
  assert.match(html, /RRSMedia\.setVideoSource\(landingVideo, landingSource, videoAssetUrl\)/);
  assert.doesNotMatch(html, /assets\/hero\.mp4/);
});

test("checked-in optimized videos match the approved encodes", () => {
  assert.equal(fs.statSync(desktopVideoPath).size, 6577232);
  assert.equal(fs.statSync(mobileVideoPath).size, 3964469);
  assert.equal(sha256(desktopVideoPath), "ef9fbf5230b459a7cdc567359a13f122c3819003b41ec7b3154a3d1d48f591f5");
  assert.equal(sha256(mobileVideoPath), "932401985d9ee5f7acf4829f9d8bb0ed10d2d1fc45dfd39b39694acdaf43bae5");
});
