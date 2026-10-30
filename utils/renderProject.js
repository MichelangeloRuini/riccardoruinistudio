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
  const assetUrl = `${campaign.path}${file}`;

  if (isVideo) {
    return `
      <video
        class="campaign-media-item ${campaign.border ? "has-border" : ""}"
        data-viewport-playback
        muted
        loop
        playsinline
        controls
        preload="none"
      >
        <source data-viewport-media-src="${assetUrl}" type="video/mp4">
      </video>
    `;
  }

  const webp = file.replace(/\.(jpg|jpeg)$/i, ".webp");
  const webpAssetUrl = `${campaign.path}${webp}`;

  return `
    <picture>
      <source
        srcset="${RRSMedia.resolveSrcset(webpAssetUrl)}"
        data-media-srcset="${webpAssetUrl}"
        type="image/webp">

      <img
        class="campaign-media-item ${campaign.border ? "has-border" : ""}"
        src="${RRSMedia.resolve(assetUrl)}"
        data-media-src="${assetUrl}"
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
    <section class="campaign mobile-campaign-layout ${layout}">
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
