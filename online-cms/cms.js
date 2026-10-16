(() => {
  "use strict";

  const loginView = document.getElementById("loginView");
  const dashboardView = document.getElementById("dashboardView");
  const loginForm = document.getElementById("loginForm");
  const loginMessage = document.getElementById("loginMessage");
  const adminIdentity = document.getElementById("adminIdentity");
  const logoutButton = document.getElementById("logoutButton");
  const statusFilter = document.getElementById("statusFilter");
  const refreshButton = document.getElementById("refreshButton");
  const dashboardMessage = document.getElementById("dashboardMessage");
  const inquiriesBody = document.getElementById("inquiriesBody");
  const inquiryDialog = document.getElementById("inquiryDialog");
  const closeInquiry = document.getElementById("closeInquiry");
  const inquiryDetails = document.getElementById("inquiryDetails");
  const detailStatus = document.getElementById("detailStatus");
  const saveStatus = document.getElementById("saveStatus");
  const detailMessage = document.getElementById("detailMessage");
  let activeInquiryId = null;

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const error = new Error(payload.message || "The request could not be completed.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function showLogin(message = "") {
    dashboardView.hidden = true;
    loginView.hidden = false;
    loginMessage.textContent = message;
    loginMessage.hidden = !message;
    loginForm.password.value = "";
  }

  function showDashboard(user) {
    loginView.hidden = true;
    dashboardView.hidden = false;
    adminIdentity.textContent = user.email || "ADMIN";
  }

  function handleRequestError(error, target = dashboardMessage) {
    if (error.status === 401 || error.status === 403) {
      if (inquiryDialog.open) inquiryDialog.close();
      showLogin(error.message);
      return;
    }
    target.textContent = error.message;
    target.hidden = false;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function addCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value || "—";
    if (className) cell.className = className;
    row.appendChild(cell);
  }

  function renderInquiries(inquiries) {
    inquiriesBody.replaceChildren();
    if (inquiries.length === 0) {
      dashboardMessage.textContent = "NO INQUIRIES FOUND.";
      dashboardMessage.hidden = false;
      return;
    }

    dashboardMessage.hidden = true;
    inquiries.forEach(inquiry => {
      const row = document.createElement("tr");
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", `Open inquiry from ${inquiry.name}`);
      addCell(row, formatDate(inquiry.created_at));
      addCell(row, inquiry.name);
      addCell(row, inquiry.company);
      addCell(row, inquiry.email);

      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = "status-pill";
      status.textContent = String(inquiry.status || "").toUpperCase();
      statusCell.appendChild(status);
      row.appendChild(statusCell);

      row.addEventListener("click", () => openInquiry(inquiry.id));
      row.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openInquiry(inquiry.id);
        }
      });
      inquiriesBody.appendChild(row);
    });
  }

  async function loadInquiries() {
    dashboardMessage.textContent = "LOADING…";
    dashboardMessage.hidden = false;
    const query = statusFilter.value ? `?status=${encodeURIComponent(statusFilter.value)}` : "";
    try {
      const payload = await request(`/api/admin/inquiries${query}`);
      renderInquiries(payload.inquiries || []);
    } catch (error) {
      handleRequestError(error);
    }
  }

  function renderDetail(inquiry) {
    const fields = [
      ["DATE", formatDate(inquiry.created_at)],
      ["NAME", inquiry.name],
      ["COMPANY", inquiry.company],
      ["EMAIL", inquiry.email],
      ["SERVICE", inquiry.service],
      ["BUDGET", inquiry.budget],
      ["DESCRIPTION", inquiry.description]
    ];
    inquiryDetails.replaceChildren();
    fields.forEach(([label, value]) => {
      const term = document.createElement("dt");
      const definition = document.createElement("dd");
      term.textContent = label;
      definition.textContent = value || "—";
      inquiryDetails.append(term, definition);
    });
    detailStatus.value = inquiry.status;
  }

  async function openInquiry(id) {
    activeInquiryId = id;
    detailMessage.textContent = "LOADING…";
    detailMessage.hidden = false;
    if (!inquiryDialog.open) inquiryDialog.showModal();
    try {
      const payload = await request(`/api/admin/inquiries/${encodeURIComponent(id)}`);
      renderDetail(payload.inquiry);
      detailMessage.hidden = true;
    } catch (error) {
      handleRequestError(error, detailMessage);
    }
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = loginForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    loginMessage.textContent = "AUTHENTICATING…";
    loginMessage.hidden = false;

    try {
      const payload = await request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          email: loginForm.email.value,
          password: loginForm.password.value
        })
      });
      loginForm.reset();
      showDashboard(payload.user);
      await loadInquiries();
    } catch (error) {
      loginMessage.textContent = error.message;
      loginMessage.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await request("/api/admin/logout", { method: "POST" });
    } catch {
      // The local session is cleared in the UI even if the network is unavailable.
    } finally {
      logoutButton.disabled = false;
      showLogin();
    }
  });

  refreshButton.addEventListener("click", loadInquiries);
  statusFilter.addEventListener("change", loadInquiries);
  closeInquiry.addEventListener("click", () => inquiryDialog.close());

  saveStatus.addEventListener("click", async () => {
    if (!activeInquiryId) return;
    saveStatus.disabled = true;
    detailMessage.textContent = "SAVING…";
    detailMessage.hidden = false;
    try {
      const payload = await request(`/api/admin/inquiries/${encodeURIComponent(activeInquiryId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: detailStatus.value })
      });
      renderDetail(payload.inquiry);
      detailMessage.textContent = "STATUS SAVED.";
      detailMessage.hidden = false;
      await loadInquiries();
    } catch (error) {
      handleRequestError(error, detailMessage);
    } finally {
      saveStatus.disabled = false;
    }
  });

  request("/api/admin/session")
    .then(payload => {
      showDashboard(payload.user);
      return loadInquiries();
    })
    .catch(() => showLogin());
})();
