const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const sharp = require("sharp");

const { createSectionConfig } = require("../cms/section-config");
const {
  createPortfolioService,
  parsePortfolioCollection,
  serializePortfolioCollection
} = require("../cms/portfolio-projects");

function createUnrelatedRecord() {
  return {
    id: "unrelated-branding",
    section: "branding",
    client: "Unrelated Client",
    title: "Unrelated Project",
    path: "assets/branding/unrelated-branding/",
    cover: "01.webp",
    media: ["01.jpg"]
  };
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rrs-portfolio-test-"));
  const config = createSectionConfig(root);
  const portfolioFile = config["brand-identity"].dataFile;
  const campaignFile = config.campaigns.dataFile;
  const unrelatedRecord = createUnrelatedRecord();

  fs.mkdirSync(path.dirname(portfolioFile), { recursive: true });
  fs.mkdirSync(config["brand-identity"].assetRoot, { recursive: true });
  fs.mkdirSync(config["brand-identity"].trashRoot, { recursive: true });
  fs.writeFileSync(
    portfolioFile,
    serializePortfolioCollection(config["brand-identity"], [unrelatedRecord]),
    "utf8"
  );
  fs.writeFileSync(campaignFile, "const campaigns = [{ id: 'must-remain-untouched' }];\n", "utf8");

  return {
    root,
    config,
    portfolioFile,
    campaignFile,
    campaignSource: fs.readFileSync(campaignFile, "utf8"),
    unrelatedRecord
  };
}

async function createImageUpload(root, name = "source-image.png") {
  const filePath = path.join(root, name);

  await sharp({
    create: {
      width: 24,
      height: 32,
      channels: 3,
      background: { r: 120, g: 80, b: 40 }
    }
  }).png().toFile(filePath);

  return {
    path: filePath,
    originalname: name,
    mimetype: "image/png",
    size: fs.statSync(filePath).size
  };
}

function createVideoUpload(root, name = "source-video.mp4") {
  const filePath = path.join(root, name);
  const content = Buffer.alloc(16);
  content.write("ftyp", 4, "ascii");
  fs.writeFileSync(filePath, content);

  return {
    path: filePath,
    originalname: name,
    mimetype: "video/mp4",
    size: content.length
  };
}

function readRecords(fixture) {
  return parsePortfolioCollection(
    fs.readFileSync(fixture.portfolioFile, "utf8"),
    fixture.config["brand-identity"].collectionName
  );
}

async function createTestProject(fixture, service = createPortfolioService({
  sectionConfig: fixture.config
})) {
  const video = createVideoUpload(fixture.root);
  const image = await createImageUpload(fixture.root);

  return service.createProject({
    sectionKey: "brand-identity",
    id: "test-project",
    client: "Test Client",
    title: "Test Project",
    position: "top",
    coverIndex: 1,
    files: [video, image]
  });
}

test("create preserves mixed media order and unrelated Portfolio records", async () => {
  const fixture = createFixture();
  const service = createPortfolioService({ sectionConfig: fixture.config });
  const project = await createTestProject(fixture, service);
  const records = readRecords(fixture);
  const savedProject = records.find(record =>
    record.section === "brand-identity" && record.id === "test-project"
  );
  const unrelated = records.find(record => record.section === "branding");

  assert.deepEqual(project.media, ["video-01.mp4", "01.jpg"]);
  assert.equal(project.cover, "01.webp");
  assert.equal(project.path, "assets/identities/test-project/");
  assert.deepEqual(savedProject, {
    id: "test-project",
    section: "brand-identity",
    client: "Test Client",
    title: "Test Project",
    path: "assets/identities/test-project/",
    cover: "01.webp",
    media: ["video-01.mp4", "01.jpg"]
  });
  assert.deepEqual(unrelated, fixture.unrelatedRecord);
  assert.equal(fs.readFileSync(fixture.campaignFile, "utf8"), fixture.campaignSource);
  assert.equal(fs.existsSync(path.join(fixture.root, "assets/identities/test-project/01.jpg")), true);
  assert.equal(fs.existsSync(path.join(fixture.root, "assets/identities/test-project/01.webp")), true);
  assert.equal(fs.existsSync(path.join(fixture.root, "assets/identities/test-project/01-thumb.webp")), true);
});

test("create accepts and stores an empty Portfolio title", async () => {
  const fixture = createFixture();
  const service = createPortfolioService({ sectionConfig: fixture.config });
  const image = await createImageUpload(fixture.root, "empty-title-image.png");

  const project = await service.createProject({
    sectionKey: "brand-identity",
    id: "fendi",
    client: "Fendi",
    title: "",
    coverIndex: 0,
    files: [image]
  });
  const savedProject = readRecords(fixture).find(record => record.id === "fendi");

  assert.equal(project.client, "Fendi");
  assert.equal(project.title, "");
  assert.equal(savedProject.title, "");
});

test("metadata edit changes only client, title, and selected cover", async () => {
  const fixture = createFixture();
  const service = createPortfolioService({ sectionConfig: fixture.config });
  await createTestProject(fixture, service);
  const before = readRecords(fixture);

  const project = await service.editProject({
    sectionKey: "brand-identity",
    id: "test-project",
    client: "Updated Client",
    title: "Updated Title",
    cover: "01.jpg"
  });
  const after = readRecords(fixture);
  const originalProject = before.find(record => record.section === "brand-identity");
  const updatedProject = after.find(record => record.section === "brand-identity");
  const unrelatedBefore = before.find(record => record.section === "branding");
  const unrelatedAfter = after.find(record => record.section === "branding");

  assert.equal(project.client, "Updated Client");
  assert.equal(project.title, "Updated Title");
  assert.equal(project.cover, "01.webp");
  assert.deepEqual(unrelatedAfter, unrelatedBefore);
  assert.deepEqual(updatedProject.media, originalProject.media);
  assert.equal(updatedProject.id, originalProject.id);
  assert.equal(updatedProject.path, originalProject.path);
  assert.equal(fs.readFileSync(fixture.campaignFile, "utf8"), fixture.campaignSource);
});

test("metadata edit can clear an existing Portfolio title", async () => {
  const fixture = createFixture();
  const service = createPortfolioService({ sectionConfig: fixture.config });
  await createTestProject(fixture, service);

  const project = await service.editProject({
    sectionKey: "brand-identity",
    id: "test-project",
    client: "Test Client",
    title: "",
    cover: "01.jpg"
  });
  const savedProject = readRecords(fixture).find(record => record.id === "test-project");

  assert.equal(project.title, "");
  assert.equal(savedProject.title, "");
});

test("Portfolio create still rejects an empty client", async () => {
  const fixture = createFixture();
  const service = createPortfolioService({ sectionConfig: fixture.config });
  const image = await createImageUpload(fixture.root, "empty-client-image.png");

  await assert.rejects(
    service.createProject({
      sectionKey: "brand-identity",
      id: "missing-client",
      client: "",
      title: "Optional Title",
      coverIndex: 0,
      files: [image]
    }),
    /Client is required/
  );

  assert.deepEqual(readRecords(fixture), [fixture.unrelatedRecord]);
});

test("Portfolio metadata edit still rejects an empty client", async () => {
  const fixture = createFixture();
  const service = createPortfolioService({ sectionConfig: fixture.config });
  await createTestProject(fixture, service);
  const originalData = fs.readFileSync(fixture.portfolioFile, "utf8");

  await assert.rejects(
    service.editProject({
      sectionKey: "brand-identity",
      id: "test-project",
      client: "   ",
      title: "",
      cover: "01.jpg"
    }),
    /Client is required/
  );

  assert.equal(fs.readFileSync(fixture.portfolioFile, "utf8"), originalData);
});

test("Portfolio public labels omit the separator when title is empty", () => {
  const rendererSource = fs.readFileSync(
    path.resolve(__dirname, "../utils/renderPortfolio.js"),
    "utf8"
  );
  const context = { URLSearchParams };

  vm.createContext(context);
  vm.runInContext(
    `${rendererSource}\nthis.renderLabel = getPortfolioProjectLabel;`,
    context
  );

  assert.equal(context.renderLabel({ client: "Fendi", title: "" }), "Fendi");
  assert.equal(context.renderLabel({ client: "Fendi", title: "   " }), "Fendi");
  assert.equal(
    context.renderLabel({ client: "Fendi", title: "Visual Identity" }),
    "Fendi — Visual Identity"
  );
});

test("cover must be an existing image media item and cannot be video", async () => {
  const fixture = createFixture();
  const service = createPortfolioService({ sectionConfig: fixture.config });
  await createTestProject(fixture, service);

  await assert.rejects(
    service.editProject({
      sectionKey: "brand-identity",
      id: "test-project",
      client: "Test Client",
      title: "Test Project",
      cover: "missing.jpg"
    }),
    /existing image media item/
  );

  await assert.rejects(
    service.editProject({
      sectionKey: "brand-identity",
      id: "test-project",
      client: "Test Client",
      title: "Test Project",
      cover: "video-01.mp4"
    }),
    /existing image media item/
  );
});

test("safe delete moves assets and metadata to the configured trash root", async () => {
  const fixture = createFixture();
  const service = createPortfolioService({ sectionConfig: fixture.config });
  await createTestProject(fixture, service);

  await service.deleteProject({ sectionKey: "brand-identity", id: "test-project" });

  const records = readRecords(fixture);
  const trashEntries = fs.readdirSync(fixture.config["brand-identity"].trashRoot);

  assert.deepEqual(records, [fixture.unrelatedRecord]);
  assert.equal(fs.existsSync(path.join(fixture.root, "assets/identities/test-project")), false);
  assert.equal(trashEntries.length, 1);
  assert.match(trashEntries[0], /^test-project-/);

  const backup = path.join(fixture.config["brand-identity"].trashRoot, trashEntries[0]);
  const metadata = JSON.parse(fs.readFileSync(path.join(backup, "metadata.json"), "utf8"));
  assert.equal(metadata.operation, "delete-portfolio-project");
  assert.equal(metadata.section, "brand-identity");
  assert.equal(metadata.projectId, "test-project");
  assert.equal(fs.existsSync(path.join(backup, "01.jpg")), true);
  assert.equal(fs.readFileSync(fixture.campaignFile, "utf8"), fixture.campaignSource);
});

test("create rollback restores original data and removes installed assets", async () => {
  const fixture = createFixture();
  const originalData = fs.readFileSync(fixture.portfolioFile, "utf8");
  const service = createPortfolioService({
    sectionConfig: fixture.config,
    failureInjector(step) {
      if (step === "create:after-assets-installed") throw new Error("Injected create failure");
    }
  });

  await assert.rejects(createTestProject(fixture, service), /Injected create failure/);

  assert.equal(fs.readFileSync(fixture.portfolioFile, "utf8"), originalData);
  assert.equal(fs.existsSync(path.join(fixture.root, "assets/identities/test-project")), false);
  assert.deepEqual(
    fs.readdirSync(fixture.config["brand-identity"].assetRoot),
    []
  );
  assert.equal(fs.readFileSync(fixture.campaignFile, "utf8"), fixture.campaignSource);
});

test("delete rollback restores original data and project directory", async () => {
  const fixture = createFixture();
  const normalService = createPortfolioService({ sectionConfig: fixture.config });
  await createTestProject(fixture, normalService);
  const originalData = fs.readFileSync(fixture.portfolioFile, "utf8");
  const failingService = createPortfolioService({
    sectionConfig: fixture.config,
    failureInjector(step) {
      if (step === "delete:after-assets-moved") throw new Error("Injected delete failure");
    }
  });

  await assert.rejects(
    failingService.deleteProject({ sectionKey: "brand-identity", id: "test-project" }),
    /Injected delete failure/
  );

  assert.equal(fs.readFileSync(fixture.portfolioFile, "utf8"), originalData);
  assert.equal(fs.existsSync(path.join(fixture.root, "assets/identities/test-project/01.jpg")), true);
  assert.deepEqual(fs.readdirSync(fixture.config["brand-identity"].trashRoot), []);
  assert.equal(fs.readFileSync(fixture.campaignFile, "utf8"), fixture.campaignSource);
});

test("disabled sections and traversal IDs are rejected before filesystem mutation", async () => {
  const fixture = createFixture();
  const service = createPortfolioService({ sectionConfig: fixture.config });
  const image = await createImageUpload(fixture.root, "guard-image.png");

  await assert.rejects(
    service.createProject({
      sectionKey: "branding",
      id: "disabled-project",
      client: "Client",
      title: "Title",
      coverIndex: 0,
      files: [image]
    }),
    /not enabled/
  );

  await assert.rejects(
    service.createProject({
      sectionKey: "brand-identity",
      id: "../escape",
      client: "Client",
      title: "Title",
      coverIndex: 0,
      files: [image]
    }),
    /strict lowercase slug/
  );

  assert.equal(fs.readFileSync(fixture.campaignFile, "utf8"), fixture.campaignSource);
  assert.deepEqual(readRecords(fixture), [fixture.unrelatedRecord]);
});
