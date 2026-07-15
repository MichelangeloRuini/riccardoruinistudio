const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");

const {
  SECTION_CONFIG,
  getSectionConfig,
  resolveFixedRootChild,
  resolveProjectDirectory,
  validateProjectSlug
} = require("./section-config");

const MAX_PORTFOLIO_FILES = 50;
const MAX_PORTFOLIO_FILE_SIZE = 250 * 1024 * 1024;
const SAFE_MEDIA_BASENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i;
const VIDEO_EXTENSION = /\.mp4$/i;

class PortfolioValidationError extends Error {}

function validationError(message) {
  return new PortfolioValidationError(message);
}

function getUploadedMediaType(file) {
  const extension = path.extname(file.originalname || "").toLowerCase();

  if ([".jpg", ".jpeg"].includes(extension) && file.mimetype === "image/jpeg") {
    return "image";
  }

  if (extension === ".png" && file.mimetype === "image/png") {
    return "image";
  }

  if (extension === ".webp" && file.mimetype === "image/webp") {
    return "image";
  }

  if (extension === ".mp4" && file.mimetype === "video/mp4") {
    return "video";
  }

  return null;
}

function validateMp4File(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  const header = Buffer.alloc(12);

  try {
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);

    if (bytesRead < header.length || header.toString("ascii", 4, 8) !== "ftyp") {
      throw validationError("The uploaded MP4 does not have a valid signature.");
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function pad(number) {
  return String(number).padStart(2, "0");
}

async function optimizePortfolioImage(inputPath, outputDirectory, baseName) {
  const jpgPath = path.join(outputDirectory, `${baseName}.jpg`);

  await sharp(inputPath)
    .jpeg({ quality: 92 })
    .toFile(jpgPath);

  await sharp(jpgPath)
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(outputDirectory, `${baseName}.webp`));

  await sharp(jpgPath)
    .resize({ width: 80, withoutEnlargement: true })
    .blur(8)
    .webp({ quality: 45 })
    .toFile(path.join(outputDirectory, `${baseName}-thumb.webp`));
}

function cleanupUploadedFiles(files) {
  (files || []).forEach(file => {
    try {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (error) {
      console.error(`Unable to clean Portfolio upload ${file.path}:`, error);
    }
  });
}

function parsePortfolioCollection(source, collectionName) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(collectionName)) {
    throw new Error("Invalid configured collection name.");
  }

  const collection = new Function(`
    ${source}
    return ${collectionName};
  `)();

  if (!Array.isArray(collection)) {
    throw new Error("Portfolio data file does not contain an array.");
  }

  return collection;
}

function readPortfolioCollection(section) {
  const source = fs.readFileSync(section.dataFile, "utf8");
  const records = parsePortfolioCollection(source, section.collectionName);

  return { source, records };
}

function serializePortfolioCollection(section, records) {
  return `const ${section.collectionName} = ${JSON.stringify(records, null, 2)};\n`;
}

function stagePortfolioDataFile(section, records, transactionId) {
  const tempFile = `${section.dataFile}.portfolio-${transactionId}.tmp`;
  const serialized = serializePortfolioCollection(section, records);

  fs.writeFileSync(tempFile, serialized, "utf8");

  const stagedSource = fs.readFileSync(tempFile, "utf8");
  const stagedRecords = parsePortfolioCollection(stagedSource, section.collectionName);

  if (JSON.stringify(stagedRecords) !== JSON.stringify(records)) {
    throw new Error("Temporary Portfolio data validation failed.");
  }

  return tempFile;
}

function isSafeMediaBasename(filename) {
  return typeof filename === "string" &&
    SAFE_MEDIA_BASENAME.test(filename) &&
    path.basename(filename) === filename &&
    filename !== "." &&
    filename !== "..";
}

function validatePortfolioRecord(record, section) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw validationError("Portfolio record is invalid.");
  }

  const id = validateProjectSlug(record.id);

  if (record.section !== section.key) {
    throw validationError("Portfolio record section is invalid.");
  }

  if (typeof record.client !== "string" || !record.client.trim()) {
    throw validationError("Client is required.");
  }

  if (typeof record.title !== "string") {
    throw validationError("Title must be a string.");
  }

  const expectedPath = `${section.publicAssetPrefix}${id}/`;

  if (record.path !== expectedPath) {
    throw validationError("Portfolio record path is not server-generated.");
  }

  if (!Array.isArray(record.media) || !record.media.length) {
    throw validationError("Portfolio media must be a non-empty array.");
  }

  if (new Set(record.media).size !== record.media.length) {
    throw validationError("Portfolio media contains duplicates.");
  }

  record.media.forEach(filename => {
    if (
      !isSafeMediaBasename(filename) ||
      (!IMAGE_EXTENSION.test(filename) && !VIDEO_EXTENSION.test(filename))
    ) {
      throw validationError(`Invalid Portfolio media filename: ${filename}`);
    }
  });

  if (!isSafeMediaBasename(record.cover) || !IMAGE_EXTENSION.test(record.cover)) {
    throw validationError("Cover must be a safe image filename.");
  }

  const coverStem = record.cover.replace(/\.[^.]+$/, "").replace(/-thumb$/, "");
  const hasMatchingImage = record.media.some(filename =>
    IMAGE_EXTENSION.test(filename) && filename.replace(/\.[^.]+$/, "") === coverStem
  );

  if (!hasMatchingImage) {
    throw validationError("Cover must correspond to an image in project media.");
  }

  return record;
}

function assertDirectoryIsSafe(directory, label) {
  if (!fs.existsSync(directory)) {
    throw validationError(`${label} does not exist.`);
  }

  const stats = fs.lstatSync(directory);

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw validationError(`${label} is not a safe directory.`);
  }
}

function assertRecordFilesExist(record, projectDirectory) {
  record.media.forEach(filename => {
    const mediaPath = resolveFixedRootChild(projectDirectory, filename);

    if (!fs.existsSync(mediaPath) || !fs.lstatSync(mediaPath).isFile()) {
      throw validationError(`Project media does not exist: ${filename}`);
    }
  });

  const coverPath = resolveFixedRootChild(projectDirectory, record.cover);

  if (!fs.existsSync(coverPath) || !fs.lstatSync(coverPath).isFile()) {
    throw validationError("Cover image does not exist in the project directory.");
  }
}

function resolveStoredCover(record, requestedMedia, projectDirectory) {
  if (
    !isSafeMediaBasename(requestedMedia) ||
    !IMAGE_EXTENSION.test(requestedMedia) ||
    !record.media.includes(requestedMedia)
  ) {
    throw validationError("Cover selection must be an existing image media item.");
  }

  const extension = path.extname(requestedMedia);
  const webpCandidate = requestedMedia.slice(0, -extension.length) + ".webp";
  const candidates = [...new Set([webpCandidate, requestedMedia])];

  for (const candidate of candidates) {
    const candidatePath = resolveFixedRootChild(projectDirectory, candidate);

    if (fs.existsSync(candidatePath) && fs.lstatSync(candidatePath).isFile()) {
      return candidate;
    }
  }

  throw validationError("Selected cover image does not exist.");
}

function insertPortfolioRecord(records, record, position) {
  if (position === "top") {
    const firstSectionIndex = records.findIndex(item => item.section === record.section);

    if (firstSectionIndex !== -1) {
      return [
        ...records.slice(0, firstSectionIndex),
        record,
        ...records.slice(firstSectionIndex)
      ];
    }
  }

  if (position === "bottom") {
    let lastSectionIndex = -1;

    records.forEach((item, index) => {
      if (item.section === record.section) lastSectionIndex = index;
    });

    if (lastSectionIndex !== -1) {
      return [
        ...records.slice(0, lastSectionIndex + 1),
        record,
        ...records.slice(lastSectionIndex + 1)
      ];
    }
  }

  return [...records, record];
}

function buildPublicProject(project, section) {
  const query = new URLSearchParams({ section: project.section, id: project.id });

  return {
    ...project,
    imageMedia: project.media.filter(filename => IMAGE_EXTENSION.test(filename)),
    viewUrl: `${section.detailPage}?${query.toString()}`
  };
}

function createPortfolioService({
  sectionConfig = SECTION_CONFIG,
  failureInjector = null
} = {}) {
  const projectLocks = new Set();
  const dataFileLocks = new Set();

  function injectFailure(step) {
    if (failureInjector) failureInjector(step);
  }

  async function withLocks(section, projectId, operation) {
    const projectLock = `${section.key}:${projectId}`;
    const dataLock = section.dataFile;

    if (projectLocks.has(projectLock) || dataFileLocks.has(dataLock)) {
      throw validationError("Another Portfolio operation is already in progress.");
    }

    projectLocks.add(projectLock);
    dataFileLocks.add(dataLock);

    try {
      return await operation();
    } finally {
      projectLocks.delete(projectLock);
      dataFileLocks.delete(dataLock);
    }
  }

  function resolvePortfolioSection(sectionKey) {
    try {
      return getSectionConfig(sectionKey, {
        config: sectionConfig,
        expectedDataKind: "portfolio"
      });
    } catch (error) {
      throw validationError(error.message);
    }
  }

  function resolveProjectId(id) {
    try {
      return validateProjectSlug(id);
    } catch (error) {
      throw validationError(error.message);
    }
  }

  function listProjects(sectionKey) {
    const section = resolvePortfolioSection(sectionKey);
    const { records } = readPortfolioCollection(section);

    return records
      .filter(record => record.section === section.key)
      .map(record => buildPublicProject(validatePortfolioRecord(record, section), section));
  }

  async function createProject({
    sectionKey,
    id,
    client,
    title,
    position = "bottom",
    coverIndex,
    files
  }) {
    const section = resolvePortfolioSection(sectionKey);
    const projectId = resolveProjectId(id);
    const cleanClient = typeof client === "string" ? client.trim() : "";
    const cleanTitle = typeof title === "string" ? title.trim() : "";
    const uploadedFiles = Array.isArray(files) ? files : [];
    const selectedCoverIndex = Number(coverIndex);

    if (!cleanClient) throw validationError("Client is required.");
    if (!uploadedFiles.length) throw validationError("At least one media file is required.");
    if (uploadedFiles.length > MAX_PORTFOLIO_FILES) {
      throw validationError(`A maximum of ${MAX_PORTFOLIO_FILES} files is allowed.`);
    }

    if (!Number.isInteger(selectedCoverIndex) || selectedCoverIndex < 0) {
      throw validationError("A cover image must be selected.");
    }

    uploadedFiles.forEach(file => {
      if (!getUploadedMediaType(file)) {
        throw validationError(`Unsupported upload: ${file.originalname}`);
      }

      if (!file.size || file.size > MAX_PORTFOLIO_FILE_SIZE) {
        throw validationError(`Invalid file size: ${file.originalname}`);
      }

      if (!fs.existsSync(file.path) || !fs.lstatSync(file.path).isFile()) {
        throw validationError(`Temporary upload is missing: ${file.originalname}`);
      }
    });

    const selectedCoverFile = uploadedFiles[selectedCoverIndex];

    if (!selectedCoverFile || getUploadedMediaType(selectedCoverFile) !== "image") {
      throw validationError("Cover must be selected from uploaded images.");
    }

    return withLocks(section, projectId, async () => {
      const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
      const projectDirectory = resolveProjectDirectory(section, projectId);
      const stagingDirectory = resolveFixedRootChild(
        section.assetRoot,
        `.portfolio-create-${transactionId}`
      );
      let tempDataFile = null;
      let assetsInstalled = false;

      fs.mkdirSync(section.assetRoot, { recursive: true });
      assertDirectoryIsSafe(section.assetRoot, "Configured Portfolio asset root");

      const { source, records } = readPortfolioCollection(section);

      if (records.some(record => record.section === section.key && record.id === projectId)) {
        throw validationError("A project with this section and ID already exists.");
      }

      if (fs.existsSync(projectDirectory) || fs.existsSync(stagingDirectory)) {
        throw validationError("The project asset directory already exists.");
      }

      fs.mkdirSync(stagingDirectory);

      try {
        const media = [];
        const generatedByUploadIndex = new Map();
        let imageNumber = 1;
        let videoNumber = 1;

        for (let index = 0; index < uploadedFiles.length; index++) {
          const file = uploadedFiles[index];
          const mediaType = getUploadedMediaType(file);

          if (mediaType === "image") {
            const baseName = pad(imageNumber++);
            await optimizePortfolioImage(file.path, stagingDirectory, baseName);
            const primaryFilename = `${baseName}.jpg`;
            media.push(primaryFilename);
            generatedByUploadIndex.set(index, {
              primary: primaryFilename,
              cover: `${baseName}.webp`
            });
          } else {
            validateMp4File(file.path);
            const filename = `video-${pad(videoNumber++)}.mp4`;
            fs.copyFileSync(file.path, path.join(stagingDirectory, filename));
            media.push(filename);
            generatedByUploadIndex.set(index, { primary: filename, cover: null });
          }
        }

        const selectedCover = generatedByUploadIndex.get(selectedCoverIndex);

        if (!selectedCover || !selectedCover.cover) {
          throw validationError("Cover must be selected from uploaded images.");
        }

        const record = validatePortfolioRecord({
          id: projectId,
          section: section.key,
          client: cleanClient,
          title: cleanTitle,
          path: `${section.publicAssetPrefix}${projectId}/`,
          cover: selectedCover.cover,
          media
        }, section);

        assertRecordFilesExist(record, stagingDirectory);
        injectFailure("create:after-assets-staged");

        const updatedRecords = insertPortfolioRecord(
          records,
          record,
          position === "top" ? "top" : "bottom"
        );

        tempDataFile = stagePortfolioDataFile(section, updatedRecords, transactionId);
        injectFailure("create:after-data-staged");

        if (fs.readFileSync(section.dataFile, "utf8") !== source) {
          throw new Error("Portfolio data changed during project creation.");
        }

        fs.renameSync(stagingDirectory, projectDirectory);
        assetsInstalled = true;
        injectFailure("create:after-assets-installed");

        fs.renameSync(tempDataFile, section.dataFile);
        tempDataFile = null;

        return buildPublicProject(record, section);
      } catch (error) {
        if (assetsInstalled && fs.existsSync(projectDirectory)) {
          fs.renameSync(projectDirectory, stagingDirectory);
          assetsInstalled = false;
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

  async function editProject({ sectionKey, id, client, title, cover }) {
    const section = resolvePortfolioSection(sectionKey);
    const projectId = resolveProjectId(id);
    const cleanClient = typeof client === "string" ? client.trim() : "";
    const cleanTitle = typeof title === "string" ? title.trim() : "";

    if (!cleanClient) throw validationError("Client is required.");

    return withLocks(section, projectId, async () => {
      const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
      const projectDirectory = resolveProjectDirectory(section, projectId);
      let tempDataFile = null;

      assertDirectoryIsSafe(projectDirectory, "Portfolio project directory");

      try {
        const { source, records } = readPortfolioCollection(section);
        const projectIndex = records.findIndex(record =>
          record.section === section.key && record.id === projectId
        );

        if (projectIndex === -1) throw validationError("Portfolio project was not found.");

        const originalRecord = validatePortfolioRecord(records[projectIndex], section);
        const storedCover = resolveStoredCover(originalRecord, cover, projectDirectory);
        const updatedRecord = validatePortfolioRecord({
          ...originalRecord,
          client: cleanClient,
          title: cleanTitle,
          cover: storedCover
        }, section);

        assertRecordFilesExist(updatedRecord, projectDirectory);

        const updatedRecords = [...records];
        updatedRecords[projectIndex] = updatedRecord;
        tempDataFile = stagePortfolioDataFile(section, updatedRecords, transactionId);

        records.forEach((record, index) => {
          if (index !== projectIndex && JSON.stringify(record) !== JSON.stringify(updatedRecords[index])) {
            throw new Error("Portfolio edit would modify an unrelated record.");
          }
        });

        injectFailure("edit:before-data-commit");

        if (fs.readFileSync(section.dataFile, "utf8") !== source) {
          throw new Error("Portfolio data changed during project editing.");
        }

        fs.renameSync(tempDataFile, section.dataFile);
        tempDataFile = null;

        return buildPublicProject(updatedRecord, section);
      } finally {
        if (tempDataFile && fs.existsSync(tempDataFile)) fs.unlinkSync(tempDataFile);
      }
    });
  }

  async function deleteProject({ sectionKey, id }) {
    const section = resolvePortfolioSection(sectionKey);
    const projectId = resolveProjectId(id);

    return withLocks(section, projectId, async () => {
      const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const projectDirectory = resolveProjectDirectory(section, projectId);
      const backupDirectory = resolveFixedRootChild(
        section.trashRoot,
        `${projectId}-${timestamp}`
      );
      let tempDataFile = null;
      let originalMoved = false;
      let backupCreated = false;
      let committed = false;

      try {
        const { source, records } = readPortfolioCollection(section);
        const projectIndex = records.findIndex(record =>
          record.section === section.key && record.id === projectId
        );

        if (projectIndex === -1) throw validationError("Portfolio project was not found.");

        const originalRecord = validatePortfolioRecord(records[projectIndex], section);
        const updatedRecords = records.filter((record, index) => index !== projectIndex);
        tempDataFile = stagePortfolioDataFile(section, updatedRecords, transactionId);

        records.forEach((record, index) => {
          if (index === projectIndex) return;
          const updatedIndex = index < projectIndex ? index : index - 1;

          if (JSON.stringify(record) !== JSON.stringify(updatedRecords[updatedIndex])) {
            throw new Error("Portfolio delete would modify an unrelated record.");
          }
        });

        fs.mkdirSync(section.trashRoot, { recursive: true });
        assertDirectoryIsSafe(section.trashRoot, "Configured Portfolio trash root");

        if (fs.existsSync(backupDirectory)) {
          throw new Error("Portfolio backup directory already exists.");
        }

        if (fs.existsSync(projectDirectory)) {
          assertDirectoryIsSafe(projectDirectory, "Portfolio project directory");
          fs.renameSync(projectDirectory, backupDirectory);
          originalMoved = true;
        } else {
          fs.mkdirSync(backupDirectory);
        }

        backupCreated = true;

        fs.writeFileSync(
          path.join(backupDirectory, "metadata.json"),
          JSON.stringify({
            operation: "delete-portfolio-project",
            section: section.key,
            projectId,
            createdAt: new Date().toISOString(),
            originalRecord
          }, null, 2),
          { encoding: "utf8", flag: "wx" }
        );

        injectFailure("delete:after-assets-moved");

        if (fs.readFileSync(section.dataFile, "utf8") !== source) {
          throw new Error("Portfolio data changed during project deletion.");
        }

        fs.renameSync(tempDataFile, section.dataFile);
        tempDataFile = null;
        committed = true;

        return {
          id: projectId,
          section: section.key,
          backupPath: path.relative(path.resolve(__dirname, ".."), backupDirectory)
        };
      } catch (error) {
        if (!committed && backupCreated && fs.existsSync(backupDirectory)) {
          const metadataPath = path.join(backupDirectory, "metadata.json");
          if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);

          if (originalMoved && !fs.existsSync(projectDirectory)) {
            fs.renameSync(backupDirectory, projectDirectory);
            originalMoved = false;
          } else if (!originalMoved) {
            fs.rmSync(backupDirectory, { recursive: true, force: true });
          }
        }

        throw error;
      } finally {
        if (tempDataFile && fs.existsSync(tempDataFile)) fs.unlinkSync(tempDataFile);
      }
    });
  }

  return {
    createProject,
    deleteProject,
    editProject,
    listProjects,
    resolvePortfolioSection
  };
}

function registerPortfolioProjectRoutes(app, {
  sectionConfig = SECTION_CONFIG,
  service = createPortfolioService({ sectionConfig }),
  uploadRoot = path.resolve(__dirname, "..", "temp-upload", "portfolio-projects")
} = {}) {
  fs.mkdirSync(uploadRoot, { recursive: true });

  const upload = multer({
    dest: uploadRoot,
    limits: {
      files: MAX_PORTFOLIO_FILES,
      fileSize: MAX_PORTFOLIO_FILE_SIZE,
      fields: 8,
      fieldSize: 4096,
      parts: MAX_PORTFOLIO_FILES + 8
    },
    fileFilter: (req, file, callback) => {
      if (!getUploadedMediaType(file)) {
        callback(validationError(`Unsupported upload: ${file.originalname}`));
        return;
      }

      callback(null, true);
    }
  });

  function sendError(res, error) {
    const status = error instanceof PortfolioValidationError || error.message.includes("section")
      ? 400
      : 500;

    res.status(status).json({ success: false, error: error.message });
  }

  app.get("/api/admin/sections", (req, res) => {
    const sections = Object.values(sectionConfig)
      .filter(section => section.cmsEnabled)
      .map(section => ({
        key: section.key,
        label: section.label,
        dataKind: section.dataKind,
        renderer: section.renderer,
        publicPage: section.publicPage,
        detailMode: section.detailMode
      }));

    res.json({ success: true, sections });
  });

  app.get("/api/portfolio-projects", (req, res) => {
    try {
      const projects = service.listProjects(req.query.section);
      res.json({ success: true, projects });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/create-portfolio-project", (req, res) => {
    upload.array("files", MAX_PORTFOLIO_FILES)(req, res, async uploadError => {
      if (uploadError) {
        cleanupUploadedFiles(req.files);
        sendError(res, uploadError);
        return;
      }

      try {
        const project = await service.createProject({
          sectionKey: req.body.section,
          id: req.body.id,
          client: req.body.client,
          title: req.body.title,
          position: req.body.position,
          coverIndex: req.body.coverIndex,
          files: req.files
        });

        res.json({ success: true, project });
      } catch (error) {
        sendError(res, error);
      } finally {
        cleanupUploadedFiles(req.files);
      }
    });
  });

  app.post("/api/edit-portfolio-project", async (req, res) => {
    try {
      const project = await service.editProject({
        sectionKey: req.body.section,
        id: req.body.id,
        client: req.body.client,
        title: req.body.title,
        cover: req.body.cover
      });

      res.json({ success: true, project });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/delete-portfolio-project", async (req, res) => {
    try {
      const result = await service.deleteProject({
        sectionKey: req.body.section,
        id: req.body.id
      });

      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  return service;
}

module.exports = {
  MAX_PORTFOLIO_FILES,
  MAX_PORTFOLIO_FILE_SIZE,
  PortfolioValidationError,
  createPortfolioService,
  getUploadedMediaType,
  parsePortfolioCollection,
  registerPortfolioProjectRoutes,
  serializePortfolioCollection,
  validatePortfolioRecord
};
