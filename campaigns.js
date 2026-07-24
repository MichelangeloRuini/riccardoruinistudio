const campaignsPage = document.getElementById("campaignsPage");

RRSViewportVideoPlayback.unobserve(campaignsPage);
campaignsPage.innerHTML = campaigns
  .map((campaign, index) => renderProject(campaign, index, campaign.media))
  .join("");
RRSViewportVideoPlayback.observe(campaignsPage);
