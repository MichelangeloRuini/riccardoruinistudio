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

function createMediaElement(campaign, file) {
  const source = campaign.path + file;
  const isVideo = file.toLowerCase().endsWith(".mp4");

  if (isVideo) {
    return `
      <video
        class="campaign-media-item ${campaign.border ? "has-border" : ""}"
        autoplay
        muted
        loop
        playsinline
        controls
      >
        <source src="${source}" type="video/mp4">
      </video>
    `;
  }

  return `
    <img
      class="campaign-media-item ${campaign.border ? "has-border" : ""}"
      src="${source}"
      alt="${campaign.client} ${campaign.title}"
    >
  `;
}

function createCampaign(campaign, index) {
  const layout = index % 2 === 0 ? "info-left" : "info-right";

  const credits = campaign.credits
    .map(credit => {
      const values = Array.isArray(credit.value)
        ? credit.value.join("<br>")
        : credit.value;

      return `
        <div class="credit-group">
          <div class="credit-label">${credit.label}:</div>
          <div class="credit-value">${values}</div>
        </div>
      `;
    })
    .join("");

  const media = campaign.media
    .map(file => createMediaElement(campaign, file))
    .join("");

  return `
    <section class="campaign ${layout}">
      <aside class="campaign-info">
        <div class="campaign-info-inner">
          <div class="campaign-title">
            ${campaign.client}<br>
            ${campaign.title}
          </div>

          <div class="campaign-credits">
            ${credits}
          </div>
        </div>
      </aside>

      <div class="campaign-media">
        ${media}
      </div>
    </section>
  `;
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

  searchResults.innerHTML = results.map(createCampaign).join("");
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