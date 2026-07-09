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
        preload="metadata"
      >
        <source src="${campaign.path}${file}" type="video/mp4">
      </video>
    `;
  }

  const webp = file.replace(/\.(jpg|jpeg)$/i, ".webp");

  return `
    <picture>
      <source
        srcset="${campaign.path}${webp}"
        type="image/webp">

      <img
        class="campaign-media-item ${campaign.border ? "has-border" : ""}"
        src="${campaign.path}${file}"
        alt="${campaign.client} ${campaign.title}"
        loading="lazy"
        decoding="async">
    </picture>
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