const projectParams = new URLSearchParams(window.location.search);
const selectedSection = projectParams.get("section") || "";
const selectedProjectId = projectParams.get("id") || "";
const projectCollection = Array.isArray(portfolioProjects) ? portfolioProjects : [];
const selectedProject = projectCollection.find(project =>
  project.section === selectedSection && project.id === selectedProjectId
);

const projectPage = document.getElementById("portfolioProjectPage");
const projectHeading = document.getElementById("portfolioProjectHeading");
const projectMedia = document.getElementById("portfolioProjectMedia");
const projectNotFound = document.getElementById("portfolioProjectNotFound");
const brandIdentityNavigationLink = document.querySelector(
  '[data-section-link="brand-identity"]'
);

if (selectedSection === "brand-identity") {
  brandIdentityNavigationLink.classList.add("active");
  brandIdentityNavigationLink.setAttribute("aria-current", "page");
}

if (!selectedProject) {
  projectPage.hidden = true;
  projectNotFound.hidden = false;
  document.title = "Project not found — Riccardo Ruini Studio";
} else {
  const label = getPortfolioProjectLabel(selectedProject);

  projectHeading.textContent = label;
  document.title = `${label} — Riccardo Ruini Studio`;
  renderPortfolioDetail(projectMedia, selectedProject);
}
