const filmsPage = document.getElementById("filmsPage");

function createFilmElement(campaign, file) {
  return `
    <video
      class="campaign-media-item ${campaign.border ? "has-border" : ""}"
      autoplay
      muted
      loop
      playsinline
      controls
    >
      <source src="${campaign.path}${file}" type="video/mp4">
    </video>
  `;
}

function createSearchLink(value) {
  return `<a class="credit-link" href="search.html?q=${encodeURIComponent(value)}">${value}</a>`;
}

function createCreditValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => createSearchLink(item)).join("<br>");
  }

  return createSearchLink(value);
}

function getCampaignFilms(campaign) {
  if (campaign.films && campaign.films.length > 0) {
    return campaign.films;
  }

  return campaign.media.filter(file =>
    file.toLowerCase().endsWith(".mp4")
  );
}

function createFilmCampaign(campaign, index) {
  const videoFiles = getCampaignFilms(campaign);

  if (videoFiles.length === 0) return "";

  const layout = index % 2 === 0 ? "info-left" : "info-right";

  const credits = campaign.credits
    .map(credit => `
      <div class="credit-group">
        <div class="credit-label">${credit.label}:</div>
        <div class="credit-value">${createCreditValue(credit.value)}</div>
      </div>
    `)
    .join("");

  const videos = videoFiles
    .map(file => createFilmElement(campaign, file))
    .join("");

  return `
    <section class="campaign ${layout}">
      <aside class="campaign-info">
        <div class="campaign-info-inner">
          <div class="campaign-title">
            <a href="search.html?q=${encodeURIComponent(campaign.client)}">${campaign.client}</a><br>
            <a href="search.html?q=${encodeURIComponent(campaign.title)}">${campaign.title}</a>
          </div>

          <div class="campaign-credits">
            ${credits}
          </div>
        </div>
      </aside>

      <div class="campaign-media">
        ${videos}
      </div>
    </section>
  `;
}

filmsPage.innerHTML = campaigns.map(createFilmCampaign).join("");