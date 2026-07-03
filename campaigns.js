const campaignsPage = document.getElementById("campaignsPage");

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

function createCampaign(campaign) {

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

        <section class="campaign ${campaign.layout}">

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

campaignsPage.innerHTML = campaigns
    .map(createCampaign)
    .join("");