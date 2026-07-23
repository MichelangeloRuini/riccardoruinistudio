function getPortfolioProjectLabel(project) {
  return [project.client, project.title]
    .map(value => typeof value === "string" ? value.trim() : "")
    .filter(Boolean)
    .join(" — ");
}

function getPortfolioProjectUrl(project) {
  const params = new URLSearchParams({
    section: project.section,
    id: project.id
  });

  return `project.html?${params.toString()}`;
}

function showPortfolioImageFallback(image, fallback, parent) {
  image.hidden = true;
  fallback.hidden = false;
  parent.classList.add("has-missing-image");
}

function createPortfolioProjectCard(project) {
  const article = document.createElement("article");
  const link = document.createElement("a");
  const figure = document.createElement("figure");
  const visual = document.createElement("div");
  const image = document.createElement("img");
  const fallback = document.createElement("div");
  const caption = document.createElement("figcaption");
  const captionInfo = document.createElement("div");
  const client = document.createElement("span");
  const title = document.createElement("span");
  const viewLabel = document.createElement("span");
  const label = getPortfolioProjectLabel(project);

  article.className = "portfolio-card";
  link.className = "portfolio-card-link";
  link.href = getPortfolioProjectUrl(project);
  link.setAttribute("aria-label", `View ${label || "project"}`);

  visual.className = "portfolio-card-visual";
  image.src = `${project.path}${project.cover}`;
  image.alt = label || "Portfolio project";
  image.loading = "lazy";
  image.decoding = "async";

  fallback.className = "portfolio-image-fallback";
  fallback.textContent = "Image coming soon";
  fallback.hidden = true;

  caption.className = "portfolio-card-caption";
  captionInfo.className = "portfolio-card-caption-info";
  client.className = "portfolio-card-client";
  client.textContent = project.client;
  title.className = "portfolio-card-title";
  title.textContent = project.title;
  viewLabel.className = "portfolio-card-view";
  viewLabel.textContent = "VIEW ↗";

  captionInfo.appendChild(client);
  if (typeof project.title === "string" && project.title.trim()) {
    captionInfo.appendChild(title);
  }
  caption.append(captionInfo, viewLabel);

  image.addEventListener("error", () => {
    showPortfolioImageFallback(image, fallback, visual);
  }, { once: true });

  visual.append(image, fallback);
  figure.append(visual, caption);
  link.appendChild(figure);
  article.appendChild(link);

  return article;
}

function renderPortfolioColumns(leftColumn, rightColumn, projects) {
  projects.forEach((project, index) => {
    const card = createPortfolioProjectCard(project);

    // The introduction already occupies the first left position, so the first
    // project starts on the right and subsequent projects alternate columns.
    const targetColumn = index % 2 === 0 ? rightColumn : leftColumn;
    targetColumn.appendChild(card);
  });
}

function getPortfolioMediaType(filename) {
  const normalizedFilename = String(filename).toLowerCase();

  if (/\.(jpe?g|png|webp)$/.test(normalizedFilename)) return "image";
  if (/\.mp4$/.test(normalizedFilename)) return "video";

  return "unsupported";
}

function createPortfolioDetailMedia(project, filename) {
  const item = document.createElement("figure");
  const mediaType = getPortfolioMediaType(filename);
  const label = getPortfolioProjectLabel(project);

  item.className = "portfolio-detail-media-item";

  if (mediaType === "video") {
    const video = document.createElement("video");

    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = `${project.path}${filename}`;
    video.setAttribute("aria-label", label || "Project video");
    item.appendChild(video);
    return item;
  }

  if (mediaType === "image") {
    const image = document.createElement("img");
    const fallback = document.createElement("div");

    image.src = `${project.path}${filename}`;
    image.alt = label || "Portfolio project image";
    image.loading = "lazy";
    image.decoding = "async";

    fallback.className = "portfolio-image-fallback portfolio-detail-fallback";
    fallback.textContent = "Image unavailable";
    fallback.hidden = true;

    image.addEventListener("error", () => {
      showPortfolioImageFallback(image, fallback, item);
    }, { once: true });

    item.append(image, fallback);
    return item;
  }

  const unsupported = document.createElement("div");
  unsupported.className = "portfolio-unsupported-media";
  unsupported.textContent = `Unsupported media: ${filename}`;
  item.appendChild(unsupported);

  return item;
}

function renderPortfolioDetail(container, project) {
  const fragment = document.createDocumentFragment();

  project.media.forEach(filename => {
    fragment.appendChild(createPortfolioDetailMedia(project, filename));
  });

  container.replaceChildren(fragment);
}
