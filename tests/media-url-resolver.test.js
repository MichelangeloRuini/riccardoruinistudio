const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mediaConfig = require("../config/media.js");
const { createMediaUrlResolver } = require("../utils/mediaUrl.js");

const R2_BASE = "https://rrs-media.michelangelo-723.workers.dev";
const projectRoot = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.src = "";
    this.srcset = "";
    this.poster = "";
    this.paused = true;
    this.loadCalls = 0;
    this.playCalls = 0;
  }

  load() {
    this.loadCalls += 1;
  }

  play() {
    this.playCalls += 1;
    return Promise.resolve();
  }
}

class FakeImage extends FakeElement {
  static instances = [];

  constructor() {
    super();
    FakeImage.instances.push(this);
  }
}

function resolver(mode, extra = {}, dependencies) {
  return createMediaUrlResolver({
    mode,
    r2BaseUrl: R2_BASE,
    vercelBaseUrl: "",
    ...extra
  }, dependencies);
}

test("the checked-in media configuration uses R2 exclusively", () => {
  assert.deepEqual(mediaConfig, {
    mode: "r2",
    r2BaseUrl: R2_BASE,
    vercelBaseUrl: ""
  });
  assert.equal(Object.isFrozen(mediaConfig), true);
});

test("Vercel excludes synchronized media while retaining the Online CMS logo", () => {
  const vercelIgnore = read(".vercelignore");
  const onlineCms = read("online-cms/index.html");
  const excludedPaths = [
    "assets/books/",
    "assets/branding/",
    "assets/campaigns/",
    "assets/events/",
    "assets/films/",
    "assets/identities/",
    "assets/ui/",
    "assets/hero.mp4",
    "assets/hero-desktop.mp4",
    "assets/hero-mobile.mp4",
    "assets/hero-poster.webp",
    "assets/logo-icon.svg",
    "assets/.DS_Store"
  ];

  excludedPaths.forEach(assetPath => {
    assert.ok(
      vercelIgnore.split(/\r?\n/).includes(assetPath),
      `${assetPath} must be excluded from Vercel`
    );
  });
  assert.doesNotMatch(vercelIgnore, /^assets\/$/m);
  assert.match(onlineCms, /src="\.\.\/assets\/logo-main\.svg"/);
});

test("Vercel mode preserves current asset URLs byte for byte", () => {
  const media = resolver("vercel");
  const urls = [
    "assets/campaigns/example/01.jpg",
    "assets/campaigns/la-perla-petit-macramè-2019/01.webp",
    "assets/campaigns/example/video.mp4#t=0.001",
    "/assets/ui/logo-footer-01.png?version=2#frame"
  ];

  urls.forEach(url => assert.equal(media.resolve(url), url));
});

test("R2 and hybrid modes resolve assets against the configured public base URL", () => {
  ["r2", "hybrid"].forEach(mode => {
    const media = resolver(mode);
    assert.equal(
      media.resolve("assets/campaigns/example/video.mp4#t=0.001"),
      `${R2_BASE}/assets/campaigns/example/video.mp4#t=0.001`
    );
    assert.equal(
      media.resolve("/assets/books/book-01/video.mp4?quality=high"),
      `${R2_BASE}/assets/books/book-01/video.mp4?quality=high`
    );
  });
});

test("the public media hostname can be replaced in one configuration value", () => {
  const media = resolver("r2", { r2BaseUrl: "https://media.riccardoruinistudio.com/" });
  assert.equal(
    media.resolve("assets/hero.mp4"),
    "https://media.riccardoruinistudio.com/assets/hero.mp4"
  );
});

test("external, data, blob, and non-assets URLs remain unchanged", () => {
  const media = resolver("r2");
  const urls = [
    "https://example.com/assets/image.jpg",
    "//example.com/assets/image.jpg",
    "data:image/png;base64,AAAA",
    "blob:https://example.com/id",
    "data/campaigns.js",
    "images/example.jpg"
  ];

  urls.forEach(url => assert.equal(media.resolve(url), url));
});

test("srcset candidates preserve descriptors while resolving asset URLs", () => {
  const media = resolver("r2");
  assert.equal(
    media.resolveSrcset("assets/example-1.webp 1x, assets/example-2.webp 2x"),
    `${R2_BASE}/assets/example-1.webp 1x, ${R2_BASE}/assets/example-2.webp 2x`
  );
});

test("Vercel mode binds images and videos without fallback listeners or probes", () => {
  FakeImage.instances = [];
  const media = resolver("vercel", {}, { Image: FakeImage });
  const image = new FakeElement();
  const video = new FakeElement();

  media.setImage(image, "assets/example.jpg");
  media.setVideo(video, "assets/example.mp4");
  media.setPoster(video, "assets/poster.jpg");
  image.dispatchEvent(new Event("error"));
  video.dispatchEvent(new Event("error"));

  assert.equal(image.src, "assets/example.jpg");
  assert.equal(video.src, "assets/example.mp4");
  assert.equal(video.poster, "assets/poster.jpg");
  assert.equal(video.loadCalls, 0);
  assert.equal(FakeImage.instances.length, 0);
});

test("hybrid image fallback switches to Vercel exactly once", () => {
  const media = resolver("hybrid");
  const image = new FakeElement();

  media.setImage(image, "assets/example.jpg");
  assert.equal(image.src, `${R2_BASE}/assets/example.jpg`);

  image.dispatchEvent(new Event("error"));
  assert.equal(image.src, "assets/example.jpg");

  image.src = "sentinel";
  image.dispatchEvent(new Event("error"));
  assert.equal(image.src, "sentinel");
});

test("hybrid picture fallback switches src and every srcset together once", () => {
  const media = resolver("hybrid");
  const picture = new FakeElement();
  const image = new FakeElement();
  const source = new FakeElement();

  media.setPicture(picture, image, "assets/example.jpg", [{
    element: source,
    srcset: "assets/example.webp 1x, assets/example@2x.webp 2x"
  }]);
  image.dispatchEvent(new Event("error"));

  assert.equal(image.src, "assets/example.jpg");
  assert.equal(source.srcset, "assets/example.webp 1x, assets/example@2x.webp 2x");

  image.src = "sentinel";
  source.srcset = "sentinel";
  image.dispatchEvent(new Event("error"));
  assert.equal(image.src, "sentinel");
  assert.equal(source.srcset, "sentinel");
});

test("hybrid video fallback reloads once and preserves active playback intent", async () => {
  const media = resolver("hybrid");
  const video = new FakeElement();
  video.paused = false;

  media.setVideo(video, "assets/example.mp4");
  video.dispatchEvent(new Event("error"));
  await Promise.resolve();

  assert.equal(video.src, "assets/example.mp4");
  assert.equal(video.loadCalls, 1);
  assert.equal(video.playCalls, 1);

  video.dispatchEvent(new Event("error"));
  assert.equal(video.loadCalls, 1);
  assert.equal(video.playCalls, 1);
});

test("video source changes reload exactly once and identical URLs stay idempotent", () => {
  const media = resolver("r2");
  const video = new FakeElement();
  const source = new FakeElement();

  media.setVideoSource(video, source, "assets/example.mp4");
  assert.equal(source.src, `${R2_BASE}/assets/example.mp4`);
  assert.equal(video.loadCalls, 1);
  assert.equal(video.playCalls, 0);

  media.setVideoSource(video, source, "assets/example.mp4");
  assert.equal(video.loadCalls, 1);

  media.setVideoSource(video, source, "assets/different.mp4");
  assert.equal(source.src, `${R2_BASE}/assets/different.mp4`);
  assert.equal(video.loadCalls, 2);
  assert.equal(video.playCalls, 0);
});

test("Vercel source binding preserves original URLs and reloads only on change", () => {
  const media = resolver("vercel");
  const video = new FakeElement();
  const source = new FakeElement();

  media.setVideoSource(video, source, "assets/example.mp4");
  media.setVideoSource(video, source, "assets/example.mp4");

  assert.equal(source.src, "assets/example.mp4");
  assert.equal(video.loadCalls, 1);
  assert.equal(video.playCalls, 0);
});

test("hydrating multiple sources configures all of them before one video reload", () => {
  const media = resolver("r2");
  const video = new FakeElement();
  const sources = ["small.mp4", "large.mp4"].map(filename => {
    const source = new FakeElement();
    source.dataset = { mediaSrc: `assets/${filename}` };
    source.closest = () => video;
    return source;
  });
  video.dataset = {};

  const root = {
    querySelectorAll(selector) {
      return selector === "video source[data-media-src], video source[src]" ? sources : [];
    }
  };

  media.hydrate(root);

  assert.deepEqual(
    sources.map(source => source.src),
    [`${R2_BASE}/assets/small.mp4`, `${R2_BASE}/assets/large.mp4`]
  );
  assert.equal(video.loadCalls, 1);

  media.hydrate(root);
  assert.equal(video.loadCalls, 1);
});

test("hybrid source-element fallback reloads once per URL and never loops", () => {
  const media = resolver("hybrid");
  const video = new FakeElement();
  const source = new FakeElement();

  media.setVideoSource(video, source, "assets/example.mp4");
  assert.equal(source.src, `${R2_BASE}/assets/example.mp4`);
  assert.equal(video.loadCalls, 1);

  video.dispatchEvent(new Event("error"));
  video.dispatchEvent(new Event("error"));

  assert.equal(source.src, "assets/example.mp4");
  assert.equal(video.loadCalls, 2);
  assert.equal(video.playCalls, 0);
});

test("hybrid poster fallback uses one image probe and never loops", () => {
  FakeImage.instances = [];
  const media = resolver("hybrid", {}, { Image: FakeImage });
  const video = new FakeElement();

  media.setPoster(video, "assets/poster.jpg");
  assert.equal(video.poster, `${R2_BASE}/assets/poster.jpg`);
  assert.equal(FakeImage.instances.length, 1);

  const probe = FakeImage.instances[0];
  probe.dispatchEvent(new Event("error"));
  assert.equal(video.poster, "assets/poster.jpg");

  video.poster = "sentinel";
  probe.dispatchEvent(new Event("error"));
  assert.equal(video.poster, "sentinel");
});

test("strict R2 mode never falls back after image or video errors", () => {
  const media = resolver("r2");
  const image = new FakeElement();
  const video = new FakeElement();

  media.setImage(image, "assets/example.jpg");
  media.setVideo(video, "assets/example.mp4");
  image.dispatchEvent(new Event("error"));
  video.dispatchEvent(new Event("error"));

  assert.equal(image.src, `${R2_BASE}/assets/example.jpg`);
  assert.equal(video.src, `${R2_BASE}/assets/example.mp4`);
  assert.equal(video.loadCalls, 0);
});

test("clearing a reusable media element removes a pending fallback", () => {
  const media = resolver("hybrid");
  const video = new FakeElement();

  media.setVideo(video, "assets/example.mp4");
  media.clear(video);
  video.src = "";
  video.dispatchEvent(new Event("error"));

  assert.equal(video.src, "");
  assert.equal(video.loadCalls, 0);
});

test("every public page loads media configuration before the resolver and site renderers", () => {
  const publicPages = [
    "index.html",
    "campaigns.html",
    "films.html",
    "search.html",
    "clients.html",
    "brand-identity.html",
    "project.html",
    "events.html",
    "magazines-books.html",
    "about.html"
  ];

  publicPages.forEach(relativePath => {
    const html = read(relativePath);
    const configIndex = html.indexOf('<script src="config/media.js"></script>');
    const resolverIndex = html.indexOf('<script src="utils/mediaUrl.js"></script>');
    const siteScriptIndex = html.lastIndexOf("<script src=");

    assert.ok(configIndex > 0, `${relativePath}: media config`);
    assert.ok(resolverIndex > configIndex, `${relativePath}: resolver after config`);
    assert.ok(siteScriptIndex > resolverIndex, `${relativePath}: resolver before renderers`);
  });
});

test("all dynamic public media renderers delegate asset binding to RRSMedia", () => {
  const expectedCalls = {
    "utils/renderProject.js": ["RRSMedia.resolve(", "RRSMedia.resolveSrcset("],
    "campaigns-mobile-detail.js": ["RRSMedia.setPicture(", "RRSMedia.setVideo(", "RRSMedia.setPoster("],
    "utils/renderFilmsGrid.js": ["RRSMedia.setVideo("],
    "films.js": ["RRSMedia.setVideo(", "RRSMedia.clear("],
    "utils/renderPortfolio.js": ["RRSMedia.setImage(", "RRSMedia.setVideo("],
    "utils/renderPortfolioSearch.js": ["RRSMedia.setImage(", "RRSMedia.setVideo("],
    "magazines-books.js": ["RRSMedia.setVideo(", "RRSMedia.clear("],
    "search.js": ["RRSMedia.setVideo(", "RRSMedia.hydrate("],
    "script.js": ["RRSMedia.setImage(frame, character)"]
  };

  Object.entries(expectedCalls).forEach(([relativePath, calls]) => {
    const source = read(relativePath);
    calls.forEach(call => assert.ok(source.includes(call), `${relativePath}: ${call}`));
  });
});

test("media integration does not alter campaign, portfolio, or books datasets", () => {
  [
    "data/campaigns.js",
    "data/portfolio-projects.js",
    "data/magazines-books.js"
  ].forEach(relativePath => {
    const current = read(relativePath);
    const baseline = require("node:child_process").execFileSync(
      "git",
      ["show", `HEAD:${relativePath}`],
      { cwd: projectRoot, encoding: "utf8" }
    );
    assert.equal(current, baseline, relativePath);
  });
});
