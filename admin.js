const generateButton = document.getElementById("generate");
const copyButton = document.getElementById("copy");
const output = document.getElementById("output");
const saveEditButton = document.getElementById("saveEdit");
const cancelEditButton = document.getElementById("cancelEdit");
const saveMediaOrderButton = document.getElementById("saveMediaOrder");

const campaignsList = document.getElementById("campaignsList");
const refreshCampaignsButton = document.getElementById("refreshCampaigns");
const saveCampaignOrderButton = document.getElementById("saveCampaignOrder");
const publishButton = document.getElementById("publishSite");

const clientInput = document.getElementById("client");
const titleInput = document.getElementById("title");
const folderInput = document.getElementById("folder");

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("files");
const preview = document.getElementById("preview");
const newCampaignMediaSection = document.getElementById("newCampaignMediaSection");
const existingMediaSection = document.getElementById("existingMediaSection");
const existingMediaGallery = document.getElementById("existingMediaGallery");
const editMediaDropzone = document.getElementById("editMediaDropzone");
const editMediaFileInput = document.getElementById("editMediaFiles");
const editMediaPreview = document.getElementById("editMediaPreview");
const saveAddedMediaButton = document.getElementById("saveAddedMedia");
const removeMediaSummary = document.getElementById("removeMediaSummary");
const saveRemovedMediaButton = document.getElementById("saveRemovedMedia");

let editingCampaignId = null;
let editingCampaign = null;
let originalExistingMediaOrder = [];
let existingMediaOrder = [];
let draggedExistingMediaIndex = null;
let stagedEditMediaFiles = [];
let stagedEditMediaUrls = [];
let isAddingCampaignMedia = false;
let pendingRemovedMedia = new Set();
let isRemovingCampaignMedia = false;
let folderEditedManually = false;
let selectedFiles = [];

function formatCreditsForEdit(credits) {
  if (!Array.isArray(credits)) return "";

  return credits.map(credit => {
    if (Array.isArray(credit.value)) {
      return `${credit.label}: ${credit.value.join(", ")}`;
    }

    return `${credit.label}: ${credit.value}`;
  }).join("\n");
}

function clearExistingMediaGallery() {
  clearStagedEditMediaFiles();
  clearPendingMediaRemovals();
  existingMediaGallery.innerHTML = "";
  existingMediaSection.hidden = true;
  saveMediaOrderButton.hidden = true;
  saveMediaOrderButton.disabled = true;
  editingCampaign = null;
  originalExistingMediaOrder = [];
  existingMediaOrder = [];
  draggedExistingMediaIndex = null;
}

function mediaOrdersMatch(firstOrder, secondOrder) {
  return firstOrder.length === secondOrder.length &&
    firstOrder.every((filename, index) => filename === secondOrder[index]);
}

function updateSaveMediaOrderButton() {
  saveMediaOrderButton.disabled = isAddingCampaignMedia ||
    isRemovingCampaignMedia ||
    !editingCampaignId ||
    mediaOrdersMatch(existingMediaOrder, originalExistingMediaOrder);
}

function clearExistingMediaDragState() {
  existingMediaGallery.querySelectorAll(".is-dragging, .is-drag-target")
    .forEach(item => item.classList.remove("is-dragging", "is-drag-target"));
}

function showExistingMediaFallback(previewElement, mediaElement) {
  mediaElement.remove();
  previewElement.querySelector(".existing-media-fallback").hidden = false;
}

function renderExistingMediaGallery(campaign, mediaItems = campaign.media) {
  existingMediaGallery.innerHTML = "";

  const orderedMedia = Array.isArray(mediaItems) ? mediaItems : [];

  if (!orderedMedia.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "existing-media-empty";
    emptyState.textContent = "No existing media found for this campaign.";
    existingMediaGallery.appendChild(emptyState);
    existingMediaSection.hidden = false;
    return;
  }

  orderedMedia.forEach((filename, index) => {
    const normalizedFilename = String(filename);
    const isImage = /\.(jpe?g|png|webp)$/i.test(normalizedFilename);
    const isVideo = /\.mp4$/i.test(normalizedFilename);
    const mediaType = isImage ? "Image" : isVideo ? "Video" : "Unknown";
    const item = document.createElement("article");
    const previewElement = document.createElement("div");
    const fallback = document.createElement("div");
    const details = document.createElement("div");
    const position = document.createElement("span");
    const type = document.createElement("span");
    const storedFilename = document.createElement("code");
    const removeButton = document.createElement("button");
    const isPendingRemoval = pendingRemovedMedia.has(normalizedFilename);

    item.className = "existing-media-item";
    item.classList.toggle("is-pending-removal", isPendingRemoval);
    item.draggable = true;
    item.dataset.mediaIndex = index;

    item.addEventListener("dragstart", event => {
      draggedExistingMediaIndex = index;
      item.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", normalizedFilename);
    });

    item.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearExistingMediaDragState();
      item.classList.add("is-drag-target");

      const draggingItem = existingMediaGallery.querySelector(
        `[data-media-index="${draggedExistingMediaIndex}"]`
      );

      if (draggingItem) draggingItem.classList.add("is-dragging");
    });

    item.addEventListener("drop", event => {
      event.preventDefault();

      if (draggedExistingMediaIndex === null || draggedExistingMediaIndex === index) {
        clearExistingMediaDragState();
        return;
      }

      const movedFilename = existingMediaOrder.splice(draggedExistingMediaIndex, 1)[0];
      existingMediaOrder.splice(index, 0, movedFilename);
      draggedExistingMediaIndex = null;

      renderExistingMediaGallery(campaign, existingMediaOrder);
      updateSaveMediaOrderButton();
    });

    item.addEventListener("dragend", () => {
      draggedExistingMediaIndex = null;
      clearExistingMediaDragState();
    });

    previewElement.className = "existing-media-preview";
    fallback.className = "existing-media-fallback";
    fallback.textContent = "Preview unavailable";
    fallback.hidden = true;

    if (isImage) {
      const image = document.createElement("img");
      const previewFilename = normalizedFilename.replace(/\.[^.]+$/, ".webp");

      image.src = `${campaign.path}${previewFilename}`;
      image.alt = `Preview of ${normalizedFilename}`;
      image.addEventListener("error", () => {
        showExistingMediaFallback(previewElement, image);
      }, { once: true });
      previewElement.appendChild(image);
    } else if (isVideo) {
      const video = document.createElement("video");

      video.src = `${campaign.path}${normalizedFilename}`;
      video.controls = true;
      video.preload = "metadata";
      video.addEventListener("error", () => {
        showExistingMediaFallback(previewElement, video);
      }, { once: true });
      previewElement.appendChild(video);
    } else {
      fallback.textContent = "Unsupported media type";
      fallback.hidden = false;
    }

    previewElement.appendChild(fallback);

    details.className = "existing-media-details";
    position.textContent = `Position ${index + 1}`;
    type.textContent = mediaType;
    storedFilename.textContent = normalizedFilename;

    removeButton.type = "button";
    removeButton.draggable = false;
    removeButton.className = "existing-media-remove";
    removeButton.classList.toggle("is-undo", isPendingRemoval);
    removeButton.textContent = isPendingRemoval ? "Undo" : "Remove";
    removeButton.title = isPendingRemoval
      ? `Undo removal of ${normalizedFilename}`
      : `Mark ${normalizedFilename} for removal`;
    removeButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      if (isAddingCampaignMedia || isRemovingCampaignMedia) return;

      if (pendingRemovedMedia.has(normalizedFilename)) {
        pendingRemovedMedia.delete(normalizedFilename);
      } else {
        pendingRemovedMedia.add(normalizedFilename);
      }

      renderExistingMediaGallery(campaign, existingMediaOrder);
      updatePendingRemovalControls();
    });

    details.appendChild(position);
    details.appendChild(type);
    details.appendChild(storedFilename);
    item.appendChild(previewElement);
    item.appendChild(details);
    item.appendChild(removeButton);
    existingMediaGallery.appendChild(item);
  });

  existingMediaSection.hidden = false;
}

function clearStagedEditMediaUrls() {
  stagedEditMediaUrls.forEach(fileUrl => URL.revokeObjectURL(fileUrl));
  stagedEditMediaUrls = [];
}

function updateSaveAddedMediaButton() {
  saveAddedMediaButton.disabled = isAddingCampaignMedia ||
    isRemovingCampaignMedia ||
    !editingCampaignId ||
    stagedEditMediaFiles.length === 0;
}

function updatePendingRemovalControls() {
  let imageCount = 0;
  let videoCount = 0;

  pendingRemovedMedia.forEach(filename => {
    if (/\.mp4$/i.test(filename)) {
      videoCount++;
    } else {
      imageCount++;
    }
  });

  removeMediaSummary.textContent =
    `Pending removal: ${imageCount} images · ${videoCount} videos`;
  saveRemovedMediaButton.disabled = isAddingCampaignMedia ||
    isRemovingCampaignMedia ||
    !editingCampaignId ||
    pendingRemovedMedia.size === 0;
}

function clearPendingMediaRemovals() {
  pendingRemovedMedia = new Set();
  updatePendingRemovalControls();
}

function setAddMediaBusy(isBusy) {
  isAddingCampaignMedia = isBusy;
  editMediaDropzone.classList.toggle("is-disabled", isBusy);
  editMediaPreview.classList.toggle("is-disabled", isBusy);
  existingMediaGallery.classList.toggle("is-disabled", isBusy);
  cancelEditButton.disabled = isBusy;
  saveEditButton.disabled = isBusy;

  if (isBusy) {
    saveMediaOrderButton.disabled = true;
  } else {
    updateSaveMediaOrderButton();
  }

  updateSaveAddedMediaButton();
  updatePendingRemovalControls();
}

function setRemoveMediaBusy(isBusy) {
  isRemovingCampaignMedia = isBusy;
  existingMediaGallery.classList.toggle("is-disabled", isBusy);
  editMediaDropzone.classList.toggle("is-disabled", isBusy);
  editMediaPreview.classList.toggle("is-disabled", isBusy);
  cancelEditButton.disabled = isBusy;
  saveEditButton.disabled = isBusy;

  if (isBusy) {
    saveMediaOrderButton.disabled = true;
  } else {
    updateSaveMediaOrderButton();
  }

  updateSaveAddedMediaButton();
  updatePendingRemovalControls();
}

function clearStagedEditMediaFiles() {
  clearStagedEditMediaUrls();
  stagedEditMediaFiles = [];
  editMediaPreview.innerHTML = "";
  editMediaFileInput.value = "";
  updateSaveAddedMediaButton();
}

function isAllowedEditMediaFile(file) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png"].includes(extension) &&
    ["image/jpeg", "image/png"].includes(file.type);
  const isVideo = extension === ".mp4" && file.type === "video/mp4";

  return isImage || isVideo;
}

function renderStagedEditMediaPreview() {
  clearStagedEditMediaUrls();
  editMediaPreview.innerHTML = "";

  stagedEditMediaFiles.forEach((file, index) => {
    const item = document.createElement("article");
    const mediaWrapper = document.createElement("div");
    const removeButton = document.createElement("button");
    const details = document.createElement("div");
    const position = document.createElement("span");
    const type = document.createElement("span");
    const name = document.createElement("code");
    const fileUrl = URL.createObjectURL(file);

    stagedEditMediaUrls.push(fileUrl);
    item.className = "edit-media-preview-item";
    mediaWrapper.className = "edit-media-preview-visual";

    if (file.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.src = fileUrl;
      image.alt = `Preview of ${file.name}`;
      mediaWrapper.appendChild(image);
    } else {
      const video = document.createElement("video");
      video.src = fileUrl;
      video.controls = true;
      video.preload = "metadata";
      mediaWrapper.appendChild(video);
    }

    removeButton.type = "button";
    removeButton.className = "edit-media-preview-remove";
    removeButton.textContent = "×";
    removeButton.title = `Remove ${file.name}`;
    removeButton.addEventListener("click", () => {
      if (isAddingCampaignMedia) return;
      stagedEditMediaFiles.splice(index, 1);
      renderStagedEditMediaPreview();
    });

    details.className = "edit-media-preview-details";
    position.textContent = `Append ${index + 1}`;
    type.textContent = file.type === "video/mp4" ? "Video" : "Image";
    name.textContent = file.name;

    details.appendChild(position);
    details.appendChild(type);
    details.appendChild(name);
    item.appendChild(mediaWrapper);
    item.appendChild(removeButton);
    item.appendChild(details);
    editMediaPreview.appendChild(item);
  });

  updateSaveAddedMediaButton();
}

function addStagedEditMediaFiles(files) {
  if (isAddingCampaignMedia) return;

  const allowedFiles = [...files].filter(isAllowedEditMediaFile);

  stagedEditMediaFiles.push(...allowedFiles);
  renderStagedEditMediaPreview();

  if (allowedFiles.length !== files.length) {
    output.value = "Some files were skipped. Use JPG, PNG, or MP4 files with matching MIME types.";
  }
}

async function loadCampaigns() {
  campaignsList.innerHTML = "Loading campaigns...";

  try {
    const response = await fetch("/api/campaigns");
    const result = await response.json();

    if (!result.success) {
      campaignsList.innerHTML = `ERROR: ${result.error}`;
      return;
    }

    if (!result.campaigns.length) {
      campaignsList.innerHTML = "No campaigns found.";
      return;
    }

    campaignsList.innerHTML = "";

    result.campaigns.forEach((campaign, index) => {
      const item = document.createElement("div");
      item.className = "campaign-row";
      item.draggable = true;
      item.dataset.id = campaign.id;

      item.addEventListener("dragstart", () => {
        item.classList.add("is-dragging");
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("is-dragging");
      });

      item.addEventListener("dragover", (event) => {
        event.preventDefault();
      });

      item.addEventListener("drop", (event) => {
        event.preventDefault();

        const draggingItem = document.querySelector(".campaign-row.is-dragging");

        if (!draggingItem || draggingItem === item) return;

        const allItems = [...campaignsList.querySelectorAll(".campaign-row")];
        const draggingIndex = allItems.indexOf(draggingItem);
        const targetIndex = allItems.indexOf(item);

        if (draggingIndex < targetIndex) {
          item.after(draggingItem);
        } else {
          item.before(draggingItem);
        }
      });

      const images = campaign.media.filter(file => file.endsWith(".jpg") || file.endsWith(".webp")).length;
      const videos = campaign.media.filter(file => file.endsWith(".mp4")).length;

      item.innerHTML = `
        <img
          class="campaign-thumb"
          src="assets/campaigns/${campaign.id}/01.webp"
          onerror="this.src='assets/admin/no-preview.jpg'"
        >

        <div class="campaign-row-info">
          <strong>${campaign.client}</strong>
          <span>${campaign.title}</span>
          <small>${images} images · ${videos} videos</small>
        </div>

        <div class="campaign-row-actions">
          <button type="button" title="Move up">⬆</button>
          <button type="button" title="Move down">⬇</button>
          <button type="button" class="edit-campaign" data-id="${campaign.id}" title="Edit">✏️</button>
          <button type="button" class="duplicate-campaign" data-id="${campaign.id}" title="Duplicate">⧉</button>
          <button type="button" class="delete-campaign" data-id="${campaign.id}" title="Delete">🗑️</button>
        </div>
      `;

      campaignsList.appendChild(item);

      const editButton = item.querySelector(".edit-campaign");
      const duplicateButton = item.querySelector(".duplicate-campaign");
      const deleteButton = item.querySelector(".delete-campaign");

      editButton.addEventListener("click", () => {
        if (isAddingCampaignMedia) return;

        clientInput.value = campaign.client;
        titleInput.value = campaign.title;
        folderInput.value = campaign.id;
        folderInput.disabled = true;
        document.getElementById("credits").value = formatCreditsForEdit(campaign.credits);

        if (document.getElementById("border")) {
          document.getElementById("border").value = campaign.border ? "true" : "false";
        }

        editingCampaignId = campaign.id;
        editingCampaign = campaign;
        originalExistingMediaOrder = [...campaign.media];
        existingMediaOrder = [...campaign.media];
        clearStagedEditMediaFiles();
        clearPendingMediaRemovals();
        newCampaignMediaSection.hidden = true;
        renderExistingMediaGallery(campaign, existingMediaOrder);

        generateButton.hidden = true;
        saveEditButton.hidden = false;
        cancelEditButton.hidden = false;
        saveMediaOrderButton.hidden = false;
        updateSaveMediaOrderButton();

        output.value = `Editing campaign: ${campaign.client} — ${campaign.title}`;
      });

      duplicateButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
          `Duplicate campaign "${campaign.client} - ${campaign.title}"?`
        );

        if (!confirmed) return;

        try {
          output.value = `Duplicating campaign: ${campaign.client} - ${campaign.title}`;

          const response = await fetch("/api/duplicate-campaign", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              id: campaign.id
            })
          });

          const result = await response.json();

          if (!result.success) {
            output.value = "ERROR: " + result.error;
            return;
          }

          output.value =
            `Campaign duplicated.\n\n` +
            `New ID: ${result.campaign.id}\n` +
            `Title: ${result.campaign.title}`;

          await loadCampaigns();
        } catch (error) {
          output.value = "JS ERROR: " + error.message;
          console.error(error);
        }
      });

      deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
          `Delete campaign "${campaign.client} - ${campaign.title}"?\n\n` +
          "Its folder will be moved to trash/campaigns, not permanently deleted."
        );

        if (!confirmed) return;

        try {
          output.value = `Deleting campaign: ${campaign.client} - ${campaign.title}`;

          const response = await fetch("/api/delete-campaign", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              id: campaign.id
            })
          });

          const result = await response.json();

          if (!result.success) {
            output.value = "ERROR: " + result.error;
            return;
          }

          output.value = result.backupPath
            ? `Campaign deleted. Folder moved to ${result.backupPath}.`
            : "Campaign deleted. No campaign folder was found to back up.";

          await loadCampaigns();
        } catch (error) {
          output.value = "JS ERROR: " + error.message;
          console.error(error);
        }
      });
    });
  } catch (error) {
    campaignsList.innerHTML = `JS ERROR: ${error.message}`;
    console.error(error);
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function updateFolder() {
  if (folderEditedManually || folderInput.disabled) return;

  const client = slugify(clientInput.value);
  const title = slugify(titleInput.value);

  folderInput.value = [client, title].filter(Boolean).join("-");
}

folderInput.addEventListener("input", () => {
  folderEditedManually = true;
});

clientInput.addEventListener("input", updateFolder);
titleInput.addEventListener("input", updateFolder);

function addFiles(files) {
  for (const file of files) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) continue;

    selectedFiles.push(file);
  }

  renderPreview();
}

function renderPreview() {
  preview.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "preview-item";
    item.draggable = true;

    item.addEventListener("dragstart", () => {
      item.classList.add("is-dragging");
      item.dataset.dragIndex = index;
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("is-dragging");
    });

    item.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    item.addEventListener("drop", (event) => {
      event.preventDefault();

      const draggingItem = document.querySelector(".preview-item.is-dragging");
      if (!draggingItem) return;

      const fromIndex = Number(draggingItem.dataset.dragIndex);
      const movedFile = selectedFiles.splice(fromIndex, 1)[0];
      selectedFiles.splice(index, 0, movedFile);

      renderPreview();
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "preview-remove";
    removeButton.innerText = "×";

    removeButton.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderPreview();
    });

    const fileUrl = URL.createObjectURL(file);

    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = fileUrl;
      item.appendChild(img);
    }

    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = fileUrl;
      video.muted = true;
      video.controls = true;
      item.appendChild(video);
    }

    const name = document.createElement("p");
    name.innerText = file.name;

    item.appendChild(removeButton);
    item.appendChild(name);
    preview.appendChild(item);
  });
}

dropzone.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragover");

  addFiles(event.dataTransfer.files);
});

editMediaDropzone.addEventListener("click", () => {
  if (isAddingCampaignMedia) return;
  editMediaFileInput.click();
});

editMediaFileInput.addEventListener("change", () => {
  addStagedEditMediaFiles(editMediaFileInput.files);
  editMediaFileInput.value = "";
});

editMediaDropzone.addEventListener("dragover", event => {
  event.preventDefault();
  editMediaDropzone.classList.add("is-dragover");
});

editMediaDropzone.addEventListener("dragleave", () => {
  editMediaDropzone.classList.remove("is-dragover");
});

editMediaDropzone.addEventListener("drop", event => {
  event.preventDefault();
  editMediaDropzone.classList.remove("is-dragover");
  addStagedEditMediaFiles(event.dataTransfer.files);
});

refreshCampaignsButton.addEventListener("click", loadCampaigns);

saveCampaignOrderButton.addEventListener("click", async () => {
  const orderedIds = [...campaignsList.querySelectorAll(".campaign-row")]
    .map(item => item.dataset.id);

  output.value = "Saving campaign order...";

  const response = await fetch("/api/reorder-campaigns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ orderedIds })
  });

  const result = await response.json();

  if (!result.success) {
    output.value = "ERROR: " + result.error;
    return;
  }

  output.value = "Campaign order saved.";
});

generateButton.addEventListener("click", async () => {
  const formData = new FormData();

  formData.append("client", clientInput.value);
  formData.append("title", titleInput.value);
  formData.append("folder", folderInput.value);
  formData.append("position", document.getElementById("position").value);
  formData.append("border", document.getElementById("border").value);
  formData.append("credits", document.getElementById("credits").value);

  for (const file of selectedFiles) {
    formData.append("files", file);
  }

  output.value = "Creating campaign...";

  const response = await fetch("/api/create-campaign", {
    method: "POST",
    body: formData
  });

  const result = await response.json();

  if (!result.success) {
    output.value = "ERROR: " + result.error;
    return;
  }

  output.value =
    `CAMPAIGN CREATED\n\n` +
    `Folder: assets/campaigns/${result.folder}/\n` +
    `Images: ${result.images}\n` +
    `Videos: ${result.videos}\n\n` +
    result.code;

  await loadCampaigns();
});

saveMediaOrderButton.addEventListener("click", async () => {
  if (!editingCampaignId || !editingCampaign || saveMediaOrderButton.disabled) return;

  try {
    saveMediaOrderButton.disabled = true;
    output.value = "Saving media order...";

    const response = await fetch("/api/reorder-campaign-media", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: editingCampaignId,
        media: existingMediaOrder
      })
    });

    const result = await response.json();

    if (!result.success) {
      output.value = "ERROR: " + result.error;
      updateSaveMediaOrderButton();
      return;
    }

    originalExistingMediaOrder = [...result.media];
    existingMediaOrder = [...result.media];
    editingCampaign = {
      ...editingCampaign,
      media: [...result.media]
    };

    renderExistingMediaGallery(editingCampaign, existingMediaOrder);
    updateSaveMediaOrderButton();
    await loadCampaigns();

    output.value = "Media order saved successfully.";
  } catch (error) {
    output.value = "JS ERROR: " + error.message;
    updateSaveMediaOrderButton();
    console.error(error);
  }
});

saveAddedMediaButton.addEventListener("click", async () => {
  const requestMessages = ["Save Added Media: click detected."];
  const showRequestMessage = message => {
    requestMessages.push(message);
    output.value = requestMessages.join("\n");
  };

  output.value = requestMessages.join("\n");

  if (!editingCampaignId || !editingCampaign || !stagedEditMediaFiles.length) {
    showRequestMessage(
      `Request not started: campaign=${editingCampaignId || "missing"}, ` +
      `files=${stagedEditMediaFiles.length}.`
    );
    return;
  }

  const pendingMediaOrder = [...existingMediaOrder];
  const formData = new FormData();

  formData.append("id", editingCampaignId);
  stagedEditMediaFiles.forEach(file => formData.append("files", file));

  try {
    setAddMediaBusy(true);
    showRequestMessage(
      `Request started: campaign=${editingCampaignId}, ` +
      `field=files, files=${stagedEditMediaFiles.length}.`
    );

    const response = await fetch("/api/add-campaign-media", {
      method: "POST",
      body: formData
    });
    showRequestMessage(`HTTP status: ${response.status} ${response.statusText || ""}`.trim());

    const responseText = await response.text();
    let result;

    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      showRequestMessage(
        `Server response was not valid JSON: ${responseText.slice(0, 200) || "empty response"}`
      );
      setAddMediaBusy(false);
      return;
    }

    if (!result.success) {
      showRequestMessage(`Server JSON error: ${result.error || "Unknown server error"}`);
      setAddMediaBusy(false);
      return;
    }

    const savedExistingMedia = result.media.slice(
      0,
      result.media.length - result.addedMedia.length
    );
    const savedExistingMediaSet = new Set(savedExistingMedia);
    const pendingOrderStillValid = pendingMediaOrder.length === savedExistingMedia.length &&
      pendingMediaOrder.every(filename => savedExistingMediaSet.has(filename));

    originalExistingMediaOrder = [...result.media];
    existingMediaOrder = pendingOrderStillValid
      ? [...pendingMediaOrder, ...result.addedMedia]
      : [...result.media];
    editingCampaign = {
      ...editingCampaign,
      media: [...result.media]
    };

    setAddMediaBusy(false);
    clearStagedEditMediaFiles();
    renderExistingMediaGallery(editingCampaign, existingMediaOrder);
    updateSaveMediaOrderButton();
    await loadCampaigns();

    showRequestMessage(`Success: ${result.addedMedia.length} media file(s) added.`);
  } catch (error) {
    showRequestMessage(`Request failed: ${error.message}`);
    setAddMediaBusy(false);
    console.error(error);
  }
});

saveRemovedMediaButton.addEventListener("click", async () => {
  if (
    !editingCampaignId ||
    !editingCampaign ||
    !pendingRemovedMedia.size ||
    isAddingCampaignMedia ||
    isRemovingCampaignMedia
  ) {
    return;
  }

  const removalList = existingMediaOrder.filter(filename => pendingRemovedMedia.has(filename));
  const remainingCount = existingMediaOrder.length - removalList.length;
  const firstConfirmation = window.confirm(
    `Remove ${removalList.length} media item(s) from this campaign?\n\n` +
    "The original files will remain recoverable in trash/campaigns."
  );

  if (!firstConfirmation) {
    output.value = "Media removal cancelled.";
    return;
  }

  let confirmEmpty = false;

  if (remainingCount === 0) {
    confirmEmpty = window.confirm(
      "WARNING: this will leave the campaign with zero media.\n\n" +
      "Confirm again to remove every media item."
    );

    if (!confirmEmpty) {
      output.value = "Media removal cancelled: empty campaign was not confirmed.";
      return;
    }
  }

  const pendingOrder = [...existingMediaOrder];

  try {
    setRemoveMediaBusy(true);
    output.value = `Removing ${removalList.length} media item(s)...`;

    const response = await fetch("/api/remove-campaign-media", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: editingCampaignId,
        media: removalList,
        confirmEmpty
      })
    });
    const responseText = await response.text();
    let result;

    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      output.value =
        `REMOVE MEDIA ERROR (${response.status})\n\n` +
        `Server response was not valid JSON: ${responseText.slice(0, 200) || "empty response"}`;
      setRemoveMediaBusy(false);
      return;
    }

    if (!result.success) {
      output.value = `REMOVE MEDIA ERROR (${response.status})\n\n${result.error}`;
      setRemoveMediaBusy(false);
      return;
    }

    const savedMediaSet = new Set(result.media);
    const pendingRemainingOrder = pendingOrder.filter(
      filename => !pendingRemovedMedia.has(filename)
    );
    const pendingOrderStillValid = pendingRemainingOrder.length === result.media.length &&
      pendingRemainingOrder.every(filename => savedMediaSet.has(filename));

    originalExistingMediaOrder = [...result.media];
    existingMediaOrder = pendingOrderStillValid
      ? pendingRemainingOrder
      : [...result.media];
    editingCampaign = {
      ...editingCampaign,
      media: [...result.media]
    };

    clearPendingMediaRemovals();
    setRemoveMediaBusy(false);
    renderExistingMediaGallery(editingCampaign, existingMediaOrder);
    updateSaveMediaOrderButton();
    await loadCampaigns();

    output.value =
      `${result.removedMedia.length} media item(s) removed successfully.\n` +
      `Original snapshot: ${result.backupPath}`;
  } catch (error) {
    output.value = "REMOVE MEDIA JS ERROR: " + error.message;
    setRemoveMediaBusy(false);
    console.error(error);
  }
});

cancelEditButton.addEventListener("click", () => {
  editingCampaignId = null;
  clearExistingMediaGallery();
  newCampaignMediaSection.hidden = false;

  generateButton.hidden = false;
  saveEditButton.hidden = true;
  cancelEditButton.hidden = true;

  clientInput.value = "";
  titleInput.value = "";
  folderInput.value = "";
  folderInput.disabled = false;
  document.getElementById("credits").value = "";

  if (document.getElementById("border")) {
    document.getElementById("border").value = "false";
  }

  selectedFiles = [];
  renderPreview();

  output.value = "";
});

saveEditButton.addEventListener("click", async () => {
  try {
    output.value = "Save Edit clicked...";

    if (!editingCampaignId) {
      output.value = "ERROR: No campaign selected for editing.";
      return;
    }

    const borderInput = document.getElementById("border");

    const updatedCampaign = {
      id: editingCampaignId,
      client: clientInput.value,
      title: titleInput.value,
      border: borderInput ? borderInput.value : "false",
      credits: document.getElementById("credits").value
    };

    output.value = "Sending edit to server...";

    const response = await fetch("/api/edit-campaign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updatedCampaign)
    });

    const result = await response.json();

    if (!result.success) {
      output.value = "ERROR: " + result.error;
      return;
    }

    editingCampaignId = null;
    clearExistingMediaGallery();
    newCampaignMediaSection.hidden = false;

    generateButton.hidden = false;
    saveEditButton.hidden = true;
    cancelEditButton.hidden = true;
    folderInput.disabled = false;

    output.value = "Campaign edit saved.";

    await loadCampaigns();
  } catch (error) {
    output.value = "JS ERROR: " + error.message;
    console.error(error);
  }
});

copyButton.addEventListener("click", () => {
  output.select();
  document.execCommand("copy");
});
publishButton.addEventListener("click", async () => {

let message = "Portfolio update";

  if (message === null) return;

  output.value = "Publishing...";

  const response = await fetch("/api/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message
    })
  });

  const result = await response.json();

if (result.nothingToPublish) {
  output.value = "Nothing to publish.";
  return;
}
  if (!result.success) {
    output.value =
      "PUBLISH ERROR\n\n" +
      result.error;
    return;
  }

  output.value =
    "✅ Published successfully.\n\n" +
    result.output;

});
loadCampaigns();
