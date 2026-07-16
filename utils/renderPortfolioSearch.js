function createPortfolioSearchMedia(project, filename) {
  const mediaType = getPortfolioMediaType(filename);
  const source = `${project.path || ""}${filename}`;
  const label = getPortfolioProjectLabel(project) || "Portfolio project";

  if (mediaType === "video") {
    const video = document.createElement("video");
    video.className = "campaign-media-item";
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = source;
    video.setAttribute("aria-label", label);
    return video;
  }

  if (mediaType === "image") {
    const image = document.createElement("img");
    image.className = "campaign-media-item";
    image.src = source;
    image.alt = label;
    image.loading = "lazy";
    image.decoding = "async";
    return image;
  }

  const unsupported = document.createElement("div");
  unsupported.className = "portfolio-unsupported-media";
  unsupported.textContent = `Unsupported media: ${filename}`;
  return unsupported;
}

function renderPortfolioSearchProject(project, index) {
  const section = document.createElement("section");
  const info = document.createElement("aside");
  const infoInner = document.createElement("div");
  const title = document.createElement("div");
  const detailLink = document.createElement("a");
  const media = document.createElement("div");

  section.className = `campaign portfolio-search-result ${index % 2 === 0 ? "info-left" : "info-right"}`;
  info.className = "campaign-info";
  infoInner.className = "campaign-info-inner";
  title.className = "campaign-title";
  detailLink.className = "portfolio-search-detail-link";
  detailLink.href = getPortfolioProjectUrl(project);
  detailLink.appendChild(document.createTextNode(project.client || ""));

  if (typeof project.title === "string" && project.title.trim()) {
    detailLink.appendChild(document.createElement("br"));
    detailLink.appendChild(document.createTextNode(project.title.trim()));
  }

  title.appendChild(detailLink);
  infoInner.appendChild(title);
  info.appendChild(infoInner);

  media.className = "campaign-media";
  (Array.isArray(project.media) ? project.media : []).forEach(filename => {
    media.appendChild(createPortfolioSearchMedia(project, filename));
  });

  section.append(info, media);
  return section;
}
