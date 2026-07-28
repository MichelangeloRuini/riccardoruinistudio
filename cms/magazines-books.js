const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const {
  SECTION_CONFIG,
  getSectionConfig,
  resolveFixedRootChild
} = require("./section-config");

const BOOK_ID_PATTERN = /^book-\d{2,}$/;
const MAX_BOOK_VIDEO_SIZE = 250 * 1024 * 1024;
const MAX_CREDITS = 50;

class MagazinesBooksError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "MagazinesBooksError";
    this.status = status;
  }
}

function booksError(message, status = 400) {
  return new MagazinesBooksError(message, status);
}

function validateBookId(value) {
  const id = typeof value === "string" ? value.trim() : "";

  if (!BOOK_ID_PATTERN.test(id)) {
    throw booksError("Book ID must use the book-00 format.");
  }

  return id;
}

function validateTitle(value) {
  const title = typeof value === "string" ? value.trim() : "";

  if (!title) throw booksError("Title is required.");
  if (title.length > 300) throw booksError("Title is too long.");
  return title;
}

function validateCredits(value) {
  if (!Array.isArray(value)) throw booksError("Credits must be an array.");
  if (value.length > MAX_CREDITS) throw booksError(`A maximum of ${MAX_CREDITS} credits is allowed.`);

  return value.map((credit, index) => {
    if (!credit || typeof credit !== "object" || Array.isArray(credit)) {
      throw booksError(`Credit ${index + 1} is invalid.`);
    }

    const label = typeof credit.label === "string" ? credit.label.trim() : "";
    const creditValue = typeof credit.value === "string" ? credit.value.trim() : "";

    if (!label || !creditValue) {
      throw booksError(`Credit ${index + 1} requires label and value.`);
    }

    if (label.length > 150 || creditValue.length > 2000) {
      throw booksError(`Credit ${index + 1} is too long.`);
    }

    return { label, value: creditValue };
  });
}

function parseCreditsInput(value) {
  if (Array.isArray(value)) return validateCredits(value);

  if (typeof value === "string") {
    if (!value.trim()) return [];

    try {
      return validateCredits(JSON.parse(value));
    } catch (error) {
      if (error instanceof MagazinesBooksError) throw error;
      throw booksError("Credits must contain valid JSON.");
    }
  }

  throw booksError("Credits must be an array.");
}

function parseMagazinesBooksCollection(source, collectionName = "magazinesBooks") {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(collectionName)) {
    throw new Error("Invalid configured collection name.");
  }

  const collection = new Function(`
    ${source}
    return ${collectionName};
  `)();

  if (!Array.isArray(collection)) {
    throw new Error("Magazines & Books data file does not contain an array.");
  }

  return collection;
}

function serializeMagazinesBooksCollection(section, records) {
  return `const ${section.collectionName} = ${JSON.stringify(records, null, 2)};\n`;
}

function validateRecord(record, section) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw booksError("Magazines & Books record is invalid.");
  }

  const id = validateBookId(record.id);
  const title = validateTitle(record.title);
  const credits = validateCredits(record.credits);
  const expectedVideo = `${section.publicAssetPrefix}${id}/video.mp4`;

  if (record.video !== expectedVideo) {
    throw booksError("Video path does not match the configured project directory.");
  }

  return { id, title, credits, video: expectedVideo };
}

function validateCollection(records, section) {
  if (!Array.isArray(records)) throw booksError("Magazines & Books collection is invalid.");

  const validated = records.map(record => validateRecord(record, section));
  const ids = validated.map(record => record.id);
  const videos = validated.map(record => record.video);

  if (new Set(ids).size !== ids.length) throw booksError("Book IDs must be unique.");
  if (new Set(videos).size !== videos.length) throw booksError("Book video paths must be unique.");
  return validated;
}

function readCollection(section) {
  const source = fs.readFileSync(section.dataFile, "utf8");
  const records = parseMagazinesBooksCollection(source, section.collectionName);
  return { source, records: validateCollection(records, section) };
}

function stageCollection(section, records, transactionId) {
  const validated = validateCollection(records, section);
  const tempFile = `${section.dataFile}.books-${transactionId}.tmp`;

  fs.writeFileSync(
    tempFile,
    serializeMagazinesBooksCollection(section, validated),
    { encoding: "utf8", flag: "wx" }
  );

  const stagedRecords = validateCollection(
    parseMagazinesBooksCollection(fs.readFileSync(tempFile, "utf8"), section.collectionName),
    section
  );

  if (JSON.stringify(stagedRecords) !== JSON.stringify(validated)) {
    fs.unlinkSync(tempFile);
    throw new Error("Temporary Magazines & Books data validation failed.");
  }

  return tempFile;
}

function resolveProjectDirectory(section, id) {
  return resolveFixedRootChild(section.assetRoot, validateBookId(id));
}

function assertSafeDirectory(directory, label) {
  if (!fs.existsSync(directory)) throw booksError(`${label} does not exist.`, 404);

  const stats = fs.lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw booksError(`${label} is not a safe directory.`);
  }
}

function assertProjectAssets(section, record) {
  const directory = resolveProjectDirectory(section, record.id);
  assertSafeDirectory(directory, "Book asset directory");

  const entries = fs.readdirSync(directory).sort();
  if (entries.length !== 1 || entries[0] !== "video.mp4") {
    throw booksError("Book asset directory must contain only video.mp4.");
  }

  const videoPath = resolveFixedRootChild(directory, "video.mp4");
  if (!fs.lstatSync(videoPath).isFile()) throw booksError("Book video is not a regular file.");
  validateMp4Path(videoPath);
  return { directory, videoPath };
}

function getUploadedVideoType(file) {
  const extension = path.extname((file && file.originalname) || "").toLowerCase();
  return extension === ".mp4" && file.mimetype === "video/mp4";
}

function validateMp4Path(filePath) {
  const stats = fs.statSync(filePath);
  if (!stats.isFile() || !stats.size) throw booksError("MP4 file is empty.");

  const descriptor = fs.openSync(filePath, "r");
  const header = Buffer.alloc(Math.min(4096, stats.size));

  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }

  if (header.indexOf(Buffer.from("ftyp")) < 4) {
    throw booksError("MP4 file does not contain a valid ftyp box.");
  }
}

function validateVideoUpload(files) {
  const uploadedFiles = Array.isArray(files) ? files : [];

  if (uploadedFiles.length !== 1) {
    throw booksError("Exactly one MP4 video is required.");
  }

  const file = uploadedFiles[0];
  if (!getUploadedVideoType(file)) throw booksError("Only an MP4 video is allowed.");
  if (!file.size || file.size > MAX_BOOK_VIDEO_SIZE) {
    throw booksError(`Video must be smaller than ${MAX_BOOK_VIDEO_SIZE / (1024 * 1024)} MB.`);
  }
  if (!file.path || !fs.existsSync(file.path) || !fs.lstatSync(file.path).isFile()) {
    throw booksError("Temporary uploaded video is missing.");
  }

  validateMp4Path(file.path);
  return file;
}

function checksum(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function verifyCopiedVideo(sourcePath, destinationPath) {
  const sourceStats = fs.statSync(sourcePath);
  const destinationStats = fs.statSync(destinationPath);

  if (
    sourceStats.size !== destinationStats.size ||
    checksum(sourcePath) !== checksum(destinationPath)
  ) {
    throw new Error("Copied video verification failed.");
  }

  validateMp4Path(destinationPath);
}

function cleanupUploadedFiles(files) {
  (files || []).forEach(file => {
    try {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (error) {
      console.error(`[magazines-books] unable to clean upload ${file.path}:`, error.message);
    }
  });
}

function createMagazinesBooksService({
  sectionConfig = SECTION_CONFIG,
  failureInjector = null
} = {}) {
  const datasetLocks = new Set();
  const projectLocks = new Set();

  function injectFailure(step) {
    if (failureInjector) failureInjector(step);
  }

  function getSection() {
    try {
      return getSectionConfig("magazines-books", {
        config: sectionConfig,
        expectedDataKind: "magazines-books"
      });
    } catch (error) {
      throw booksError(error.message);
    }
  }

  async function withWriteLock(section, projectId, operation) {
    const datasetLock = section.dataFile;
    const projectLock = projectId ? `${section.key}:${projectId}` : null;

    if (
      datasetLocks.has(datasetLock) ||
      (projectLock && projectLocks.has(projectLock))
    ) {
      throw booksError("Another Magazines & Books operation is in progress.", 409);
    }

    datasetLocks.add(datasetLock);
    if (projectLock) projectLocks.add(projectLock);

    try {
      return await operation();
    } finally {
      datasetLocks.delete(datasetLock);
      if (projectLock) projectLocks.delete(projectLock);
    }
  }

  function listItems() {
    const section = getSection();
    const { records } = readCollection(section);
    return JSON.parse(JSON.stringify(records));
  }

  function nextAvailableId(section, records) {
    const usedIds = new Set(records.map(record => record.id));
    let number = 1;

    while (true) {
      const id = `book-${String(number).padStart(2, "0")}`;
      const directory = resolveProjectDirectory(section, id);
      if (!usedIds.has(id) && !fs.existsSync(directory)) return id;
      number++;
    }
  }

  async function createItem({ title, credits, position = "bottom", files }) {
    const section = getSection();
    const cleanTitle = validateTitle(title);
    const cleanCredits = parseCreditsInput(credits);
    const uploadedFile = validateVideoUpload(files);

    return withWriteLock(section, null, async () => {
      const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
      const { source, records } = readCollection(section);
      const id = nextAvailableId(section, records);
      const projectDirectory = resolveProjectDirectory(section, id);
      const stagingDirectory = resolveFixedRootChild(
        section.assetRoot,
        `.books-create-${transactionId}`
      );
      let tempDataFile = null;
      let assetsInstalled = false;

      fs.mkdirSync(section.assetRoot, { recursive: true });
      assertSafeDirectory(section.assetRoot, "Books asset root");
      if (fs.existsSync(stagingDirectory) || fs.existsSync(projectDirectory)) {
        throw booksError("Generated book asset path already exists.", 409);
      }

      fs.mkdirSync(stagingDirectory);

      try {
        const stagedVideo = resolveFixedRootChild(stagingDirectory, "video.mp4");
        fs.copyFileSync(uploadedFile.path, stagedVideo);
        verifyCopiedVideo(uploadedFile.path, stagedVideo);

        const record = validateRecord({
          id,
          title: cleanTitle,
          credits: cleanCredits,
          video: `${section.publicAssetPrefix}${id}/video.mp4`
        }, section);
        const updatedRecords = [...records];

        if (position === "top") updatedRecords.unshift(record);
        else updatedRecords.push(record);

        tempDataFile = stageCollection(section, updatedRecords, transactionId);
        injectFailure("create:after-staging");

        if (fs.readFileSync(section.dataFile, "utf8") !== source) {
          throw new Error("Dataset changed during book creation.");
        }

        fs.renameSync(stagingDirectory, projectDirectory);
        assetsInstalled = true;
        injectFailure("create:after-assets-installed");
        fs.renameSync(tempDataFile, section.dataFile);
        tempDataFile = null;

        return JSON.parse(JSON.stringify(record));
      } catch (error) {
        if (assetsInstalled && fs.existsSync(projectDirectory) && !fs.existsSync(stagingDirectory)) {
          fs.renameSync(projectDirectory, stagingDirectory);
        }
        throw error;
      } finally {
        if (tempDataFile && fs.existsSync(tempDataFile)) fs.unlinkSync(tempDataFile);
        if (fs.existsSync(stagingDirectory)) {
          fs.rmSync(stagingDirectory, { recursive: true, force: true });
        }
      }
    });
  }

  async function editItem({ id, title, credits }) {
    const section = getSection();
    const projectId = validateBookId(id);
    const cleanTitle = validateTitle(title);
    const cleanCredits = parseCreditsInput(credits);

    return withWriteLock(section, projectId, async () => {
      const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
      const { source, records } = readCollection(section);
      const index = records.findIndex(record => record.id === projectId);
      let tempDataFile = null;

      if (index === -1) throw booksError("Book record was not found.", 404);

      const updatedRecord = validateRecord({
        ...records[index],
        title: cleanTitle,
        credits: cleanCredits
      }, section);
      const updatedRecords = [...records];
      updatedRecords[index] = updatedRecord;

      try {
        tempDataFile = stageCollection(section, updatedRecords, transactionId);
        injectFailure("edit:before-data-commit");
        if (fs.readFileSync(section.dataFile, "utf8") !== source) {
          throw new Error("Dataset changed during book editing.");
        }
        fs.renameSync(tempDataFile, section.dataFile);
        tempDataFile = null;
        return JSON.parse(JSON.stringify(updatedRecord));
      } finally {
        if (tempDataFile && fs.existsSync(tempDataFile)) fs.unlinkSync(tempDataFile);
      }
    });
  }

  async function replaceVideo({ id, files }) {
    const section = getSection();
    const projectId = validateBookId(id);
    const uploadedFile = validateVideoUpload(files);

    return withWriteLock(section, projectId, async () => {
      const { records } = readCollection(section);
      const record = records.find(item => item.id === projectId);
      if (!record) throw booksError("Book record was not found.", 404);

      const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
      const { directory: projectDirectory } = assertProjectAssets(section, record);
      const stagingDirectory = resolveFixedRootChild(
        section.assetRoot,
        `.books-replace-${transactionId}`
      );
      const backupDirectory = resolveFixedRootChild(
        section.assetRoot,
        `.books-replace-backup-${transactionId}`
      );
      let originalMoved = false;
      let replacementInstalled = false;
      let committed = false;

      if (fs.existsSync(stagingDirectory) || fs.existsSync(backupDirectory)) {
        throw new Error("Video replacement staging path already exists.");
      }

      fs.mkdirSync(stagingDirectory);

      try {
        const stagedVideo = resolveFixedRootChild(stagingDirectory, "video.mp4");
        fs.copyFileSync(uploadedFile.path, stagedVideo);
        verifyCopiedVideo(uploadedFile.path, stagedVideo);

        fs.renameSync(projectDirectory, backupDirectory);
        originalMoved = true;
        fs.renameSync(stagingDirectory, projectDirectory);
        replacementInstalled = true;
        assertProjectAssets(section, record);
        injectFailure("replace:after-new-installed");

        fs.rmSync(backupDirectory, { recursive: true, force: true });
        originalMoved = false;
        committed = true;
        return JSON.parse(JSON.stringify(record));
      } catch (error) {
        if (!committed) {
          if (replacementInstalled && fs.existsSync(projectDirectory)) {
            if (fs.existsSync(stagingDirectory)) {
              fs.rmSync(stagingDirectory, { recursive: true, force: true });
            }
            fs.renameSync(projectDirectory, stagingDirectory);
            replacementInstalled = false;
          }

          if (originalMoved && fs.existsSync(backupDirectory) && !fs.existsSync(projectDirectory)) {
            fs.renameSync(backupDirectory, projectDirectory);
            originalMoved = false;
          }
        }
        throw error;
      } finally {
        if (fs.existsSync(stagingDirectory)) {
          fs.rmSync(stagingDirectory, { recursive: true, force: true });
        }
        if (committed && fs.existsSync(backupDirectory)) {
          fs.rmSync(backupDirectory, { recursive: true, force: true });
        }
      }
    });
  }

  async function deleteItem({ id }) {
    const section = getSection();
    const projectId = validateBookId(id);

    return withWriteLock(section, projectId, async () => {
      const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const { source, records } = readCollection(section);
      const index = records.findIndex(record => record.id === projectId);
      let tempDataFile = null;
      let assetsMoved = false;
      let committed = false;

      if (index === -1) throw booksError("Book record was not found.", 404);

      const originalRecord = records[index];
      const { directory: projectDirectory } = assertProjectAssets(section, originalRecord);
      const trashRootExisted = fs.existsSync(section.trashRoot);
      const backupDirectory = resolveFixedRootChild(
        section.trashRoot,
        `${projectId}-${timestamp}-${transactionId}`
      );
      const updatedRecords = records.filter((record, recordIndex) => recordIndex !== index);

      fs.mkdirSync(section.trashRoot, { recursive: true });
      assertSafeDirectory(section.trashRoot, "Books trash root");
      if (fs.existsSync(backupDirectory)) throw new Error("Book trash path already exists.");

      try {
        tempDataFile = stageCollection(section, updatedRecords, transactionId);
        fs.renameSync(projectDirectory, backupDirectory);
        assetsMoved = true;
        fs.writeFileSync(
          resolveFixedRootChild(backupDirectory, "metadata.json"),
          JSON.stringify({
            operation: "delete-magazines-book",
            createdAt: new Date().toISOString(),
            originalIndex: index,
            originalRecord
          }, null, 2),
          { encoding: "utf8", flag: "wx" }
        );
        injectFailure("delete:after-assets-moved");

        if (fs.readFileSync(section.dataFile, "utf8") !== source) {
          throw new Error("Dataset changed during book deletion.");
        }

        fs.renameSync(tempDataFile, section.dataFile);
        tempDataFile = null;
        committed = true;

        return {
          id: projectId,
          backupPath: path.relative(path.resolve(__dirname, ".."), backupDirectory)
        };
      } catch (error) {
        if (!committed && assetsMoved && fs.existsSync(backupDirectory)) {
          const metadataPath = resolveFixedRootChild(backupDirectory, "metadata.json");
          if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
          if (!fs.existsSync(projectDirectory)) {
            fs.renameSync(backupDirectory, projectDirectory);
            assetsMoved = false;
          }
        }
        throw error;
      } finally {
        if (tempDataFile && fs.existsSync(tempDataFile)) fs.unlinkSync(tempDataFile);
        if (
          !committed &&
          !trashRootExisted &&
          fs.existsSync(section.trashRoot) &&
          fs.readdirSync(section.trashRoot).length === 0
        ) {
          fs.rmdirSync(section.trashRoot);
        }
      }
    });
  }

  async function reorderItems({ orderedIds }) {
    const section = getSection();

    return withWriteLock(section, null, async () => {
      const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
      const { source, records } = readCollection(section);
      let tempDataFile = null;

      if (!Array.isArray(orderedIds)) throw booksError("orderedIds must be an array.");
      if (orderedIds.some(id => typeof id !== "string")) {
        throw booksError("orderedIds must contain only strings.");
      }
      if (orderedIds.length !== records.length) {
        throw booksError("orderedIds must contain every book exactly once.");
      }
      if (new Set(orderedIds).size !== orderedIds.length) {
        throw booksError("orderedIds contains duplicates.");
      }

      const recordsById = new Map(records.map(record => [record.id, record]));
      if (orderedIds.some(id => !recordsById.has(id))) {
        throw booksError("orderedIds contains an unknown book.");
      }

      const reordered = orderedIds.map(id => recordsById.get(id));

      try {
        tempDataFile = stageCollection(section, reordered, transactionId);
        injectFailure("reorder:before-data-commit");
        if (fs.readFileSync(section.dataFile, "utf8") !== source) {
          throw new Error("Dataset changed during book reordering.");
        }
        fs.renameSync(tempDataFile, section.dataFile);
        tempDataFile = null;
        return JSON.parse(JSON.stringify(reordered));
      } finally {
        if (tempDataFile && fs.existsSync(tempDataFile)) fs.unlinkSync(tempDataFile);
      }
    });
  }

  async function duplicateItem({ id }) {
    const section = getSection();
    const projectId = validateBookId(id);

    return withWriteLock(section, projectId, async () => {
      const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
      const { source, records } = readCollection(section);
      const sourceIndex = records.findIndex(record => record.id === projectId);
      let tempDataFile = null;
      let assetsInstalled = false;

      if (sourceIndex === -1) throw booksError("Book record was not found.", 404);

      const sourceRecord = records[sourceIndex];
      const { directory: sourceDirectory, videoPath: sourceVideo } =
        assertProjectAssets(section, sourceRecord);
      const newId = nextAvailableId(section, records);
      const destinationDirectory = resolveProjectDirectory(section, newId);
      const stagingDirectory = resolveFixedRootChild(
        section.assetRoot,
        `.books-duplicate-${transactionId}`
      );

      if (fs.existsSync(stagingDirectory) || fs.existsSync(destinationDirectory)) {
        throw booksError("Generated duplicate asset path already exists.", 409);
      }

      fs.cpSync(sourceDirectory, stagingDirectory, {
        recursive: true,
        errorOnExist: true,
        preserveTimestamps: true
      });

      try {
        const stagedVideo = resolveFixedRootChild(stagingDirectory, "video.mp4");
        verifyCopiedVideo(sourceVideo, stagedVideo);
        const duplicate = validateRecord({
          id: newId,
          title: `${sourceRecord.title} COPY`,
          credits: JSON.parse(JSON.stringify(sourceRecord.credits)),
          video: `${section.publicAssetPrefix}${newId}/video.mp4`
        }, section);
        const updatedRecords = [...records];
        updatedRecords.splice(sourceIndex + 1, 0, duplicate);
        tempDataFile = stageCollection(section, updatedRecords, transactionId);
        injectFailure("duplicate:after-staging");

        if (fs.readFileSync(section.dataFile, "utf8") !== source) {
          throw new Error("Dataset changed during book duplication.");
        }

        fs.renameSync(stagingDirectory, destinationDirectory);
        assetsInstalled = true;
        injectFailure("duplicate:after-assets-installed");
        fs.renameSync(tempDataFile, section.dataFile);
        tempDataFile = null;
        return JSON.parse(JSON.stringify(duplicate));
      } catch (error) {
        if (
          assetsInstalled &&
          fs.existsSync(destinationDirectory) &&
          !fs.existsSync(stagingDirectory)
        ) {
          fs.renameSync(destinationDirectory, stagingDirectory);
        }
        throw error;
      } finally {
        if (tempDataFile && fs.existsSync(tempDataFile)) fs.unlinkSync(tempDataFile);
        if (fs.existsSync(stagingDirectory)) {
          fs.rmSync(stagingDirectory, { recursive: true, force: true });
        }
      }
    });
  }

  return {
    createItem,
    deleteItem,
    duplicateItem,
    editItem,
    listItems,
    reorderItems,
    replaceVideo
  };
}

function registerMagazinesBooksRoutes(app, {
  sectionConfig = SECTION_CONFIG,
  service = createMagazinesBooksService({ sectionConfig }),
  uploadRoot = path.resolve(__dirname, "..", "temp-upload", "magazines-books")
} = {}) {
  function createVideoUploadMiddleware() {
    fs.mkdirSync(uploadRoot, { recursive: true });
    return multer({
      dest: uploadRoot,
      limits: {
        files: 2,
        fileSize: MAX_BOOK_VIDEO_SIZE,
        fields: 8,
        fieldSize: 1024 * 1024,
        parts: 10
      },
      fileFilter: (req, file, callback) => {
        if (!getUploadedVideoType(file)) {
          callback(booksError("Only an MP4 video is allowed."));
          return;
        }
        callback(null, true);
      }
    }).array("video", 2);
  }

  function removeEmptyUploadRoot() {
    try {
      if (fs.existsSync(uploadRoot) && fs.readdirSync(uploadRoot).length === 0) {
        fs.rmdirSync(uploadRoot);
      }
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY"].includes(error.code)) {
        console.error("[magazines-books] unable to clean upload directory:", error.message);
      }
    }
  }

  function sendError(res, error) {
    const status = error instanceof MagazinesBooksError || error instanceof multer.MulterError
      ? (error.status || 400)
      : 500;
    const message = status >= 500
      ? "Magazines & Books operation failed."
      : error.message;

    if (status >= 500) {
      console.error("[magazines-books] operation failed:", error.message);
    }
    res.status(status).json({ success: false, error: message });
  }

  function withVideoUpload(handler) {
    return (req, res) => {
      createVideoUploadMiddleware()(req, res, async uploadError => {
        if (uploadError) {
          cleanupUploadedFiles(req.files);
          removeEmptyUploadRoot();
          sendError(res, uploadError);
          return;
        }

        try {
          await handler(req, res);
        } catch (error) {
          sendError(res, error);
        } finally {
          cleanupUploadedFiles(req.files);
          removeEmptyUploadRoot();
        }
      });
    };
  }

  app.get("/api/magazines-books", (req, res) => {
    try {
      res.json({ items: service.listItems() });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/create-magazines-book", withVideoUpload(async (req, res) => {
    const item = await service.createItem({
      title: req.body.title,
      credits: req.body.credits,
      position: req.body.position,
      files: req.files
    });
    res.status(201).json({ success: true, item });
  }));

  app.post("/api/edit-magazines-book", async (req, res) => {
    try {
      const item = await service.editItem(req.body || {});
      res.json({ success: true, item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/replace-magazines-book-video", withVideoUpload(async (req, res) => {
    const item = await service.replaceVideo({
      id: req.body.id,
      files: req.files
    });
    res.json({ success: true, item });
  }));

  app.post("/api/delete-magazines-book", async (req, res) => {
    try {
      const result = await service.deleteItem(req.body || {});
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/reorder-magazines-books", async (req, res) => {
    try {
      const items = await service.reorderItems(req.body || {});
      res.json({ success: true, items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/duplicate-magazines-book", async (req, res) => {
    try {
      const item = await service.duplicateItem(req.body || {});
      res.status(201).json({ success: true, item });
    } catch (error) {
      sendError(res, error);
    }
  });

  return service;
}

module.exports = {
  BOOK_ID_PATTERN,
  MAX_BOOK_VIDEO_SIZE,
  MagazinesBooksError,
  createMagazinesBooksService,
  parseMagazinesBooksCollection,
  registerMagazinesBooksRoutes,
  serializeMagazinesBooksCollection,
  validateRecord
};
