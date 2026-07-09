const searchResults = document.getElementById("searchResults");
const searchTitle = document.getElementById("searchTitle");
const globalSearchInput = document.getElementById("globalSearchInput");

const params = new URLSearchParams(window.location.search);
const query = params.get("q") || "";

globalSearchInput.value = query;

function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function campaignSearchText(campaign) {
  const creditsText = campaign.credits
    .map(credit => {
      const value = Array.isArray(credit.value)
        ? credit.value.join(" ")
        : credit.value;

      return `${credit.label} ${value}`;
    })
    .join(" ");

  return normalize(`
    ${campaign.client}
    ${campaign.title}
    ${campaign.category}
    ${creditsText}
  `);
}

function renderSearch() {
  const cleanQuery = normalize(query.trim());

  if (!cleanQuery) {
    searchTitle.textContent = "SEARCH";
    searchResults.innerHTML = "";
    return;
  }

  const results = campaigns.filter(campaign =>
    campaignSearchText(campaign).includes(cleanQuery)
  );

  searchTitle.textContent = `${results.length} RESULTS FOR "${query.toUpperCase()}"`;

  if (results.length === 0) {
    searchResults.innerHTML = `<div class="no-results">NO RESULTS</div>`;
    return;
  }

  searchResults.innerHTML = results
    .map((campaign, index) => renderProject(campaign, index, campaign.media))
    .join("");
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