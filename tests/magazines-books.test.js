const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const datasetFile = path.join(projectRoot, "data", "magazines-books.js");
const booksRoot = path.join(projectRoot, "assets", "books");
const expectedIds = Array.from(
  { length: 8 },
  (_, index) => `book-${String(index + 1).padStart(2, "0")}`
);

function loadDataset() {
  assert.equal(fs.existsSync(datasetFile), true, "The Magazines & Books dataset must exist.");

  const source = fs.readFileSync(datasetFile, "utf8");
  const context = {};

  vm.createContext(context);
  vm.runInContext(
    `${source}\nthis.magazinesBooksValue = magazinesBooks;`,
    context,
    { filename: datasetFile }
  );

  assert.match(source, /\bconst\s+magazinesBooks\s*=/);
  assert.equal(Array.isArray(context.magazinesBooksValue), true);

  return context.magazinesBooksValue;
}

test("Magazines & Books dataset and video assets are valid", () => {
  const records = loadDataset();
  const ids = Array.from(records, record => record.id);
  const videos = Array.from(records, record => record.video);

  assert.equal(records.length, 8);
  assert.deepEqual(ids, expectedIds);
  assert.equal(new Set(ids).size, records.length, "Project IDs must be unique.");
  assert.equal(new Set(videos).size, records.length, "Video paths must be unique.");

  records.forEach((record, index) => {
    assert.deepEqual(
      Object.keys(record),
      ["id", "title", "credits", "video"],
      `${record.id} must contain only the required fields.`
    );
    assert.equal(typeof record.title, "string");
    assert.notEqual(record.title.trim(), "");
    assert.equal(Array.isArray(record.credits), true);
    assert.equal(typeof record.video, "string");
    assert.match(record.video, /^assets\/books\/book-\d{2}\/video\.mp4$/);
    assert.equal(record.video, `assets/books/${expectedIds[index]}/video.mp4`);

    const videoPath = path.resolve(projectRoot, record.video);
    const relativeToBooks = path.relative(booksRoot, videoPath);

    assert.equal(path.isAbsolute(relativeToBooks), false);
    assert.equal(
      relativeToBooks === ".." || relativeToBooks.startsWith(`..${path.sep}`),
      false,
      `${record.video} must remain inside assets/books/.`
    );
    assert.equal(fs.existsSync(videoPath), true, `${record.video} must exist.`);

    const stats = fs.statSync(videoPath);
    assert.equal(stats.isFile(), true);
    assert.ok(stats.size > 0, `${record.video} must not be empty.`);

    const descriptor = fs.openSync(videoPath, "r");
    const header = Buffer.alloc(Math.min(4096, stats.size));

    try {
      fs.readSync(descriptor, header, 0, header.length, 0);
    } finally {
      fs.closeSync(descriptor);
    }

    assert.ok(
      header.indexOf(Buffer.from("ftyp")) >= 4,
      `${record.video} must contain an MP4 ftyp box near the beginning.`
    );

    const projectDirectory = path.dirname(videoPath);
    assert.deepEqual(
      fs.readdirSync(projectDirectory).sort(),
      ["video.mp4"],
      `${record.id} must contain only video.mp4.`
    );
  });

  expectedIds.forEach((id, index) => {
    const legacyFilename = `${String(index + 1).padStart(2, "0")}.mp4`;
    const legacyPath = path.join(booksRoot, legacyFilename);

    assert.equal(
      fs.existsSync(legacyPath),
      false,
      `Legacy video ${legacyFilename} must not exist.`
    );
    assert.equal(
      videos.includes(`assets/books/${legacyFilename}`),
      false,
      `Dataset must not reference legacy video ${legacyFilename}.`
    );
    assert.equal(
      fs.existsSync(path.join(booksRoot, id, "video.mp4")),
      true,
      `${id}/video.mp4 must exist.`
    );
  });
});
