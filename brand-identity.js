const brandIdentityProjects = Array.isArray(portfolioProjects)
  ? portfolioProjects.filter(project => project.section === "brand-identity")
  : [];

const brandIdentityGrid = document.getElementById("brandIdentityGrid");
const brandIdentityFragment = document.createDocumentFragment();

brandIdentityProjects.forEach(project => {
  brandIdentityFragment.appendChild(createPortfolioProjectCard(project));
});

brandIdentityGrid.replaceChildren(brandIdentityFragment);
