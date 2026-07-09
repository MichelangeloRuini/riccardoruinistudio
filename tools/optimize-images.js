const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const campaignsDir = path.join(__dirname, "..", "assets", "campaigns");

async function optimizeImage(filePath) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);

  const webpPath = path.join(dir, `${base}.webp`);
  const thumbPath = path.join(dir, `${base}-thumb.webp`);

  if (fs.existsSync(webpPath) && fs.existsSync(thumbPath)) {
    console.log(`Already optimized: ${filePath}`);
    return;
  }

  await sharp(filePath)
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(webpPath);

  await sharp(filePath)
    .resize({ width: 80, withoutEnlargement: true })
    .blur(8)
    .webp({ quality: 45 })
    .toFile(thumbPath);

  console.log(`Optimized: ${filePath}`);
}

async function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath);
    }

    if (
      entry.isFile() &&
      [".jpg", ".jpeg"].includes(path.extname(entry.name).toLowerCase()) &&
      !entry.name.includes("-thumb")
    ) {
      await optimizeImage(fullPath);
    }
  }
}

walk(campaignsDir);