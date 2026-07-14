const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

const upload = multer({ dest: "temp-upload/" });

const campaignsFile = path.join(__dirname, "data", "campaigns.js");
const campaignsRoot = path.resolve(__dirname, "assets", "campaigns");
const campaignTrashRoot = path.resolve(__dirname, "trash", "campaigns");
const addMediaTempDir = path.resolve(__dirname, "temp-upload", "campaign-media");
const MAX_ADD_MEDIA_FILES = 50;
const MAX_ADD_MEDIA_FILE_SIZE = 250 * 1024 * 1024;
const campaignMediaLocks = new Set();

fs.mkdirSync(addMediaTempDir, { recursive: true });

function getUploadedMediaType(file) {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    [".jpg", ".jpeg"].includes(extension) &&
    file.mimetype === "image/jpeg"
  ) {
    return "image";
  }

  if (extension === ".png" && file.mimetype === "image/png") {
    return "image";
  }

  if (extension === ".mp4" && file.mimetype === "video/mp4") {
    return "video";
  }

  return null;
}

const addCampaignMediaUpload = multer({
  dest: addMediaTempDir,
  limits: {
    files: MAX_ADD_MEDIA_FILES,
    fileSize: MAX_ADD_MEDIA_FILE_SIZE,
    fields: 1,
    fieldSize: 256,
    parts: MAX_ADD_MEDIA_FILES + 1
  },
  fileFilter: (req, file, callback) => {
    if (!getUploadedMediaType(file)) {
      callback(new Error(`Tipo file non valido: ${file.originalname}`));
      return;
    }

    callback(null, true);
  }
});

function cleanupTemporaryFiles(files) {
  (files || []).forEach(file => {
    try {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (cleanupError) {
      console.error(`Unable to clean temporary upload ${file.path}:`, cleanupError);
    }
  });
}

function validateCampaignDirectoryPath(campaignId) {
  const campaignDir = path.resolve(campaignsRoot, campaignId);

  if (path.dirname(campaignDir) !== campaignsRoot) {
    throw new Error("Percorso campagna non valido.");
  }

  return campaignDir;
}

function getCampaignDirectorySignature(directory, includeModifiedTime = true) {
  const entries = [];

  function visit(currentDirectory, relativeDirectory = "") {
    const directoryEntries = fs.readdirSync(currentDirectory, { withFileTypes: true })
      .sort((first, second) => first.name.localeCompare(second.name));

    directoryEntries.forEach(entry => {
      const absolutePath = path.join(currentDirectory, entry.name);
      const relativePath = path.join(relativeDirectory, entry.name);
      const stats = fs.lstatSync(absolutePath);

      if (entry.isDirectory()) {
        entries.push([relativePath, "directory"]);
        visit(absolutePath, relativePath);
      } else if (entry.isSymbolicLink()) {
        entries.push([relativePath, "symlink", fs.readlinkSync(absolutePath)]);
      } else {
        const fileSignature = [relativePath, "file", stats.size];

        if (includeModifiedTime) fileSignature.push(stats.mtimeMs);
        entries.push(fileSignature);
      }
    });
  }

  visit(directory);
  return JSON.stringify(entries);
}

function validateMp4File(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  const header = Buffer.alloc(12);

  try {
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);

    if (bytesRead < header.length || header.toString("ascii", 4, 8) !== "ftyp") {
      throw new Error("Il video MP4 non ha una firma valida.");
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function getNextMediaNumber(filenames, type) {
  const pattern = type === "image"
    ? /^(\d+)(?:-thumb)?\.(?:jpe?g|webp)$/i
    : /^video-(\d+)\.mp4$/i;
  const numbers = filenames
    .map(filename => filename.match(pattern))
    .filter(Boolean)
    .map(match => Number(match[1]));

  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function pad(number) {
  return String(number).padStart(2, "0");
}

async function optimizeImage(inputPath, outputDir, baseName) {
  await sharp(inputPath)
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(outputDir, `${baseName}.webp`));

  await sharp(inputPath)
    .resize({ width: 80, withoutEnlargement: true })
    .blur(8)
    .webp({ quality: 45 })
    .toFile(path.join(outputDir, `${baseName}-thumb.webp`));
}

function createCredits(text) {
  return text
    .split("\n")
    .filter(line => line.trim() !== "")
    .map(line => {
      const [label, values] = line.split(":");

      if (!label || !values) return "";

      const cleanValues = values
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);

      if (cleanValues.length === 1) {
        return `    {
      label: "${label.trim()}",
      value: "${cleanValues[0]}"
    }`;
      }

      return `    {
      label: "${label.trim()}",
      value: [
        ${cleanValues.map(value => `"${value}"`).join(",\n        ")}
      ]
    }`;
    })
    .filter(Boolean)
    .join(",\n");
}

function parseCredits(text) {
  return text
    .split("\n")
    .filter(line => line.trim() !== "")
    .map(line => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) return null;

      const label = line.slice(0, separatorIndex).trim();
      const values = line.slice(separatorIndex + 1);

      if (!label || !values.trim()) return null;

      const cleanValues = values
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);

      if (cleanValues.length === 1) {
        return {
          label: label.trim(),
          value: cleanValues[0]
        };
      }

      return {
        label: label.trim(),
        value: cleanValues
      };
    })
    .filter(Boolean);
}

function createMedia(imagesCount, videosCount) {
  const media = [];

  for (let i = 1; i <= imagesCount; i++) {
    media.push(`"${pad(i)}.jpg"`);
  }

  for (let i = 1; i <= videosCount; i++) {
    media.push(`"video-${pad(i)}.mp4"`);
  }

  return media.join(",\n    ");
}

function insertCampaignInDataFile(campaignCode, position) {
  const file = fs.readFileSync(campaignsFile, "utf8");

  if (!file.includes("const campaigns = [")) {
    throw new Error("data/campaigns.js non ha la struttura prevista.");
  }

  const start = file.indexOf("[") + 1;
  const end = file.lastIndexOf("];");

  if (end === -1) {
    throw new Error("Non trovo la chiusura ]; in data/campaigns.js");
  }

  const before = file.slice(0, start);
  const content = file.slice(start, end).trim();
  const after = file.slice(end);

  let newContent;

  if (!content) {
    newContent = `\n${campaignCode}\n`;
  } else if (position === "top") {
    newContent = `\n${campaignCode},\n\n${content}\n`;
  } else {
    newContent = `\n${content.replace(/,\s*$/, "")},\n\n${campaignCode}\n`;
  }

  fs.writeFileSync(campaignsFile, before + newContent + after, "utf8");
}

app.post("/api/create-campaign", upload.array("files"), async (req, res) => {
  console.log("[create-campaign] endpoint reached", {
    fileCount: Array.isArray(req.files) ? req.files.length : 0,
    fieldNames: [...new Set((req.files || []).map(file => file.fieldname))]
  });

  try {
    const client = req.body.client.trim();
    const title = req.body.title.trim();
    const folder = req.body.folder.trim() || slugify(`${client}-${title}`);
    const border = req.body.border === "true";
    const credits = req.body.credits || "";
    const position = req.body.position || "top";

    const campaignDir = path.join(__dirname, "assets", "campaigns", folder);

    if (fs.existsSync(campaignDir)) {
      throw new Error(`La cartella "${folder}" esiste già.`);
    }

    fs.mkdirSync(campaignDir, { recursive: true });

    const imageFiles = req.files
      .filter(file => [".jpg", ".jpeg", ".png"].includes(path.extname(file.originalname).toLowerCase()))
      .sort((a, b) => a.originalname.localeCompare(b.originalname));

    const videoFiles = req.files
      .filter(file => [".mp4"].includes(path.extname(file.originalname).toLowerCase()))
      .sort((a, b) => a.originalname.localeCompare(b.originalname));

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const number = pad(i + 1);
      const jpgPath = path.join(campaignDir, `${number}.jpg`);

      await sharp(file.path)
        .jpeg({ quality: 92 })
        .toFile(jpgPath);

      await optimizeImage(jpgPath, campaignDir, number);

      fs.unlinkSync(file.path);
    }

    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i];
      const number = pad(i + 1);
      const videoPath = path.join(campaignDir, `video-${number}.mp4`);

      fs.renameSync(file.path, videoPath);
    }

    const campaignCode = `{
  id: "${folder}",
  client: "${client}",
  title: "${title}",
  category: "Campaigns",
  path: "assets/campaigns/${folder}/",

  border: ${border},

  credits: [
${createCredits(credits)}
  ],

  media: [
    ${createMedia(imageFiles.length, videoFiles.length)}
  ]
}`;

    insertCampaignInDataFile(campaignCode, position);

    res.json({
      success: true,
      folder,
      images: imageFiles.length,
      videos: videoFiles.length,
      code: campaignCode
    });
  } catch (error) {
    console.error("[create-campaign] operation failed", {
      message: error.message,
      stack: error.stack
    });

    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/campaigns", (req, res) => {
  try {
    const file = fs.readFileSync(campaignsFile, "utf8");

    const match = file.match(/const campaigns = \[([\s\S]*?)\];/);

    if (!match) {
      throw new Error("Non trovo const campaigns = [...] dentro data/campaigns.js");
    }

    const campaigns = new Function(`
      ${file}
      return campaigns;
    `)();

    res.json({
      success: true,
      campaigns
    });

  } catch (err) {

    res.json({
      success: false,
      error: err.message
    });

  }
});
app.get("/api/git-status", (req, res) => {
  exec("git status --porcelain=v1 --branch", { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({
        success: false,
        error: stderr || error.message
      });
      return;
    }

    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const branchLine = lines.find(line => line.startsWith("## ")) || "";
    const changeLines = lines.filter(line => !line.startsWith("## "));
    const aheadMatch = branchLine.match(/\bahead (\d+)/);
    const ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
    const changedFiles = changeLines.length;
    const hasUnpublishedChanges = changedFiles > 0 || ahead > 0;

    res.json({
      success: true,
      clean: !hasUnpublishedChanges,
      hasUnpublishedChanges,
      changedFiles,
      ahead
    });
  });
});
app.post("/api/duplicate-campaign", (req, res) => {
  try {
    const id = String(req.body.id || "").trim();

    if (!id) {
      throw new Error("ID campagna mancante.");
    }

    const file = fs.readFileSync(campaignsFile, "utf8");

    const campaigns = new Function(`
      ${file}
      return campaigns;
    `)();

    const campaignIndex = campaigns.findIndex(campaign => campaign.id === id);

    if (campaignIndex === -1) {
      throw new Error(`Campagna non trovata: ${id}`);
    }

    const sourceDir = path.join(__dirname, "assets", "campaigns", id);

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Cartella asset non trovata: assets/campaigns/${id}`);
    }

    const existingIds = new Set(campaigns.map(campaign => campaign.id));
    let copyId = `${id}-copy`;
    let copyNumber = 2;

    while (
      existingIds.has(copyId) ||
      fs.existsSync(path.join(__dirname, "assets", "campaigns", copyId))
    ) {
      copyId = `${id}-copy-${copyNumber}`;
      copyNumber++;
    }

    const originalCampaign = campaigns[campaignIndex];
    const duplicateCampaign = {
      ...originalCampaign,
      id: copyId,
      title: `${originalCampaign.title} Copy`,
      path: `assets/campaigns/${copyId}/`,
      credits: JSON.parse(JSON.stringify(originalCampaign.credits || [])),
      media: JSON.parse(JSON.stringify(originalCampaign.media || []))
    };

    const updatedCampaigns = [...campaigns];
    updatedCampaigns.splice(campaignIndex + 1, 0, duplicateCampaign);

    const formattedCampaigns = JSON.stringify(updatedCampaigns, null, 2)
      .replace(/"([^"]+)":/g, "$1:");

    const newFile = `const campaigns = ${formattedCampaigns};`;
    const copyDir = path.join(__dirname, "assets", "campaigns", copyId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const tempCampaignsFile = `${campaignsFile}.duplicate-${timestamp}.tmp`;

    fs.writeFileSync(tempCampaignsFile, newFile, "utf8");

    try {
      fs.cpSync(sourceDir, copyDir, { recursive: true });
      fs.renameSync(tempCampaignsFile, campaignsFile);
    } catch (duplicateErr) {
      if (fs.existsSync(copyDir)) {
        fs.rmSync(copyDir, { recursive: true, force: true });
      }

      if (fs.existsSync(tempCampaignsFile)) {
        fs.unlinkSync(tempCampaignsFile);
      }

      throw duplicateErr;
    }

    res.json({
      success: true,
      campaign: duplicateCampaign
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message
    });

  }
});
app.post("/api/edit-campaign", (req, res) => {
  try {
    const id = String(req.body.id || "").trim();
    const client = String(req.body.client || "").trim();
    const title = String(req.body.title || "").trim();
    const border = req.body.border === true || req.body.border === "true";
    const credits = typeof req.body.credits === "string" ? req.body.credits : "";

    if (!id) {
      throw new Error("ID campagna mancante.");
    }

    if (!client) {
      throw new Error("Client mancante.");
    }

    if (!title) {
      throw new Error("Title mancante.");
    }

    const file = fs.readFileSync(campaignsFile, "utf8");

    const campaigns = new Function(`
      ${file}
      return campaigns;
    `)();

    const campaignIndex = campaigns.findIndex(campaign => campaign.id === id);

    if (campaignIndex === -1) {
      throw new Error(`Campagna non trovata: ${id}`);
    }

    campaigns[campaignIndex] = {
      ...campaigns[campaignIndex],
      client,
      title,
      border,
      credits: parseCredits(credits)
    };

    const formattedCampaigns = JSON.stringify(campaigns, null, 2)
      .replace(/"([^"\\]+)":/g, "$1:");

    const newFile = `const campaigns = ${formattedCampaigns};`;

    fs.writeFileSync(campaignsFile, newFile, "utf8");

    res.json({
      success: true,
      campaign: {
        id,
        client,
        title,
        border
      }
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message
    });

  }
});

app.post("/api/reorder-campaign-media", (req, res) => {
  let tempCampaignsFile = null;

  try {
    const body = req.body || {};
    const id = String(body.id || "").trim();
    const submittedMedia = body.media;

    if (!id) {
      throw new Error("ID campagna mancante.");
    }

    if (!Array.isArray(submittedMedia)) {
      throw new Error("media non è un array.");
    }

    if (submittedMedia.some(filename => typeof filename !== "string" || !filename)) {
      throw new Error("media contiene un nome file non valido.");
    }

    if (new Set(submittedMedia).size !== submittedMedia.length) {
      throw new Error("media contiene file duplicati.");
    }

    const file = fs.readFileSync(campaignsFile, "utf8");
    const campaigns = new Function(`
      ${file}
      return campaigns;
    `)();
    const campaignIndex = campaigns.findIndex(campaign => campaign.id === id);

    if (campaignIndex === -1) {
      throw new Error(`Campagna non trovata: ${id}`);
    }

    const campaign = campaigns[campaignIndex];
    const currentMedia = Array.isArray(campaign.media) ? campaign.media : [];
    const currentMediaSet = new Set(currentMedia);

    if (currentMediaSet.size !== currentMedia.length) {
      throw new Error(`La campagna ${id} contiene media duplicati.`);
    }

    if (submittedMedia.length !== currentMedia.length) {
      throw new Error("Il numero di media inviati non corrisponde alla campagna.");
    }

    const unknownMedia = submittedMedia.filter(filename => !currentMediaSet.has(filename));

    if (unknownMedia.length) {
      throw new Error(`Media non appartenente alla campagna: ${unknownMedia[0]}`);
    }

    const submittedMediaSet = new Set(submittedMedia);
    const missingMedia = currentMedia.filter(filename => !submittedMediaSet.has(filename));

    if (missingMedia.length) {
      throw new Error(`Media mancante: ${missingMedia[0]}`);
    }

    const updatedCampaigns = [...campaigns];
    updatedCampaigns[campaignIndex] = {
      ...campaign,
      media: [...submittedMedia]
    };

    const formattedCampaigns = JSON.stringify(updatedCampaigns, null, 2)
      .replace(/"([^"\\]+)":/g, "$1:");
    const newFile = `const campaigns = ${formattedCampaigns};`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    tempCampaignsFile = `${campaignsFile}.media-order-${process.pid}-${timestamp}.tmp`;
    fs.writeFileSync(tempCampaignsFile, newFile, "utf8");

    const stagedFile = fs.readFileSync(tempCampaignsFile, "utf8");
    const stagedCampaigns = new Function(`
      ${stagedFile}
      return campaigns;
    `)();
    const stagedCampaign = stagedCampaigns[campaignIndex];

    if (stagedCampaigns.length !== campaigns.length) {
      throw new Error("La verifica del file temporaneo non è riuscita.");
    }

    for (let index = 0; index < campaigns.length; index++) {
      if (index === campaignIndex) continue;

      if (JSON.stringify(stagedCampaigns[index]) !== JSON.stringify(campaigns[index])) {
        throw new Error("Il file temporaneo modificherebbe un'altra campagna.");
      }
    }

    const { media: originalMedia, ...originalCampaignFields } = campaign;
    const { media: stagedMedia, ...stagedCampaignFields } = stagedCampaign;

    if (JSON.stringify(stagedCampaignFields) !== JSON.stringify(originalCampaignFields)) {
      throw new Error("Il file temporaneo modificherebbe altri dati della campagna.");
    }

    if (
      !Array.isArray(stagedMedia) ||
      stagedMedia.length !== submittedMedia.length ||
      !stagedMedia.every((filename, index) => filename === submittedMedia[index])
    ) {
      throw new Error("L'ordine media nel file temporaneo non è valido.");
    }

    fs.renameSync(tempCampaignsFile, campaignsFile);
    tempCampaignsFile = null;

    res.json({
      success: true,
      media: [...submittedMedia]
    });
  } catch (err) {
    if (tempCampaignsFile && fs.existsSync(tempCampaignsFile)) {
      fs.unlinkSync(tempCampaignsFile);
    }

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

async function addCampaignMedia(req, res) {
  let campaignId = null;
  let stagingDir = null;
  let backupDir = null;
  let tempCampaignsFile = null;
  let originalMoved = false;
  let stagingInstalled = false;
  let committed = false;
  let lockAcquired = false;

  try {
    const id = String((req.body && req.body.id) || "").trim();
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];

    if (!id) {
      throw new Error("ID campagna mancante.");
    }

    if (!uploadedFiles.length) {
      throw new Error("Nessun file da aggiungere.");
    }

    if (uploadedFiles.length > MAX_ADD_MEDIA_FILES) {
      throw new Error(`Puoi aggiungere al massimo ${MAX_ADD_MEDIA_FILES} file alla volta.`);
    }

    for (const file of uploadedFiles) {
      if (!getUploadedMediaType(file)) {
        throw new Error(`Tipo file non valido: ${file.originalname}`);
      }

      if (!file.size || file.size > MAX_ADD_MEDIA_FILE_SIZE) {
        throw new Error(`Dimensione file non valida: ${file.originalname}`);
      }
    }

    const initialFile = fs.readFileSync(campaignsFile, "utf8");
    const initialCampaigns = new Function(`
      ${initialFile}
      return campaigns;
    `)();
    const initialCampaign = initialCampaigns.find(campaign => campaign.id === id);

    if (!initialCampaign) {
      throw new Error(`Campagna non trovata: ${id}`);
    }

    campaignId = initialCampaign.id;

    if (campaignMediaLocks.has(campaignId)) {
      throw new Error(`È già in corso un'operazione media per ${campaignId}.`);
    }

    campaignMediaLocks.add(campaignId);
    lockAcquired = true;

    const campaignDir = validateCampaignDirectoryPath(campaignId);

    if (!fs.existsSync(campaignDir)) {
      throw new Error(`Cartella asset non trovata: assets/campaigns/${campaignId}`);
    }

    const campaignStats = fs.lstatSync(campaignDir);

    if (!campaignStats.isDirectory() || campaignStats.isSymbolicLink()) {
      throw new Error("La cartella asset della campagna non è valida.");
    }

    const initialDirectorySignature = getCampaignDirectorySignature(campaignDir);
    const initialDirectoryInventory = getCampaignDirectorySignature(campaignDir, false);
    const transactionId = `${Date.now()}-${crypto.randomUUID()}`;

    stagingDir = path.join(campaignsRoot, `.media-staging-${transactionId}`);

    if (path.dirname(stagingDir) !== campaignsRoot || fs.existsSync(stagingDir)) {
      throw new Error("Impossibile creare una cartella di staging sicura.");
    }

    fs.cpSync(campaignDir, stagingDir, {
      recursive: true,
      errorOnExist: true,
      preserveTimestamps: true
    });

    if (getCampaignDirectorySignature(stagingDir, false) !== initialDirectoryInventory) {
      throw new Error("La copia di staging non corrisponde alla campagna originale.");
    }

    const stagedFilenames = [
      ...fs.readdirSync(stagingDir),
      ...(Array.isArray(initialCampaign.media) ? initialCampaign.media : [])
    ];
    let nextImageNumber = getNextMediaNumber(stagedFilenames, "image");
    let nextVideoNumber = getNextMediaNumber(stagedFilenames, "video");
    const addedMedia = [];

    for (const file of uploadedFiles) {
      const mediaType = getUploadedMediaType(file);

      if (mediaType === "image") {
        let baseName = pad(nextImageNumber);

        while (
          fs.existsSync(path.join(stagingDir, `${baseName}.jpg`)) ||
          fs.existsSync(path.join(stagingDir, `${baseName}.webp`)) ||
          fs.existsSync(path.join(stagingDir, `${baseName}-thumb.webp`))
        ) {
          nextImageNumber++;
          baseName = pad(nextImageNumber);
        }

        const jpgPath = path.join(stagingDir, `${baseName}.jpg`);

        await sharp(file.path)
          .jpeg({ quality: 92 })
          .toFile(jpgPath);
        await optimizeImage(jpgPath, stagingDir, baseName);

        addedMedia.push(`${baseName}.jpg`);
        nextImageNumber++;
      } else {
        validateMp4File(file.path);

        let baseName = `video-${pad(nextVideoNumber)}`;

        while (fs.existsSync(path.join(stagingDir, `${baseName}.mp4`))) {
          nextVideoNumber++;
          baseName = `video-${pad(nextVideoNumber)}`;
        }

        fs.copyFileSync(file.path, path.join(stagingDir, `${baseName}.mp4`));
        addedMedia.push(`${baseName}.mp4`);
        nextVideoNumber++;
      }
    }

    const latestFile = fs.readFileSync(campaignsFile, "utf8");
    const latestCampaigns = new Function(`
      ${latestFile}
      return campaigns;
    `)();
    const latestCampaignIndex = latestCampaigns.findIndex(campaign => campaign.id === campaignId);

    if (latestCampaignIndex === -1) {
      throw new Error(`La campagna ${campaignId} è stata rimossa durante l'operazione.`);
    }

    const latestCampaign = latestCampaigns[latestCampaignIndex];
    const initialMedia = Array.isArray(initialCampaign.media) ? initialCampaign.media : [];
    const latestMedia = Array.isArray(latestCampaign.media) ? latestCampaign.media : [];
    const initialMediaSet = new Set(initialMedia);
    const latestMediaSet = new Set(latestMedia);

    if (
      initialMediaSet.size !== initialMedia.length ||
      latestMediaSet.size !== latestMedia.length ||
      initialMedia.length !== latestMedia.length ||
      initialMedia.some(filename => !latestMediaSet.has(filename))
    ) {
      throw new Error("I media della campagna sono cambiati durante l'operazione. Riprova.");
    }

    if (
      !fs.existsSync(campaignDir) ||
      getCampaignDirectorySignature(campaignDir) !== initialDirectorySignature
    ) {
      throw new Error("La cartella della campagna è cambiata durante l'operazione. Riprova.");
    }

    const updatedMedia = [...latestMedia, ...addedMedia];
    const updatedCampaigns = [...latestCampaigns];

    updatedCampaigns[latestCampaignIndex] = {
      ...latestCampaign,
      media: updatedMedia
    };

    const formattedCampaigns = JSON.stringify(updatedCampaigns, null, 2)
      .replace(/"([^"\\]+)":/g, "$1:");
    const newFile = `const campaigns = ${formattedCampaigns};`;

    tempCampaignsFile = `${campaignsFile}.add-media-${transactionId}.tmp`;
    fs.writeFileSync(tempCampaignsFile, newFile, "utf8");

    const stagedDataFile = fs.readFileSync(tempCampaignsFile, "utf8");
    const stagedCampaigns = new Function(`
      ${stagedDataFile}
      return campaigns;
    `)();
    const stagedCampaign = stagedCampaigns[latestCampaignIndex];

    if (stagedCampaigns.length !== latestCampaigns.length) {
      throw new Error("La verifica del file temporaneo non è riuscita.");
    }

    for (let index = 0; index < latestCampaigns.length; index++) {
      if (index === latestCampaignIndex) continue;

      if (JSON.stringify(stagedCampaigns[index]) !== JSON.stringify(latestCampaigns[index])) {
        throw new Error("Il file temporaneo modificherebbe un'altra campagna.");
      }
    }

    const { media: latestCampaignMedia, ...latestCampaignFields } = latestCampaign;
    const { media: stagedCampaignMedia, ...stagedCampaignFields } = stagedCampaign;

    if (JSON.stringify(stagedCampaignFields) !== JSON.stringify(latestCampaignFields)) {
      throw new Error("Il file temporaneo modificherebbe altri dati della campagna.");
    }

    if (
      !Array.isArray(stagedCampaignMedia) ||
      stagedCampaignMedia.length !== updatedMedia.length ||
      !stagedCampaignMedia.every((filename, index) => filename === updatedMedia[index])
    ) {
      throw new Error("Il file temporaneo contiene un ordine media non valido.");
    }

    fs.mkdirSync(campaignTrashRoot, { recursive: true });
    backupDir = path.resolve(
      campaignTrashRoot,
      `${campaignId}-add-media-${transactionId}`
    );

    if (path.dirname(backupDir) !== campaignTrashRoot || fs.existsSync(backupDir)) {
      throw new Error("Impossibile creare uno snapshot sicuro della campagna.");
    }

    fs.renameSync(campaignDir, backupDir);
    originalMoved = true;

    fs.renameSync(stagingDir, campaignDir);
    stagingInstalled = true;

    fs.renameSync(tempCampaignsFile, campaignsFile);
    tempCampaignsFile = null;
    committed = true;

    console.log("[add-campaign-media] operation committed", {
      campaignId,
      addedMedia,
      backupPath: path.relative(__dirname, backupDir)
    });

    res.json({
      success: true,
      media: updatedMedia,
      addedMedia,
      backupPath: path.relative(__dirname, backupDir)
    });
  } catch (error) {
    console.error("[add-campaign-media] operation failed", {
      campaignId,
      message: error.message,
      stack: error.stack
    });

    if (!committed && campaignId && backupDir) {
      try {
        const campaignDir = validateCampaignDirectoryPath(campaignId);

        if (stagingInstalled && fs.existsSync(campaignDir)) {
          if (stagingDir && fs.existsSync(stagingDir)) {
            throw new Error("La cartella di staging per il rollback esiste già.");
          }

          fs.renameSync(campaignDir, stagingDir);
          stagingInstalled = false;
        }

        if (originalMoved && fs.existsSync(backupDir) && !fs.existsSync(campaignDir)) {
          fs.renameSync(backupDir, campaignDir);
          originalMoved = false;
        }
      } catch (rollbackError) {
        console.error("Campaign media rollback failed:", rollbackError);

        try {
          const campaignDir = validateCampaignDirectoryPath(campaignId);

          if (!fs.existsSync(campaignDir) && fs.existsSync(backupDir)) {
            fs.cpSync(backupDir, campaignDir, {
              recursive: true,
              errorOnExist: true,
              preserveTimestamps: true
            });
          }
        } catch (recoveryError) {
          console.error("Campaign media emergency recovery failed:", recoveryError);
          rollbackError.message += ` Recovery error: ${recoveryError.message}`;
        }

        error.message += ` Rollback error: ${rollbackError.message}`;
      }
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (tempCampaignsFile && fs.existsSync(tempCampaignsFile)) {
      try {
        fs.unlinkSync(tempCampaignsFile);
      } catch (cleanupError) {
        console.error("Unable to clean temporary campaigns file:", cleanupError);
      }
    }

    if (stagingDir && fs.existsSync(stagingDir)) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Unable to clean campaign staging directory:", cleanupError);
      }
    }

    cleanupTemporaryFiles(req.files);

    if (lockAcquired) campaignMediaLocks.delete(campaignId);
  }
}

app.post("/api/add-campaign-media", (req, res) => {
  console.log("[add-campaign-media] endpoint reached", {
    contentType: req.headers["content-type"] || "missing"
  });

  addCampaignMediaUpload.array("files", MAX_ADD_MEDIA_FILES)(req, res, uploadError => {
    if (uploadError) {
      cleanupTemporaryFiles(req.files);

      const errorMessage = uploadError.code === "LIMIT_FILE_SIZE"
        ? `Ogni file deve essere inferiore a ${MAX_ADD_MEDIA_FILE_SIZE / (1024 * 1024)} MB.`
        : uploadError.message;

      console.error("[add-campaign-media] upload rejected", {
        code: uploadError.code || "UPLOAD_ERROR",
        message: errorMessage
      });

      res.status(400).json({
        success: false,
        error: errorMessage
      });
      return;
    }

    console.log("[add-campaign-media] upload accepted", {
      campaignId: (req.body && req.body.id) || "missing",
      fileCount: Array.isArray(req.files) ? req.files.length : 0,
      fieldNames: [...new Set((req.files || []).map(file => file.fieldname))]
    });

    addCampaignMedia(req, res);
  });
});

app.post("/api/remove-campaign-media", (req, res) => {
  let campaignId = null;
  let lockAcquired = false;
  let stagingDir = null;
  let backupContainer = null;
  let backupDir = null;
  let tempCampaignsFile = null;
  let originalMoved = false;
  let stagingInstalled = false;
  let committed = false;

  try {
    const body = req.body || {};
    const id = String(body.id || "").trim();
    const removalMedia = body.media;
    const confirmEmpty = body.confirmEmpty === true;

    if (!id) {
      throw new Error("ID campagna mancante.");
    }

    if (!Array.isArray(removalMedia) || !removalMedia.length) {
      throw new Error("La lista dei media da rimuovere non è valida.");
    }

    if (removalMedia.some(filename => typeof filename !== "string" || !filename)) {
      throw new Error("La lista contiene un nome file non valido.");
    }

    if (new Set(removalMedia).size !== removalMedia.length) {
      throw new Error("La lista contiene media duplicati.");
    }

    const file = fs.readFileSync(campaignsFile, "utf8");
    const campaigns = new Function(`
      ${file}
      return campaigns;
    `)();
    const campaignIndex = campaigns.findIndex(campaign => campaign.id === id);

    if (campaignIndex === -1) {
      throw new Error(`Campagna non trovata: ${id}`);
    }

    const campaign = campaigns[campaignIndex];
    const currentMedia = Array.isArray(campaign.media) ? campaign.media : [];
    const currentMediaSet = new Set(currentMedia);

    if (currentMediaSet.size !== currentMedia.length) {
      throw new Error(`La campagna ${id} contiene media duplicati.`);
    }

    for (const filename of removalMedia) {
      if (!currentMediaSet.has(filename)) {
        throw new Error(`Media non appartenente alla campagna: ${filename}`);
      }

      if (!/^\d+\.jpg$/i.test(filename) && !/^video-\d+\.mp4$/i.test(filename)) {
        throw new Error(`Il file non è un media rimovibile: ${filename}`);
      }
    }

    const removalSet = new Set(removalMedia);
    const updatedMedia = currentMedia.filter(filename => !removalSet.has(filename));

    if (!updatedMedia.length && !confirmEmpty) {
      throw new Error("La rimozione lascerebbe la campagna senza media. Conferma richiesta.");
    }

    campaignId = campaign.id;

    if (campaignMediaLocks.has(campaignId)) {
      throw new Error(`È già in corso un'operazione media per ${campaignId}.`);
    }

    campaignMediaLocks.add(campaignId);
    lockAcquired = true;

    const campaignDir = validateCampaignDirectoryPath(campaignId);

    if (!fs.existsSync(campaignDir)) {
      throw new Error(`Cartella asset non trovata: assets/campaigns/${campaignId}`);
    }

    const campaignStats = fs.lstatSync(campaignDir);

    if (!campaignStats.isDirectory() || campaignStats.isSymbolicLink()) {
      throw new Error("La cartella asset della campagna non è valida.");
    }

    const initialDirectorySignature = getCampaignDirectorySignature(campaignDir);
    const initialDirectoryInventory = getCampaignDirectorySignature(campaignDir, false);
    const transactionId = `${Date.now()}-${crypto.randomUUID()}`;

    stagingDir = path.join(campaignsRoot, `.media-remove-staging-${transactionId}`);

    if (path.dirname(stagingDir) !== campaignsRoot || fs.existsSync(stagingDir)) {
      throw new Error("Impossibile creare una cartella di staging sicura.");
    }

    fs.cpSync(campaignDir, stagingDir, {
      recursive: true,
      errorOnExist: true,
      preserveTimestamps: true
    });

    if (getCampaignDirectorySignature(stagingDir, false) !== initialDirectoryInventory) {
      throw new Error("La copia di staging non corrisponde alla campagna originale.");
    }

    for (const filename of removalMedia) {
      const primaryPath = path.join(stagingDir, filename);

      if (!fs.existsSync(primaryPath) || !fs.lstatSync(primaryPath).isFile()) {
        throw new Error(`File media non trovato: ${filename}`);
      }

      const filesToRemove = /\.jpg$/i.test(filename)
        ? [
          filename,
          filename.replace(/\.jpg$/i, ".webp"),
          filename.replace(/\.jpg$/i, "-thumb.webp")
        ]
        : [filename];

      filesToRemove.forEach(fileToRemove => {
        const targetPath = path.join(stagingDir, fileToRemove);

        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      });

      if (filesToRemove.some(fileToRemove => fs.existsSync(path.join(stagingDir, fileToRemove)))) {
        throw new Error(`Impossibile rimuovere il media dallo staging: ${filename}`);
      }
    }

    if (
      !fs.existsSync(campaignDir) ||
      getCampaignDirectorySignature(campaignDir) !== initialDirectorySignature
    ) {
      throw new Error("La cartella della campagna è cambiata durante l'operazione. Riprova.");
    }

    const latestFile = fs.readFileSync(campaignsFile, "utf8");

    if (latestFile !== file) {
      throw new Error("I dati delle campagne sono cambiati durante l'operazione. Riprova.");
    }

    const updatedCampaigns = [...campaigns];

    updatedCampaigns[campaignIndex] = {
      ...campaign,
      media: updatedMedia
    };

    const formattedCampaigns = JSON.stringify(updatedCampaigns, null, 2)
      .replace(/"([^"\\]+)":/g, "$1:");
    const newFile = `const campaigns = ${formattedCampaigns};`;

    tempCampaignsFile = `${campaignsFile}.remove-media-${transactionId}.tmp`;
    fs.writeFileSync(tempCampaignsFile, newFile, "utf8");

    const stagedDataFile = fs.readFileSync(tempCampaignsFile, "utf8");
    const stagedCampaigns = new Function(`
      ${stagedDataFile}
      return campaigns;
    `)();
    const stagedCampaign = stagedCampaigns[campaignIndex];

    if (stagedCampaigns.length !== campaigns.length) {
      throw new Error("La verifica del file temporaneo non è riuscita.");
    }

    for (let index = 0; index < campaigns.length; index++) {
      if (index === campaignIndex) continue;

      if (JSON.stringify(stagedCampaigns[index]) !== JSON.stringify(campaigns[index])) {
        throw new Error("Il file temporaneo modificherebbe un'altra campagna.");
      }
    }

    const { media: campaignMedia, ...campaignFields } = campaign;
    const { media: stagedCampaignMedia, ...stagedCampaignFields } = stagedCampaign;

    if (JSON.stringify(stagedCampaignFields) !== JSON.stringify(campaignFields)) {
      throw new Error("Il file temporaneo modificherebbe altri dati della campagna.");
    }

    if (
      !Array.isArray(stagedCampaignMedia) ||
      stagedCampaignMedia.length !== updatedMedia.length ||
      !stagedCampaignMedia.every((filename, index) => filename === updatedMedia[index])
    ) {
      throw new Error("Il file temporaneo contiene un ordine media non valido.");
    }

    fs.mkdirSync(campaignTrashRoot, { recursive: true });
    backupContainer = path.resolve(
      campaignTrashRoot,
      `${campaignId}-remove-media-${transactionId}`
    );

    if (path.dirname(backupContainer) !== campaignTrashRoot || fs.existsSync(backupContainer)) {
      throw new Error("Impossibile creare uno snapshot sicuro della campagna.");
    }

    fs.mkdirSync(backupContainer);
    backupDir = path.join(backupContainer, "campaign");

    const snapshotMetadata = {
      operation: "remove-campaign-media",
      campaignId,
      createdAt: new Date().toISOString(),
      removedMedia: removalMedia,
      mediaBefore: currentMedia,
      mediaAfter: updatedMedia
    };

    fs.writeFileSync(
      path.join(backupContainer, "metadata.json"),
      JSON.stringify(snapshotMetadata, null, 2),
      "utf8"
    );

    fs.renameSync(campaignDir, backupDir);
    originalMoved = true;

    fs.renameSync(stagingDir, campaignDir);
    stagingInstalled = true;

    fs.renameSync(tempCampaignsFile, campaignsFile);
    tempCampaignsFile = null;
    committed = true;

    console.log("[remove-campaign-media] operation committed", {
      campaignId,
      removedMedia: removalMedia,
      backupPath: path.relative(__dirname, backupContainer)
    });

    res.json({
      success: true,
      media: updatedMedia,
      removedMedia: removalMedia,
      backupPath: path.relative(__dirname, backupContainer)
    });
  } catch (error) {
    console.error("[remove-campaign-media] operation failed", {
      campaignId,
      message: error.message,
      stack: error.stack
    });

    if (!committed && campaignId && backupDir) {
      try {
        const campaignDir = validateCampaignDirectoryPath(campaignId);

        if (stagingInstalled && fs.existsSync(campaignDir)) {
          if (stagingDir && fs.existsSync(stagingDir)) {
            throw new Error("La cartella di staging per il rollback esiste già.");
          }

          fs.renameSync(campaignDir, stagingDir);
          stagingInstalled = false;
        }

        if (originalMoved && fs.existsSync(backupDir) && !fs.existsSync(campaignDir)) {
          fs.renameSync(backupDir, campaignDir);
          originalMoved = false;
        }
      } catch (rollbackError) {
        console.error("Campaign media removal rollback failed:", rollbackError);

        try {
          const campaignDir = validateCampaignDirectoryPath(campaignId);

          if (!fs.existsSync(campaignDir) && fs.existsSync(backupDir)) {
            fs.cpSync(backupDir, campaignDir, {
              recursive: true,
              errorOnExist: true,
              preserveTimestamps: true
            });
          }
        } catch (recoveryError) {
          console.error("Campaign media removal emergency recovery failed:", recoveryError);
          rollbackError.message += ` Recovery error: ${recoveryError.message}`;
        }

        error.message += ` Rollback error: ${rollbackError.message}`;
      }
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (tempCampaignsFile && fs.existsSync(tempCampaignsFile)) {
      try {
        fs.unlinkSync(tempCampaignsFile);
      } catch (cleanupError) {
        console.error("Unable to clean temporary campaigns file:", cleanupError);
      }
    }

    if (stagingDir && fs.existsSync(stagingDir)) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Unable to clean media removal staging directory:", cleanupError);
      }
    }

    if (
      !committed &&
      !originalMoved &&
      backupContainer &&
      fs.existsSync(backupContainer)
    ) {
      try {
        fs.rmSync(backupContainer, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Unable to clean failed removal snapshot metadata:", cleanupError);
      }
    }

    if (lockAcquired) campaignMediaLocks.delete(campaignId);
  }
});

app.post("/api/reorder-campaigns", (req, res) => {
  try {
    const orderedIds = req.body.orderedIds;

    if (!Array.isArray(orderedIds)) {
      throw new Error("orderedIds non è un array.");
    }

    const file = fs.readFileSync(campaignsFile, "utf8");

    const campaigns = new Function(`
      ${file}
      return campaigns;
    `)();

    const reorderedCampaigns = orderedIds.map(id => {
      const campaign = campaigns.find(item => item.id === id);

      if (!campaign) {
        throw new Error(`Campagna non trovata: ${id}`);
      }

      return campaign;
    });

    const formattedCampaigns = JSON.stringify(reorderedCampaigns, null, 2)
      .replace(/"([^"]+)":/g, "$1:");

    const newFile = `const campaigns = ${formattedCampaigns};`;

    fs.writeFileSync(campaignsFile, newFile, "utf8");

    res.json({
      success: true
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message
    });

  }
});
app.post("/api/delete-campaign", (req, res) => {
  try {
    const id = req.body.id;

    if (!id) {
      throw new Error("ID campagna mancante.");
    }

    const file = fs.readFileSync(campaignsFile, "utf8");

    const campaigns = new Function(`
      ${file}
      return campaigns;
    `)();

    const campaignExists = campaigns.some(campaign => campaign.id === id);

    if (!campaignExists) {
      throw new Error(`Campagna non trovata: ${id}`);
    }

    const updatedCampaigns = campaigns.filter(campaign => campaign.id !== id);

    const formattedCampaigns = JSON.stringify(updatedCampaigns, null, 2)
      .replace(/"([^"]+)":/g, "$1:");

    const newFile = `const campaigns = ${formattedCampaigns};`;

    const campaignDir = path.join(__dirname, "assets", "campaigns", id);
    const trashDir = path.join(__dirname, "trash", "campaigns");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(trashDir, `${id}-${timestamp}`);
    const tempCampaignsFile = `${campaignsFile}.delete-${timestamp}.tmp`;
    let backupPath = null;

    fs.writeFileSync(tempCampaignsFile, newFile, "utf8");

    try {
      if (fs.existsSync(campaignDir)) {
        fs.mkdirSync(trashDir, { recursive: true });
        fs.renameSync(campaignDir, backupDir);
        backupPath = path.relative(__dirname, backupDir);
      }

      fs.renameSync(tempCampaignsFile, campaignsFile);
    } catch (moveErr) {
      if (backupPath && fs.existsSync(backupDir) && !fs.existsSync(campaignDir)) {
        fs.renameSync(backupDir, campaignDir);
      }

      if (fs.existsSync(tempCampaignsFile)) {
        fs.unlinkSync(tempCampaignsFile);
      }

      throw moveErr;
    }

    res.json({
      success: true,
      backupPath
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message
    });

  }
});
app.post("/api/publish", (req, res) => {
  const message = req.body.message || "CMS publish update";

  const safeMessage = message.replace(/"/g, "'");

const command = `
git diff --quiet &&
echo "__NOTHING_TO_PUBLISH__" ||
(git add . && git commit -m "${safeMessage}" && git push)
`;

  exec(command, { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({
        success: false,
        error: stderr || error.message,
        output: stdout
      });
      return;
    }

    if (stdout.includes("__NOTHING_TO_PUBLISH__")) {
  res.json({
    success: true,
    nothingToPublish: true
  });
  return;
}

res.json({
  success: true,
  output: stdout
});
  });
});
app.listen(PORT, () => {
  console.log(`RRS Admin running at http://localhost:${PORT}/admin.html`);
});
