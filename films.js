const filmsPage = document.getElementById("filmsPage");

function getCampaignFilms(campaign) {
  if (campaign.films && campaign.films.length > 0) {
    return campaign.films;
  }

  return campaign.media.filter(file =>
    file.toLowerCase().endsWith(".mp4")
  );
}

filmsPage.innerHTML = campaigns
  .map((campaign, index) => {
    const videoFiles = getCampaignFilms(campaign);

    if (videoFiles.length === 0) return "";

    return renderProject(campaign, index, videoFiles);
  })
  .join("");