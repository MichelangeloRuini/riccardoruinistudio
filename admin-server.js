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
    media.push(`"01".replace("01", "${pad(i)}") + ".jpg"`);
  }

  for (let i = 1; i <= videosCount; i++) {
    media.push(`"video-${pad(i)}.mp4"`);
  }

  return media
    .map(item => {
      if (item.includes("replace")) {
        const number = item.match(/"(\d+)"/)?.[1];
        return `"${number}.jpg"`;
      }

      return item;
    })
    .join(",\n    ");
}

app.post("/api/create-campaign", upload.array("files"), async (req, res) => {
  try {
    const client = req.body.client.trim();
    const title = req.body.title.trim();
    const folder = req.body.folder.trim() || slugify(`${client}-${title}`);
    const border = req.body.border === "true";
    const credits = req.body.credits || "";

    const campaignDir = path.join(__dirname, "assets", "campaigns", folder);

    if (!fs.existsSync(campaignDir)) {
      fs.mkdirSync(campaignDir, { recursive: true });
    }

    const imageFiles = req.files.filter(file =>
      [".jpg", ".jpeg", ".png"].includes(path.extname(file.originalname).toLowerCase())
    );

    const videoFiles = req.files.filter(file =>
      [".mp4"].includes(path.extname(file.originalname).toLowerCase())
    );

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

    const code = `{
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
},`;

    res.json({
      success: true,
      folder,
      images: imageFiles.length,
      videos: videoFiles.length,
      code
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`RRS Admin running at http://localhost:${PORT}/admin.html`);
});