const brandIdentityProjects = Array.isArray(portfolioProjects)
  ? portfolioProjects.filter(project => project.section === "brand-identity")
  : [];

const brandIdentityLeftColumn = document.getElementById("brandIdentityLeftColumn");
const brandIdentityRightColumn = document.getElementById("brandIdentityRightColumn");

renderPortfolioColumns(
  brandIdentityLeftColumn,
  brandIdentityRightColumn,
  brandIdentityProjects
);
