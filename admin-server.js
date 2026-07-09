const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

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

app.listen(PORT, () => {
  console.log(`RRS Admin running at http://localhost:${PORT}/admin.html`);
});