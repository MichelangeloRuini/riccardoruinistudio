(() => {
  const PORTFOLIO_SECTION = "brand-identity";
  const ALLOWED_IMAGE_TYPES = new Map([
    ["image/jpeg", [".jpg", ".jpeg"]],
    ["image/png", [".png"]],
    ["image/webp", [".webp"]]
  ]);

  const sectionSelect = document.getElementById("cmsSectionSelect");
  const sectionPanels = document.querySelectorAll("[data-cms-section-panel]");
  const projectsList = document.getElementById("portfolioProjectsList");
  const refreshButton = document.getElementById("refreshPortfolioProjects");
  const clientInput = document.getElementById("portfolioClient");
  const titleInput = document.getElementById("portfolioTitle");
  const folderInput = document.getElementById("portfolioFolder");
  const positionInput = document.getElementById("portfolioPosition");
  const dropzone = document.getElementById("portfolioDropzone");
  const fileInput = document.getElementById("portfolioFiles");
  const preview = document.getElementById("portfolioPreview");
  const createFields = document.getElementById("portfolioCreateFields");
  const editCoverFields = document.getElementById("portfolioEditCoverFields");
  const existingCoverSelect = document.getElementById("portfolioExistingCover");
  const createButton = document.getElementById("createPortfolioProject");
  const saveEditButton = document.getElementById("savePortfolioEdit");
  const cancelEditButton = document.getElementById("cancelPortfolioEdit");
  const output = document.getElementById("portfolioOutput");
  const formTitle = document.getElementById("portfolioFormTitle");

  let selectedFiles = [];
  let selectedCoverFile = null;
  let previewUrls = [];
  let editingProject = null;
  let folderEditedManually = false;

  function getProjectLabel(project) {
    return [project.client, project.title]
      .map(value => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
      .join(" — ");
  }

  function slugify(value) {
    return String(value)
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
    folderInput.value = [slugify(clientInput.value), slugify(titleInput.value)]
      .filter(Boolean)
      .join("-");
  }

  function getExtension(filename) {
    const index = filename.lastIndexOf(".");
    return index === -1 ? "" : filename.slice(index).toLowerCase();
  }

  function getFileType(file) {
    const extension = getExtension(file.name);
    const allowedImageExtensions = ALLOWED_IMAGE_TYPES.get(file.type);

    if (allowedImageExtensions && allowedImageExtensions.includes(extension)) return "image";
    if (file.type === "video/mp4" && extension === ".mp4") return "video";
    return null;
  }

  function clearPreviewUrls() {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];
  }

  function renderPreview() {
    clearPreviewUrls();
    preview.replaceChildren();

    selectedFiles.forEach((file, index) => {
      const item = document.createElement("article");
      const visual = document.createElement("div");
      const details = document.createElement("div");
      const filename = document.createElement("p");
      const removeButton = document.createElement("button");
      const fileUrl = URL.createObjectURL(file);
      const mediaType = getFileType(file);

      previewUrls.push(fileUrl);
      item.className = "preview-item portfolio-preview-item";
      item.draggable = true;
      item.dataset.index = String(index);
      visual.className = "portfolio-preview-visual";
      details.className = "portfolio-preview-details";

      if (mediaType === "image") {
        const image = document.createElement("img");
        const coverLabel = document.createElement("label");
        const coverRadio = document.createElement("input");

        image.src = fileUrl;
        image.alt = `Preview of ${file.name}`;
        coverRadio.type = "radio";
        coverRadio.name = "portfolioCover";
        coverRadio.checked = selectedCoverFile === file;
        coverRadio.addEventListener("change", () => {
          selectedCoverFile = file;
        });
        coverLabel.className = "portfolio-cover-choice";
        coverLabel.append(coverRadio, " Use as cover");
        details.appendChild(coverLabel);
        visual.appendChild(image);
      } else {
        const video = document.createElement("video");
        video.src = fileUrl;
        video.controls = true;
        video.muted = true;
        video.preload = "metadata";
        visual.appendChild(video);
      }

      filename.textContent = file.name;
      removeButton.type = "button";
      removeButton.className = "preview-remove";
      removeButton.textContent = "×";
      removeButton.title = `Remove ${file.name}`;
      removeButton.addEventListener("click", () => {
        if (selectedCoverFile === file) selectedCoverFile = null;
        selectedFiles.splice(index, 1);
        renderPreview();
      });

      item.addEventListener("dragstart", event => {
        item.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
      });

      item.addEventListener("dragover", event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      });

      item.addEventListener("drop", event => {
        event.preventDefault();
        const sourceIndex = Number(event.dataTransfer.getData("text/plain"));

        if (!Number.isInteger(sourceIndex) || sourceIndex === index) return;
        const movedFile = selectedFiles.splice(sourceIndex, 1)[0];
        selectedFiles.splice(index, 0, movedFile);
        renderPreview();
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("is-dragging");
      });

      details.prepend(filename);
      item.append(visual, removeButton, details);
      preview.appendChild(item);
    });
  }

  function addFiles(files) {
    const incomingFiles = [...files];
    const allowedFiles = incomingFiles.filter(file => getFileType(file));

    selectedFiles.push(...allowedFiles);

    if (!selectedCoverFile) {
      selectedCoverFile = selectedFiles.find(file => getFileType(file) === "image") || null;
    }

    if (allowedFiles.length !== incomingFiles.length) {
      output.value = "Some files were skipped. Use JPG, JPEG, PNG, WebP, or MP4 with matching file types.";
    }

    renderPreview();
  }

  function setSection(sectionKey) {
    sectionPanels.forEach(panel => {
      panel.hidden = panel.dataset.cmsSectionPanel !== sectionKey;
    });

    if (sectionKey === PORTFOLIO_SECTION) loadProjects();
  }

  async function readJsonResponse(response) {
    const responseText = await response.text();

    try {
      return JSON.parse(responseText);
    } catch (error) {
      throw new Error(`Server returned invalid JSON: ${responseText.slice(0, 200) || "empty response"}`);
    }
  }

  function showDashboardFallback(container) {
    container.replaceChildren();
    const fallback = document.createElement("div");
    fallback.className = "campaign-thumb portfolio-dashboard-fallback";
    fallback.textContent = "Preview unavailable";
    container.appendChild(fallback);
  }

  function createDashboardCard(project) {
    const item = document.createElement("article");
    const previewContainer = document.createElement("div");
    const image = document.createElement("img");
    const info = document.createElement("div");
    const client = document.createElement("strong");
    const title = document.createElement("span");
    const counts = document.createElement("small");
    const actions = document.createElement("div");
    const editButton = document.createElement("button");
    const viewLink = document.createElement("a");
    const deleteButton = document.createElement("button");
    const imageCount = project.media.filter(file => /\.(jpe?g|png|webp)$/i.test(file)).length;
    const videoCount = project.media.filter(file => /\.mp4$/i.test(file)).length;

    item.className = "campaign-row portfolio-project-row";
    previewContainer.className = "portfolio-dashboard-preview";
    image.className = "campaign-thumb";
    image.src = `${project.path}${project.cover}`;
    image.alt = getProjectLabel(project);
    image.addEventListener("error", () => showDashboardFallback(previewContainer), { once: true });
    previewContainer.appendChild(image);

    info.className = "campaign-row-info";
    client.textContent = project.client;
    title.textContent = project.title;
    counts.textContent = `${imageCount} images · ${videoCount} videos`;
    info.appendChild(client);
    if (project.title.trim()) info.appendChild(title);
    info.appendChild(counts);

    actions.className = "campaign-row-actions portfolio-row-actions";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => beginEdit(project));

    viewLink.className = "portfolio-view-link";
    viewLink.href = project.viewUrl;
    viewLink.target = "_blank";
    viewLink.rel = "noopener noreferrer";
    viewLink.textContent = "View";

    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteProject(project));

    actions.append(editButton, viewLink, deleteButton);
    item.append(previewContainer, info, actions);
    return item;
  }

  async function loadProjects() {
    projectsList.textContent = "Loading Visual Identity projects...";

    try {
      const response = await fetch(`/api/portfolio-projects?section=${encodeURIComponent(PORTFOLIO_SECTION)}`);
      const result = await readJsonResponse(response);

      if (!result.success) throw new Error(result.error || "Unable to load projects.");

      projectsList.replaceChildren();

      if (!result.projects.length) {
        projectsList.textContent = "No Visual Identity projects found.";
        return;
      }

      result.projects.forEach(project => {
        projectsList.appendChild(createDashboardCard(project));
      });
    } catch (error) {
      projectsList.textContent = `ERROR: ${error.message}`;
    }
  }

  function getCoverMediaForProject(project) {
    const coverStem = project.cover.replace(/\.[^.]+$/, "").replace(/-thumb$/, "");
    return project.imageMedia.find(filename => filename.replace(/\.[^.]+$/, "") === coverStem) ||
      project.imageMedia[0] ||
      "";
  }

  function beginEdit(project) {
    editingProject = project;
    clientInput.value = project.client;
    titleInput.value = project.title;
    folderInput.value = project.id;
    folderInput.disabled = true;
    createFields.hidden = true;
    editCoverFields.hidden = false;
    createButton.hidden = true;
    saveEditButton.hidden = false;
    cancelEditButton.hidden = false;
    formTitle.textContent = "EDIT VISUAL IDENTITY PROJECT";
    existingCoverSelect.replaceChildren();

    project.imageMedia.forEach(filename => {
      const option = document.createElement("option");
      option.value = filename;
      option.textContent = filename;
      existingCoverSelect.appendChild(option);
    });

    existingCoverSelect.value = getCoverMediaForProject(project);
    output.value = `Editing ${getProjectLabel(project)}`;
    clientInput.focus();
  }

  function resetForm() {
    editingProject = null;
    selectedFiles = [];
    selectedCoverFile = null;
    folderEditedManually = false;
    clearPreviewUrls();
    preview.replaceChildren();
    fileInput.value = "";
    clientInput.value = "";
    titleInput.value = "";
    folderInput.value = "";
    folderInput.disabled = false;
    positionInput.value = "bottom";
    createFields.hidden = false;
    editCoverFields.hidden = true;
    createButton.hidden = false;
    saveEditButton.hidden = true;
    cancelEditButton.hidden = true;
    formTitle.textContent = "RRS VISUAL IDENTITY ADMIN";
    existingCoverSelect.replaceChildren();
  }

  async function createProject() {
    const client = clientInput.value.trim();
    const title = titleInput.value.trim();
    const id = folderInput.value.trim();
    const coverIndex = selectedFiles.indexOf(selectedCoverFile);

    if (!client || !id) {
      output.value = "Client and folder/ID are required. Title is optional.";
      return;
    }

    if (!selectedFiles.length || coverIndex === -1) {
      output.value = "Upload media and select an image as the cover.";
      return;
    }

    const formData = new FormData();
    formData.append("section", PORTFOLIO_SECTION);
    formData.append("id", id);
    formData.append("client", client);
    formData.append("title", title);
    formData.append("position", positionInput.value);
    formData.append("coverIndex", String(coverIndex));
    selectedFiles.forEach(file => formData.append("files", file));

    createButton.disabled = true;
    output.value = "Creating Visual Identity project...";

    try {
      const response = await fetch("/api/create-portfolio-project", {
        method: "POST",
        body: formData
      });
      const result = await readJsonResponse(response);

      if (!result.success) throw new Error(result.error || "Create failed.");

      resetForm();
      output.value = `Created ${getProjectLabel(result.project)}`;
      await loadProjects();
    } catch (error) {
      output.value = `CREATE ERROR: ${error.message}`;
    } finally {
      createButton.disabled = false;
    }
  }

  async function saveEdit() {
    if (!editingProject) return;

    saveEditButton.disabled = true;
    output.value = "Saving Visual Identity metadata...";

    try {
      const response = await fetch("/api/edit-portfolio-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: PORTFOLIO_SECTION,
          id: editingProject.id,
          client: clientInput.value,
          title: titleInput.value,
          cover: existingCoverSelect.value
        })
      });
      const result = await readJsonResponse(response);

      if (!result.success) throw new Error(result.error || "Edit failed.");

      resetForm();
      output.value = `Updated ${getProjectLabel(result.project)}`;
      await loadProjects();
    } catch (error) {
      output.value = `EDIT ERROR: ${error.message}`;
    } finally {
      saveEditButton.disabled = false;
    }
  }

  async function deleteProject(project) {
    const confirmed = window.confirm(
      `Delete “${getProjectLabel(project)}”?\n\n` +
      "The project folder will be moved to trash/identities and can be recovered."
    );

    if (!confirmed) return;

    output.value = `Deleting ${getProjectLabel(project)}...`;

    try {
      const response = await fetch("/api/delete-portfolio-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: PORTFOLIO_SECTION, id: project.id })
      });
      const result = await readJsonResponse(response);

      if (!result.success) throw new Error(result.error || "Delete failed.");

      if (editingProject && editingProject.id === project.id) resetForm();
      output.value = `Project moved to ${result.backupPath}`;
      await loadProjects();
    } catch (error) {
      output.value = `DELETE ERROR: ${error.message}`;
    }
  }

  async function verifySections() {
    try {
      const response = await fetch("/api/admin/sections");
      const result = await readJsonResponse(response);
      const enabledKeys = new Set((result.sections || []).map(section => section.key));

      [...sectionSelect.options].forEach(option => {
        option.disabled = !enabledKeys.has(option.value);
      });
    } catch (error) {
      output.value = `SECTION CONFIG ERROR: ${error.message}`;
    }
  }

  sectionSelect.addEventListener("change", () => setSection(sectionSelect.value));
  clientInput.addEventListener("input", updateFolder);
  titleInput.addEventListener("input", updateFolder);
  folderInput.addEventListener("input", () => {
    folderEditedManually = true;
  });
  refreshButton.addEventListener("click", loadProjects);
  createButton.addEventListener("click", createProject);
  saveEditButton.addEventListener("click", saveEdit);
  cancelEditButton.addEventListener("click", () => {
    resetForm();
    output.value = "";
  });

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });
  dropzone.addEventListener("dragover", event => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-dragover");
  });
  dropzone.addEventListener("drop", event => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    addFiles(event.dataTransfer.files);
  });

  verifySections();
  setSection(sectionSelect.value);
})();
