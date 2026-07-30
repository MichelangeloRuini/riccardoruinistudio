const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createSectionConfig } = require("../cms/section-config");
const {
  MagazinesBooksError,
  createMagazinesBooksService,
  parseMagazinesBooksCollection,
  serializeMagazinesBooksCollection,
  validateRecord
} = require("../cms/magazines-books");

const projectRoot = path.resolve(__dirname, "..");
const realDataset = path.join(projectRoot, "data", "magazines-books.js");
const realAssets = path.join(projectRoot, "assets", "books");
const realTrash = path.join(projectRoot, "trash", "books");
const fixtureRoots = [];

function fileChecksum(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function snapshotDirectory(directory) {
  if (!fs.existsSync(directory)) return null;

  const snapshot = {};
  function visit(current, relative = "") {
    fs.readdirSync(current).sort().forEach(name => {
      const absolute = path.join(current, name);
      const childRelative = path.join(relative, name);
      const stats = fs.lstatSync(absolute);

      if (stats.isDirectory()) visit(absolute, childRelative);
      else snapshot[childRelative] = `${stats.size}:${fileChecksum(absolute)}`;
    });
  }
  visit(directory);
  return snapshot;
}

const repositoryBaseline = {
  dataset: fs.readFileSync(realDataset, "utf8"),
  assets: snapshotDirectory(realAssets),
  trash: snapshotDirectory(realTrash)
};

function createMp4(filename, marker = "fixture") {
  const content = Buffer.alloc(64);
  content.writeUInt32BE(24, 0);
  content.write("ftyp", 4, "ascii");
  content.write("mp42", 8, "ascii");
  content.write(marker.slice(0, 40), 16, "utf8");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
  return filename;
}

function createUpload(root, name = "upload.mp4", marker = "upload", overrides = {}) {
  const filename = createMp4(path.join(root, name), marker);
  return {
    path: filename,
    originalname: name,
    mimetype: "video/mp4",
    size: fs.statSync(filename).size,
    ...overrides
  };
}

function initialRecord(id, title = id.toUpperCase(), credits = []) {
  return {
    id,
    title,
    credits,
    video: `assets/books/${id}/video.mp4`
  };
}

function createFixture({
  records = [initialRecord("book-01")],
  failureStep = null
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rrs-books-crud-"));
  fixtureRoots.push(root);
  const config = createSectionConfig(root);
  const section = config["magazines-books"];

  fs.mkdirSync(path.dirname(section.dataFile), { recursive: true });
  fs.mkdirSync(section.assetRoot, { recursive: true });
  records.forEach(record => {
    createMp4(path.join(section.assetRoot, record.id, "video.mp4"), record.id);
  });
  fs.writeFileSync(
    section.dataFile,
    serializeMagazinesBooksCollection(section, records),
    "utf8"
  );

  const service = createMagazinesBooksService({
    sectionConfig: config,
    failureInjector(step) {
      if (step === failureStep) throw new Error(`Injected failure: ${step}`);
    }
  });

  return { root, config, section, service };
}

function readRecords(fixture) {
  return parseMagazinesBooksCollection(
    fs.readFileSync(fixture.section.dataFile, "utf8"),
    fixture.section.collectionName
  );
}

function assertNoTransactionResidue(fixture) {
  const assetEntries = fs.readdirSync(fixture.section.assetRoot);
  assert.equal(
    assetEntries.some(name => name.startsWith(".books-")),
    false,
    "Temporary asset directories must be removed."
  );
  const dataEntries = fs.readdirSync(path.dirname(fixture.section.dataFile));
  assert.equal(
    dataEntries.some(name => name.includes(".books-") && name.endsWith(".tmp")),
    false,
    "Temporary data files must be removed."
  );
}

test.afterEach(() => {
  while (fixtureRoots.length) {
    const root = fixtureRoots.pop();
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  }
});

test.after(() => {
  assert.equal(fs.readFileSync(realDataset, "utf8"), repositoryBaseline.dataset);
  assert.deepEqual(snapshotDirectory(realAssets), repositoryBaseline.assets);
  assert.deepEqual(snapshotDirectory(realTrash), repositoryBaseline.trash);
});

test("GET service returns records in dataset order", () => {
  const fixture = createFixture({
    records: [initialRecord("book-02"), initialRecord("book-01")]
  });

  assert.deepEqual(
    fixture.service.listItems().map(item => item.id),
    ["book-02", "book-01"]
  );
});

test("GET converts legacy label and value credits to single strings", () => {
  const fixture = createFixture({
    records: [
      initialRecord("book-01", "Legacy", [
        { label: "Photography", value: "Mert & Marcus" },
        { label: "", value: "2011-2012" },
        { label: "Creative Direction", value: "" },
        { label: " ", value: " " },
        " ",
        "Interview by Michelangelo Ruini"
      ])
    ]
  });

  assert.deepEqual(fixture.service.listItems()[0].credits, [
    "Photography: Mert & Marcus",
    "2011-2012",
    "Creative Direction",
    "Interview by Michelangelo Ruini"
  ]);
});

test("CREATE generates a free ID, writes one asset, and honors position", async () => {
  const fixture = createFixture();
  const upload = createUpload(fixture.root);
  const item = await fixture.service.createItem({
    title: "New Book",
    credits: [{ label: "Creative Direction", value: "Studio" }],
    position: "top",
    files: [upload]
  });
  const records = readRecords(fixture);

  assert.equal(item.id, "book-02");
  assert.equal(records[0].id, "book-02");
  assert.deepEqual(records[0].credits, ["Creative Direction: Studio"]);
  assert.equal(
    fs.existsSync(path.join(fixture.section.assetRoot, "book-02", "video.mp4")),
    true
  );
  assertNoTransactionResidue(fixture);
});

test("CREATE rejects missing, invalid, or multiple videos without mutation", async () => {
  const fixture = createFixture();
  const originalData = fs.readFileSync(fixture.section.dataFile, "utf8");
  const validUpload = createUpload(fixture.root, "valid.mp4");
  const invalidUpload = createUpload(fixture.root, "invalid.txt", "invalid", {
    mimetype: "text/plain"
  });

  await assert.rejects(
    fixture.service.createItem({ title: "Missing", credits: [], files: [] }),
    error => error instanceof MagazinesBooksError && error.status === 400
  );
  await assert.rejects(
    fixture.service.createItem({ title: "Invalid", credits: [], files: [invalidUpload] }),
    /Only an MP4/
  );
  await assert.rejects(
    fixture.service.createItem({
      title: "Multiple",
      credits: [],
      files: [validUpload, validUpload]
    }),
    /Exactly one/
  );

  assert.equal(fs.readFileSync(fixture.section.dataFile, "utf8"), originalData);
  assert.equal(fs.existsSync(path.join(fixture.section.assetRoot, "book-02")), false);
});

test("CREATE rolls back installed assets when data commit fails", async () => {
  const fixture = createFixture({ failureStep: "create:after-assets-installed" });
  const originalData = fs.readFileSync(fixture.section.dataFile, "utf8");
  const upload = createUpload(fixture.root);

  await assert.rejects(
    fixture.service.createItem({ title: "Rollback", credits: [], files: [upload] }),
    /Injected failure/
  );

  assert.equal(fs.readFileSync(fixture.section.dataFile, "utf8"), originalData);
  assert.equal(fs.existsSync(path.join(fixture.section.assetRoot, "book-02")), false);
  assertNoTransactionResidue(fixture);
});

test("EDIT changes only title and credits and validates missing records", async () => {
  const fixture = createFixture();
  const before = readRecords(fixture)[0];
  const item = await fixture.service.editItem({
    id: "book-01",
    title: "Updated",
    credits: [
      "  2011-2012  ",
      "",
      "Creative Direction: Riccardo Ruini",
      { label: "", value: "Interview by Michelangelo Ruini" },
      { label: "", value: "" }
    ]
  });

  assert.equal(item.title, "Updated");
  assert.deepEqual(item.credits, [
    "2011-2012",
    "Creative Direction: Riccardo Ruini",
    "Interview by Michelangelo Ruini"
  ]);
  assert.deepEqual(readRecords(fixture)[0].credits, item.credits);
  assert.equal(item.id, before.id);
  assert.equal(item.video, before.video);

  await assert.rejects(
    fixture.service.editItem({ id: "book-01", title: "", credits: [] }),
    error => error.status === 400
  );
  await assert.rejects(
    fixture.service.editItem({ id: "book-99", title: "Missing", credits: [] }),
    error => error.status === 404
  );
});

test("REPLACE swaps video atomically and preserves dataset path", async () => {
  const fixture = createFixture();
  const videoPath = path.join(fixture.section.assetRoot, "book-01", "video.mp4");
  const oldChecksum = fileChecksum(videoPath);
  const upload = createUpload(fixture.root, "replacement.mp4", "replacement");
  const before = readRecords(fixture)[0];

  const item = await fixture.service.replaceVideo({ id: "book-01", files: [upload] });

  assert.equal(item.video, before.video);
  assert.notEqual(fileChecksum(videoPath), oldChecksum);
  assert.equal(fileChecksum(videoPath), fileChecksum(upload.path));
  assertNoTransactionResidue(fixture);
});

test("REPLACE restores the original video after an injected failure", async () => {
  const fixture = createFixture({ failureStep: "replace:after-new-installed" });
  const videoPath = path.join(fixture.section.assetRoot, "book-01", "video.mp4");
  const originalChecksum = fileChecksum(videoPath);
  const upload = createUpload(fixture.root, "replacement.mp4", "replacement");

  await assert.rejects(
    fixture.service.replaceVideo({ id: "book-01", files: [upload] }),
    /Injected failure/
  );

  assert.equal(fileChecksum(videoPath), originalChecksum);
  assertNoTransactionResidue(fixture);
});

test("DELETE moves video and metadata to trash and removes the record", async () => {
  const fixture = createFixture({
    records: [initialRecord("book-01"), initialRecord("book-02")]
  });
  const result = await fixture.service.deleteItem({ id: "book-01" });
  const backupName = path.basename(result.backupPath);
  const backup = path.join(fixture.section.trashRoot, backupName);
  const metadata = JSON.parse(fs.readFileSync(path.join(backup, "metadata.json"), "utf8"));

  assert.deepEqual(readRecords(fixture).map(item => item.id), ["book-02"]);
  assert.equal(fs.existsSync(path.join(backup, "video.mp4")), true);
  assert.equal(metadata.originalIndex, 0);
  assert.equal(metadata.originalRecord.id, "book-01");
  assert.equal(fs.existsSync(path.join(fixture.section.assetRoot, "book-01")), false);
  await assert.rejects(
    fixture.service.deleteItem({ id: "book-99" }),
    error => error.status === 404
  );
});

test("DELETE rolls back assets and data after an injected failure", async () => {
  const fixture = createFixture({ failureStep: "delete:after-assets-moved" });
  const originalData = fs.readFileSync(fixture.section.dataFile, "utf8");
  const videoPath = path.join(fixture.section.assetRoot, "book-01", "video.mp4");
  const originalChecksum = fileChecksum(videoPath);

  await assert.rejects(
    fixture.service.deleteItem({ id: "book-01" }),
    /Injected failure/
  );

  assert.equal(fs.readFileSync(fixture.section.dataFile, "utf8"), originalData);
  assert.equal(fileChecksum(videoPath), originalChecksum);
  assert.equal(fs.existsSync(fixture.section.trashRoot), false);
});

test("REORDER accepts only a complete permutation and never moves assets", async () => {
  const fixture = createFixture({
    records: [
      initialRecord("book-01"),
      initialRecord("book-02"),
      initialRecord("book-03")
    ]
  });
  const assetSnapshot = snapshotDirectory(fixture.section.assetRoot);

  await fixture.service.reorderItems({
    orderedIds: ["book-03", "book-01", "book-02"]
  });
  assert.deepEqual(
    readRecords(fixture).map(item => item.id),
    ["book-03", "book-01", "book-02"]
  );
  assert.deepEqual(snapshotDirectory(fixture.section.assetRoot), assetSnapshot);

  const validData = fs.readFileSync(fixture.section.dataFile, "utf8");
  const invalidOrders = [
    ["book-03", "book-01"],
    ["book-03", "book-03", "book-02"],
    ["book-03", "book-01", "book-99"],
    ["book-03", "book-01", "book-02", "book-04"]
  ];

  for (const orderedIds of invalidOrders) {
    await assert.rejects(
      fixture.service.reorderItems({ orderedIds }),
      error => error.status === 400
    );
    assert.equal(fs.readFileSync(fixture.section.dataFile, "utf8"), validData);
  }
});

test("DUPLICATE deep-clones data, copies video, and inserts after source", async () => {
  const credits = ["Creative Direction: Studio"];
  const fixture = createFixture({
    records: [initialRecord("book-01", "Original", credits), initialRecord("book-02")]
  });
  const sourceVideo = path.join(fixture.section.assetRoot, "book-01", "video.mp4");
  const duplicate = await fixture.service.duplicateItem({ id: "book-01" });
  const records = readRecords(fixture);
  const duplicateVideo = path.join(fixture.section.assetRoot, duplicate.id, "video.mp4");

  assert.equal(duplicate.id, "book-03");
  assert.equal(duplicate.title, "Original COPY");
  assert.deepEqual(records.map(item => item.id), ["book-01", "book-03", "book-02"]);
  assert.deepEqual(duplicate.credits, credits);
  assert.notEqual(duplicate.credits, records[0].credits);
  assert.equal(fileChecksum(duplicateVideo), fileChecksum(sourceVideo));
  assertNoTransactionResidue(fixture);
});

test("DUPLICATE rolls back copied assets and dataset on failure", async () => {
  const fixture = createFixture({ failureStep: "duplicate:after-assets-installed" });
  const originalData = fs.readFileSync(fixture.section.dataFile, "utf8");

  await assert.rejects(
    fixture.service.duplicateItem({ id: "book-01" }),
    /Injected failure/
  );

  assert.equal(fs.readFileSync(fixture.section.dataFile, "utf8"), originalData);
  assert.equal(fs.existsSync(path.join(fixture.section.assetRoot, "book-02")), false);
  assertNoTransactionResidue(fixture);
});

test("security validation rejects traversal, malformed IDs, and external video paths", async () => {
  const fixture = createFixture();

  await assert.rejects(
    fixture.service.editItem({ id: "../escape", title: "Escape", credits: [] }),
    error => error.status === 400
  );
  await assert.rejects(
    fixture.service.deleteItem({ id: "book-one" }),
    error => error.status === 400
  );
  assert.throws(
    () => validateRecord({
      id: "book-09",
      title: "External",
      credits: [],
      video: "../outside/video.mp4"
    }, fixture.section),
    /Video path/
  );
  assert.equal(fs.existsSync(path.join(fixture.root, "escape")), false);
});
