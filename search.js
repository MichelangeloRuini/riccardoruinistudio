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

function renderMagazinesBooksSearchResult(record, index) {
  const section = document.createElement("section");
  const info = document.createElement("aside");
  const infoInner = document.createElement("div");
  const title = document.createElement("div");
  const detailLink = document.createElement("a");
  const media = document.createElement("div");
  const video = document.createElement("video");

  section.className = `campaign magazines-books-search-result ${index % 2 === 0 ? "info-left" : "info-right"}`;
  info.className = "campaign-info";
  infoInner.className = "campaign-info-inner";
  title.className = "campaign-title";
  detailLink.className = "portfolio-search-detail-link";
  detailLink.href = RRSUnifiedSearch.getMagazinesBooksUrl(record);
  detailLink.textContent = record.title.trim();

  media.className = "campaign-media";
  video.className = "campaign-media-item";
  video.dataset.viewportPlayback = "";
  video.muted = true;
  video.loop = true;
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = record.video;
  video.setAttribute("aria-label", record.title.trim());

  title.appendChild(detailLink);
  infoInner.appendChild(title);
  info.appendChild(infoInner);
  media.appendChild(video);
  section.append(info, media);

  return section;
}

function renderSearch() {
  const cleanQuery = RRSUnifiedSearch.normalize(query.trim());

  RRSViewportVideoPlayback.unobserve(searchResults);

  if (!cleanQuery) {
    searchTitle.textContent = "SEARCH";
    searchResults.innerHTML = "";
    return;
  }

  const campaignRecords = typeof campaigns !== "undefined" ? campaigns : [];
  const portfolioRecords = typeof portfolioProjects !== "undefined"
    ? portfolioProjects
    : [];
  const magazinesBooksRecords = typeof magazinesBooks !== "undefined"
    ? magazinesBooks
    : [];
  const matchingCampaigns = campaignRecords.filter(campaign =>
    RRSUnifiedSearch.matches(campaign, "campaign", cleanQuery)
  );
  const matchingPortfolio = portfolioRecords.filter(project =>
    RRSUnifiedSearch.matches(project, "portfolio", cleanQuery)
  );
  const matchingMagazinesBooks = magazinesBooksRecords.filter(record =>
    RRSUnifiedSearch.matches(record, "magazines-books", cleanQuery)
  );
  const portfolioGroups = {
    "brand-identity": [],
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

  const totalResults = matchingCampaigns.length
    + matchingPortfolio.length
    + matchingMagazinesBooks.length;

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
    ["MAGAZINES & BOOKS", matchingMagazinesBooks, renderMagazinesBooksSearchResult],
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
  RRSViewportVideoPlayback.observe(searchResults);
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
