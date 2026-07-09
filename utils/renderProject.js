function createSearchLink(value) {
  return `<a class="credit-link" href="search.html?q=${encodeURIComponent(value)}">${value}</a>`;
}

function createCreditValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => createSearchLink(item)).join("<br>");
  }

  return createSearchLink(value);
}

function createCredits(campaign) {
  return campaign.credits
    .map(credit => `
      <div class="credit-group">
        <div class="credit-label">${credit.label}:</div>
        <div class="credit-value">${createCreditValue(credit.value)}</div>
      </div>
    `)
    .join("");
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

function renderProject(campaign, index, mediaFiles) {
  const layout = index % 2 === 0 ? "info-left" : "info-right";

  const credits = createCredits(campaign);

  const media = mediaFiles
    .map(file => createMediaElement(campaign, file))
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
        ${media}
      </div>
    </section>
  `;
}