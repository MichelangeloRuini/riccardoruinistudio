const path = require("path");

const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function deepFreeze(value) {
  Object.freeze(value);

  Object.values(value).forEach(child => {
    if (child && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  });

  return value;
}

function createSectionConfig(projectRoot = path.resolve(__dirname, "..")) {
  const portfolioDataFile = path.resolve(projectRoot, "data", "portfolio-projects.js");

  return deepFreeze({
    campaigns: {
      key: "campaigns",
      label: "Campaigns",
      dataKind: "campaign",
      dataFile: path.resolve(projectRoot, "data", "campaigns.js"),
      collectionName: "campaigns",
      assetRoot: path.resolve(projectRoot, "assets", "campaigns"),
      publicAssetPrefix: "assets/campaigns/",
      trashRoot: path.resolve(projectRoot, "trash", "campaigns"),
      defaultCategory: "Campaigns",
      renderer: "campaign",
      publicPage: "campaigns.html",
      detailPage: null,
      detailMode: "inline",
      cmsEnabled: true
    },
    "brand-identity": {
      key: "brand-identity",
      label: "Visual Identity",
      dataKind: "portfolio",
      dataFile: portfolioDataFile,
      collectionName: "portfolioProjects",
      assetRoot: path.resolve(projectRoot, "assets", "identities"),
      publicAssetPrefix: "assets/identities/",
      trashRoot: path.resolve(projectRoot, "trash", "identities"),
      defaultCategory: "Visual Identity",
      renderer: "portfolio",
      publicPage: "brand-identity.html",
      detailPage: "project.html",
      detailMode: "query",
      cmsEnabled: true
    },
    "magazine-books": {
      key: "magazine-books",
      label: "Magazine and Books",
      dataKind: "portfolio",
      dataFile: portfolioDataFile,
      collectionName: "portfolioProjects",
      assetRoot: path.resolve(projectRoot, "assets", "books"),
      publicAssetPrefix: "assets/books/",
      trashRoot: path.resolve(projectRoot, "trash", "books"),
      defaultCategory: "Magazine and Books",
      renderer: "portfolio",
      publicPage: "magazine-books.html",
      detailPage: "project.html",
      detailMode: "query",
      cmsEnabled: false
    },
    branding: {
      key: "branding",
      label: "Branding",
      dataKind: "portfolio",
      dataFile: portfolioDataFile,
      collectionName: "portfolioProjects",
      assetRoot: path.resolve(projectRoot, "assets", "branding"),
      publicAssetPrefix: "assets/branding/",
      trashRoot: path.resolve(projectRoot, "trash", "branding"),
      defaultCategory: "Branding",
      renderer: "portfolio",
      publicPage: "branding.html",
      detailPage: "project.html",
      detailMode: "query",
      cmsEnabled: false
    }
  });
}

const SECTION_CONFIG = createSectionConfig();

function getSectionConfig(
  sectionKey,
  {
    config = SECTION_CONFIG,
    expectedDataKind = null,
    requireCmsEnabled = true
  } = {}
) {
  const normalizedKey = typeof sectionKey === "string" ? sectionKey.trim() : "";
  const hasSection = Object.prototype.hasOwnProperty.call(config, normalizedKey);
  const section = hasSection ? config[normalizedKey] : null;

  if (!section) {
    throw new Error("Unknown section.");
  }

  if (requireCmsEnabled && !section.cmsEnabled) {
    throw new Error("Section is not enabled in the CMS.");
  }

  if (expectedDataKind && section.dataKind !== expectedDataKind) {
    throw new Error("Section does not support this operation.");
  }

  return section;
}

function validateProjectSlug(projectId) {
  const normalizedId = typeof projectId === "string" ? projectId.trim() : "";

  if (!PROJECT_SLUG_PATTERN.test(normalizedId)) {
    throw new Error("Project ID must be a strict lowercase slug.");
  }

  return normalizedId;
}

function resolveFixedRootChild(rootDirectory, childName) {
  const resolvedRoot = path.resolve(rootDirectory);
  const resolvedChild = path.resolve(resolvedRoot, childName);

  if (path.dirname(resolvedChild) !== resolvedRoot) {
    throw new Error("Resolved path is outside its configured root.");
  }

  return resolvedChild;
}

function resolveProjectDirectory(section, projectId) {
  return resolveFixedRootChild(section.assetRoot, validateProjectSlug(projectId));
}

module.exports = {
  PROJECT_SLUG_PATTERN,
  SECTION_CONFIG,
  createSectionConfig,
  getSectionConfig,
  resolveFixedRootChild,
  resolveProjectDirectory,
  validateProjectSlug
};
