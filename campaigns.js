const campaignsPage = document.getElementById("campaignsPage");

campaignsPage.innerHTML = campaigns
  .map((campaign, index) => renderProject(campaign, index, campaign.media))
  .join("");