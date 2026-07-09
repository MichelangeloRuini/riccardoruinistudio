const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

const upload = multer({ dest: "temp-upload/" });

const campaignsFile = path.join(__dirname, "data", "campaigns.js");

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
    console.error(error);

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
