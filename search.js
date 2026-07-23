const searchResults = document.getElementById("searchResults");
const searchTitle = document.getElementById("searchTitle");
const globalSearchInput = document.getElementById("globalSearchInput");

const params = new URLSearchParams(window.location.search);
const query = params.get("q") || "";

globalSearchInput.value = query;

function getPortfolioGroupKey(section) {
  const key = RRSUnifiedSearch.normalize(section).replace(/[\s_-]+/g, "-");

  return key === "magazine-and-books" ? "magazine-books" : key;
}

function createResultGroup(heading, items, renderItem) {
  if (items.length === 0) return null;

  const group = document.createElement("section");
  const title = document.createElement("h2");

  group.className = "search-result-group";
  title.className = "search-result-group-heading";
  title.textContent = heading;
  group.appendChild(title);

  items.forEach((item, index) => {
    group.appendChild(renderItem(item, index));
  });

  return group;
}

function renderSearch() {
  const cleanQuery = RRSUnifiedSearch.normalize(query.trim());

  if (!cleanQuery) {
    searchTitle.textContent = "SEARCH";
    searchResults.innerHTML = "";
    return;
  }

  const campaignRecords = typeof campaigns !== "undefined" ? campaigns : [];
  const portfolioRecords = typeof portfolioProjects !== "undefined"
    ? portfolioProjects
    : [];
  const matchingCampaigns = campaignRecords.filter(campaign =>
    RRSUnifiedSearch.matches(campaign, "campaign", cleanQuery)
  );
  const matchingPortfolio = portfolioRecords.filter(project =>
    RRSUnifiedSearch.matches(project, "portfolio", cleanQuery)
  );
  const portfolioGroups = {
    "brand-identity": [],
    "magazine-books": [],
    branding: [],
    films: []
  };
  const otherPortfolioGroups = new Map();

  matchingPortfolio.forEach(project => {
    const groupKey = getPortfolioGroupKey(project.section);
    if (portfolioGroups[groupKey]) {
      portfolioGroups[groupKey].push(project);
      return;
    }

    if (!otherPortfolioGroups.has(groupKey)) otherPortfolioGroups.set(groupKey, []);
    otherPortfolioGroups.get(groupKey).push(project);
  });

  const totalResults = matchingCampaigns.length + matchingPortfolio.length;

  searchTitle.textContent = `${totalResults} RESULTS FOR "${query.toUpperCase()}"`;

  if (totalResults === 0) {
    const noResults = document.createElement("div");
    noResults.className = "no-results";
    noResults.textContent = "NO RESULTS";
    searchResults.replaceChildren(noResults);
    return;
  }

  const groupDefinitions = [
    ["VISUAL IDENTITY", portfolioGroups["brand-identity"], renderPortfolioSearchProject],
    ["MAGAZINE AND BOOKS", portfolioGroups["magazine-books"], renderPortfolioSearchProject],
    ["BRANDING", portfolioGroups.branding, renderPortfolioSearchProject],
    ["CAMPAIGNS", matchingCampaigns, (campaign, index) => {
      const safeCampaign = {
        ...campaign,
        credits: Array.isArray(campaign.credits) ? campaign.credits : [],
        media: Array.isArray(campaign.media) ? campaign.media : []
      };
      const template = document.createElement("template");
      template.innerHTML = renderProject(safeCampaign, index, safeCampaign.media);
      return template.content.firstElementChild;
    }],
    ["FILMS", portfolioGroups.films, renderPortfolioSearchProject]
  ];

  otherPortfolioGroups.forEach((items, section) => {
    groupDefinitions.push([
      RRSUnifiedSearch.formatSection(section).toUpperCase(),
      items,
      renderPortfolioSearchProject
    ]);
  });
  const fragment = document.createDocumentFragment();

  groupDefinitions.forEach(([heading, items, renderItem]) => {
    const group = createResultGroup(heading, items, renderItem);
    if (group) fragment.appendChild(group);
  });

  searchResults.replaceChildren(fragment);
}

globalSearchInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    const value = globalSearchInput.value.trim();

    if (value) {
      window.location.href = `search.html?q=${encodeURIComponent(value)}`;
    }
  }
});

renderSearch();
