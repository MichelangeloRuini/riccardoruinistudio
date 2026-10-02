(function initializeFilmsGridRenderer(global) {
  "use strict";

  function getCampaignFilms(campaign) {
    if (Array.isArray(campaign.films) && campaign.films.length > 0) {
      return campaign.films;
    }

    return Array.isArray(campaign.media)
      ? campaign.media.filter(file => typeof file === "string" && file.toLowerCase().endsWith(".mp4"))
      : [];
  }

  function createTitle(campaign, className) {
    const title = document.createElement("span");
    const client = document.createElement("span");
    const project = document.createElement("span");

    title.className = className;
    client.className = `${className}-client`;
    project.className = `${className}-project`;
    client.textContent = campaign.client;
    project.textContent = campaign.title;
    title.append(client, project);

    return title;
  }

  function createFilmCard(record, openModal) {
    const card = document.createElement("button");
    const video = document.createElement("video");
    const overlay = document.createElement("span");

    card.type = "button";
    card.className = "films-card";
    card.setAttribute("aria-label", `Open ${record.campaign.client} — ${record.campaign.title}`);

    video.className = "films-card-video";
    video.src = record.source;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.controls = false;
    video.setAttribute("muted", "");
    video.setAttribute("loop", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "metadata");
    video.setAttribute("data-viewport-playback", "");
    video.setAttribute("aria-hidden", "true");
    video.tabIndex = -1;

    overlay.className = "films-card-overlay";
    overlay.appendChild(createTitle(record.campaign, "films-card-title"));
    card.append(video, overlay);
    card.addEventListener("click", () => openModal(record, card));

    return card;
  }

  function renderFilmsGrid(campaignRecords, grid, openModal) {
    const records = [];
    const fragment = document.createDocumentFragment();

    campaignRecords.forEach(campaign => {
      getCampaignFilms(campaign).forEach(file => {
        const record = {
          campaign,
          file,
          source: `${campaign.path}${file}`
        };

        records.push(record);
        fragment.appendChild(createFilmCard(record, openModal));
      });
    });

    grid.replaceChildren(fragment);
    return records;
  }

  global.RRSRenderFilmsGrid = renderFilmsGrid;
}(window));
