const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createSectionConfig,
  getSectionConfig,
  resolveFixedRootChild,
  resolveProjectDirectory,
  validateProjectSlug
} = require("../cms/section-config");

test("section configuration is deeply frozen and contains only fixed paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rrs-section-config-"));
  const config = createSectionConfig(root);

  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config["brand-identity"]), true);
  assert.equal(config["brand-identity"].assetRoot, path.resolve(root, "assets/identities"));
  assert.equal(config["brand-identity"].trashRoot, path.resolve(root, "trash/identities"));
  assert.equal(config["brand-identity"].cmsEnabled, true);
  assert.equal(config["magazine-books"].cmsEnabled, false);
  assert.equal(config.branding.cmsEnabled, false);
});

test("unknown and inherited section keys are rejected", () => {
  const config = createSectionConfig("/tmp/example-root");

  assert.throws(() => getSectionConfig("unknown", { config }), /Unknown section/);
  assert.throws(() => getSectionConfig("toString", { config }), /Unknown section/);
});

test("disabled sections are rejected", () => {
  const config = createSectionConfig("/tmp/example-root");

  assert.throws(
    () => getSectionConfig("branding", { config, expectedDataKind: "portfolio" }),
    /not enabled/
  );
});

test("strict project slugs reject traversal and malformed values", () => {
  assert.equal(validateProjectSlug("valid-project-01"), "valid-project-01");
  assert.throws(() => validateProjectSlug("../escape"), /strict lowercase slug/);
  assert.throws(() => validateProjectSlug("Uppercase"), /strict lowercase slug/);
  assert.throws(() => validateProjectSlug("two--hyphens"), /strict lowercase slug/);
});

test("fixed-root resolution cannot escape configured roots", () => {
  const root = path.resolve("/tmp/rrs-assets");

  assert.equal(resolveFixedRootChild(root, "project-one"), path.join(root, "project-one"));
  assert.throws(() => resolveFixedRootChild(root, "../escape"), /outside/);
  assert.throws(() => resolveFixedRootChild(root, "nested/project"), /outside/);
});

test("project directories are derived only from configured section roots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rrs-project-path-"));
  const config = createSectionConfig(root);
  const section = getSectionConfig("brand-identity", {
    config,
    expectedDataKind: "portfolio"
  });

  assert.equal(
    resolveProjectDirectory(section, "safe-project"),
    path.resolve(root, "assets/identities/safe-project")
  );
  assert.throws(() => resolveProjectDirectory(section, "../../campaigns"), /strict lowercase slug/);
});
