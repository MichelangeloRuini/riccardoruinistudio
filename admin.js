function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function createMedia(images, videos) {
  const media = [];

  for (let i = 1; i <= images; i++) {
    media.push(`"${String(i).padStart(2, "0")}.jpg"`);
  }

  for (let i = 1; i <= videos; i++) {
    media.push(`"video-${String(i).padStart(2, "0")}.mp4"`);
  }

  return media.join(",\n    ");
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
        .map(v => v.trim())
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
        ${cleanValues.map(v => `"${v}"`).join(",\n        ")}
      ]
    }`;
    })
    .filter(Boolean)
    .join(",\n");
}

document.getElementById("generate").addEventListener("click", () => {
  const client = document.getElementById("client").value.trim();
  const title = document.getElementById("title").value.trim();
  const folder = document.getElementById("folder").value.trim() || slugify(`${client}-${title}`);
  const border = document.getElementById("border").value;
  const credits = document.getElementById("credits").value;
  const images = Number(document.getElementById("images").value || 0);
  const videos = Number(document.getElementById("videos").value || 0);

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
    ${createMedia(images, videos)}
  ]
},`;

  document.getElementById("output").value = code;
});

document.getElementById("copy").addEventListener("click", () => {
  const output = document.getElementById("output");
  output.select();
  document.execCommand("copy");
});