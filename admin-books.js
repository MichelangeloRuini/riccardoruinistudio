(() => {
  const SECTION_KEY = "magazines-books";
  const sectionSelect = document.getElementById("cmsSectionSelect");
  const panel = document.getElementById("magazinesBooksPanel");
  const list = document.getElementById("magazinesBooksList");
  const status = document.getElementById("magazinesBooksStatus");
  const emptyState = document.getElementById("magazinesBooksEmpty");
  const errorState = document.getElementById("magazinesBooksError");
  const refreshButton = document.getElementById("booksRefresh");
  const saveOrderButton = document.getElementById("booksSaveOrder");
  const formTitle = document.getElementById("booksFormTitle");
  const titleInput = document.getElementById("booksTitle");
  const creditsList = document.getElementById("booksCreditsList");
  const addCreditButton = document.getElementById("booksAddCredit");
  const createFields = document.getElementById("booksCreateFields");
  const positionInput = document.getElementById("booksPosition");
  const videoInput = document.getElementById("booksVideoFile");
  const replaceVideoInput = document.getElementById("booksReplaceVideoFile");
  const createButton = document.getElementById("booksCreate");
  const saveEditButton = document.getElementById("booksSaveEdit");
  const cancelEditButton = document.getElementById("booksCancelEdit");
  const output = document.getElementById("booksOutput");

  const requiredElements = [
    sectionSelect, panel, list, status, emptyState, errorState, refreshButton,
    saveOrderButton, formTitle, titleInput, creditsList, addCreditButton,
    createFields, positionInput, videoInput, replaceVideoInput, createButton,
    saveEditButton, cancelEditButton, output
  ];

  if (requiredElements.some(element => !element)) return;

  let items = [];
  let editingId = null;
  let replaceTargetId = null;
  let draggedCard = null;
  let hasLoaded = false;
  let isBusy = false;
  let orderDirty = false;

  function setPanelState(state, message = "") {
    status.hidden = state !== "loading" && state !== "loaded";
    emptyState.hidden = state !== "empty";
    errorState.hidden = state !== "error";

    if (state === "loading") status.textContent = "Loading Magazines & Books...";
    if (state === "loaded") status.textContent = message;
    if (state === "error") errorState.textContent = message;
  }

  function showOutput(message, isError = false) {
    output.value = message;
    output.classList.toggle("books-admin-output-error", isError);
  }

  function setBusy(busy) {
    isBusy = busy;
    [
      refreshButton, createButton, saveEditButton, cancelEditButton,
      addCreditButton, titleInput, positionInput, videoInput, replaceVideoInput
    ].forEach(control => {
      control.disabled = busy;
    });
    creditsList.querySelectorAll("button, input").forEach(control => {
      control.disabled = busy;
    });
    list.querySelectorAll("button").forEach(button => {
      button.disabled = busy;
    });
    saveOrderButton.disabled = busy || !orderDirty;
  }

  function pauseAndReset(video) {
    video.pause();
    try {
      video.currentTime = 0;
    } catch (error) {
      // The video may not have loaded metadata yet.
    }
  }

  function playPreview(video) {
    if (isBusy || draggedCard) return;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Playback may remain blocked until the browser receives interaction.
      });
    }
  }

  function pauseAllPreviews() {
    list.querySelectorAll(".books-admin-video").forEach(pauseAndReset);
  }

  function isCompleteRecord(item) {
    return item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      item.id.trim() &&
      typeof item.title === "string" &&
      item.title.trim() &&
      Array.isArray(item.credits) &&
      item.credits.every(credit =>
        credit &&
        typeof credit.label === "string" &&
        typeof credit.value === "string"
      ) &&
      typeof item.video === "string" &&
      item.video.trim();
  }

  function addCreditRow(credit = { label: "", value: "" }) {
    const row = document.createElement("div");
    const labelInput = document.createElement("input");
    const valueInput = document.createElement("input");
    const removeButton = document.createElement("button");

    row.className = "books-admin-credit-row";
    labelInput.type = "text";
    labelInput.className = "books-admin-credit-label";
    labelInput.placeholder = "Label";
    labelInput.value = credit.label;
    labelInput.maxLength = 150;
    labelInput.setAttribute("aria-label", "Credit label");

    valueInput.type = "text";
    valueInput.className = "books-admin-credit-value";
    valueInput.placeholder = "Value";
    valueInput.value = credit.value;
    valueInput.maxLength = 2000;
    valueInput.setAttribute("aria-label", "Credit value");

    removeButton.type = "button";
    removeButton.className = "books-admin-remove-credit";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => row.remove());

    row.append(labelInput, valueInput, removeButton);
    creditsList.appendChild(row);
  }

  function collectCredits() {
    return Array.from(creditsList.querySelectorAll(".books-admin-credit-row"))
      .map((row, index) => {
        const label = row.querySelector(".books-admin-credit-label").value.trim();
        const value = row.querySelector(".books-admin-credit-value").value.trim();
        if (!label || !value) {
          throw new Error(`Credit ${index + 1} requires label and value.`);
        }
        return { label, value };
      });
  }

  function resetForm() {
    editingId = null;
    titleInput.value = "";
    creditsList.replaceChildren();
    videoInput.value = "";
    positionInput.value = "bottom";
    formTitle.textContent = "CREATE MAGAZINES & BOOKS PROJECT";
    createFields.hidden = false;
    createButton.hidden = false;
    saveEditButton.hidden = true;
    cancelEditButton.hidden = true;
  }

  function beginEdit(item) {
    pauseAllPreviews();
    editingId = item.id;
    titleInput.value = item.title;
    creditsList.replaceChildren();
    item.credits.forEach(addCreditRow);
    formTitle.textContent = `EDIT ${item.id.toUpperCase()}`;
    createFields.hidden = true;
    createButton.hidden = true;
    saveEditButton.hidden = false;
    cancelEditButton.hidden = false;
    showOutput(`Editing ${item.title}`);
    titleInput.focus();
  }

  async function readJson(response) {
    const responseText = await response.text();
    try {
      return JSON.parse(responseText);
    } catch (error) {
      throw new Error("Server returned an invalid JSON response.");
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const result = await readJson(response);
    if (!response.ok || result.success === false) {
      throw new Error(result.error || `Request failed with status ${response.status}.`);
    }
    return result;
  }

  function createActionButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function moveDraggedCard(targetCard) {
    if (!draggedCard || draggedCard === targetCard) return;
    const cards = Array.from(list.querySelectorAll(".books-admin-card"));
    const draggedIndex = cards.indexOf(draggedCard);
    const targetIndex = cards.indexOf(targetCard);
    if (draggedIndex < targetIndex) targetCard.after(draggedCard);
    else targetCard.before(draggedCard);
    orderDirty = true;
    saveOrderButton.disabled = isBusy;
  }

  function createCard(item) {
    const card = document.createElement("article");
    const handle = document.createElement("div");
    const video = document.createElement("video");
    const meta = document.createElement("div");
    const title = document.createElement("strong");
    const id = document.createElement("span");
    const credits = document.createElement("span");
    const videoPath = document.createElement("span");
    const actions = document.createElement("div");

    card.className = "books-admin-card";
    card.dataset.id = item.id;
    handle.className = "books-admin-drag-handle";
    handle.textContent = "↕ Drag";
    handle.draggable = true;
    handle.tabIndex = 0;
    handle.setAttribute("aria-label", `Drag ${item.title} to reorder`);

    handle.addEventListener("dragstart", event => {
      pauseAllPreviews();
      draggedCard = card;
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
    });
    handle.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      draggedCard = null;
    });
    card.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      card.classList.add("is-drag-target");
    });
    card.addEventListener("dragleave", () => card.classList.remove("is-drag-target"));
    card.addEventListener("drop", event => {
      event.preventDefault();
      card.classList.remove("is-drag-target");
      moveDraggedCard(card);
    });

    video.className = "books-admin-video";
    video.src = item.video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.controls = false;
    video.tabIndex = 0;
    video.setAttribute("aria-label", `Preview ${item.title}`);
    video.addEventListener("mouseenter", () => playPreview(video));
    video.addEventListener("mouseleave", () => pauseAndReset(video));
    video.addEventListener("focus", () => playPreview(video));
    video.addEventListener("blur", () => pauseAndReset(video));

    meta.className = "books-admin-meta";
    title.textContent = item.title;
    id.textContent = `ID: ${item.id}`;
    credits.textContent = `Credits: ${item.credits.length}`;
    videoPath.textContent = `Video: ${item.video}`;
    meta.append(title, id, credits, videoPath);

    actions.className = "books-admin-card-actions";
    actions.append(
      createActionButton("Edit", "books-admin-edit", () => beginEdit(item)),
      createActionButton("Replace Video", "books-admin-replace", () => {
        pauseAllPreviews();
        replaceTargetId = item.id;
        replaceVideoInput.value = "";
        replaceVideoInput.click();
      }),
      createActionButton("Duplicate", "books-admin-duplicate", () => duplicateItem(item)),
      createActionButton("Delete", "books-admin-delete", () => deleteItem(item))
    );

    card.append(handle, video, meta, actions);
    return card;
  }

  function renderItems() {
    list.replaceChildren();
    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(createCard(item)));
    list.appendChild(fragment);
    orderDirty = false;
    saveOrderButton.disabled = true;
  }

  async function loadItems() {
    if (isBusy) return;
    setBusy(true);
    setPanelState("loading");
    pauseAllPreviews();

    try {
      const result = await requestJson("/api/magazines-books", {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      if (!Array.isArray(result.items)) throw new Error("Response does not contain items.");
      if (result.items.some(item => !isCompleteRecord(item))) {
        throw new Error("Response contains an incomplete record.");
      }

      items = result.items;
      renderItems();
      hasLoaded = true;
      setPanelState(items.length ? "loaded" : "empty", `${items.length} records loaded.`);
    } catch (error) {
      setPanelState("error", `Unable to load Magazines & Books: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function createItem() {
    try {
      const title = titleInput.value.trim();
      const credits = collectCredits();
      const file = videoInput.files[0];
      if (!title) throw new Error("Title is required.");
      if (!file || videoInput.files.length !== 1) throw new Error("Select exactly one MP4 video.");

      const formData = new FormData();
      formData.append("title", title);
      formData.append("credits", JSON.stringify(credits));
      formData.append("position", positionInput.value);
      formData.append("video", file);

      setBusy(true);
      showOutput("Creating project...");
      const result = await requestJson("/api/create-magazines-book", {
        method: "POST",
        body: formData
      });
      resetForm();
      showOutput(`Created ${result.item.id}`);
      setBusy(false);
      await loadItems();
    } catch (error) {
      setBusy(false);
      showOutput(`CREATE ERROR: ${error.message}`, true);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      const title = titleInput.value.trim();
      const credits = collectCredits();
      if (!title) throw new Error("Title is required.");

      setBusy(true);
      showOutput("Saving project metadata...");
      const result = await requestJson("/api/edit-magazines-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, title, credits })
      });
      resetForm();
      showOutput(`Updated ${result.item.id}`);
      setBusy(false);
      await loadItems();
    } catch (error) {
      setBusy(false);
      showOutput(`EDIT ERROR: ${error.message}`, true);
    }
  }

  async function replaceVideo(file) {
    if (!replaceTargetId || !file) return;
    try {
      const formData = new FormData();
      formData.append("id", replaceTargetId);
      formData.append("video", file);
      setBusy(true);
      showOutput(`Replacing video for ${replaceTargetId}...`);
      const result = await requestJson("/api/replace-magazines-book-video", {
        method: "POST",
        body: formData
      });
      showOutput(`Replaced video for ${result.item.id}`);
      replaceTargetId = null;
      setBusy(false);
      await loadItems();
    } catch (error) {
      setBusy(false);
      showOutput(`REPLACE ERROR: ${error.message}`, true);
    }
  }

  async function duplicateItem(item) {
    if (!window.confirm(`Duplicate “${item.title}”?`)) return;
    try {
      setBusy(true);
      showOutput(`Duplicating ${item.id}...`);
      const result = await requestJson("/api/duplicate-magazines-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id })
      });
      showOutput(`Created duplicate ${result.item.id}`);
      setBusy(false);
      await loadItems();
    } catch (error) {
      setBusy(false);
      showOutput(`DUPLICATE ERROR: ${error.message}`, true);
      await loadItems();
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Delete “${item.title}”? The project will be moved to trash/books.`)) return;
    try {
      setBusy(true);
      showOutput(`Deleting ${item.id}...`);
      const result = await requestJson("/api/delete-magazines-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id })
      });
      if (editingId === item.id) resetForm();
      showOutput(`Moved project to ${result.backupPath}`);
      setBusy(false);
      await loadItems();
    } catch (error) {
      setBusy(false);
      showOutput(`DELETE ERROR: ${error.message}`, true);
      await loadItems();
    }
  }

  async function saveOrder() {
    const orderedIds = Array.from(list.querySelectorAll(".books-admin-card"))
      .map(card => card.dataset.id);
    try {
      setBusy(true);
      showOutput("Saving order...");
      await requestJson("/api/reorder-magazines-books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds })
      });
      showOutput("Order saved.");
      setBusy(false);
      await loadItems();
    } catch (error) {
      setBusy(false);
      showOutput(`REORDER ERROR: ${error.message}`, true);
      await loadItems();
    }
  }

  addCreditButton.addEventListener("click", () => addCreditRow());
  createButton.addEventListener("click", createItem);
  saveEditButton.addEventListener("click", saveEdit);
  cancelEditButton.addEventListener("click", () => {
    resetForm();
    showOutput("");
  });
  refreshButton.addEventListener("click", loadItems);
  saveOrderButton.addEventListener("click", saveOrder);
  replaceVideoInput.addEventListener("change", () => {
    const file = replaceVideoInput.files[0];
    replaceVideoInput.value = "";
    if (file) replaceVideo(file);
  });
  sectionSelect.addEventListener("change", () => {
    if (sectionSelect.value !== SECTION_KEY) {
      pauseAllPreviews();
      return;
    }
    if (!hasLoaded) loadItems();
  });

  resetForm();
  if (sectionSelect.value === SECTION_KEY) loadItems();
})();
