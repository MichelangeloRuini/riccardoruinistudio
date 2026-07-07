const clients = [
  "10 Magazine", "Allora Fest", "Blazé Milano", "Bulgari", "Bulgari Hotel & Residences",
  "Cerruti", "Chantecler", "Diesel Watches", "Dirk Bikkembergs", "Dondup",
  "Elie Saab", "Elisabetta Franchi", "Emilio Pucci", "Ermanno Scervino",
  "Falconeri", "Feudi di San Gregorio", "Fendi", "Ferragamo", "Francesco Scognamiglio", "GQ Style UK",
  "Gucci", "Hogan", "ICON Magazine", "Iceberg", "Intimissimi", "La Perla",
  "Liberty London", "Liu Jo", "Loewe", "M Missoni", "Marella", "Marina Rinaldi",
  "Mytheresa", "Paciotti", "Park Hyatt Milano", "Patrizia Pepe", "Peuterey",
  "Pinko", "Recarlo", "RED Valentino", "Trussardi", "Valentino", "Vilebrequin",
  "Vionnet", "Vogue", "Vogue Japan", "Walk for Giants"
];

const landing = document.getElementById("landing");
const cursor = document.querySelector(".custom-cursor");
const clientsWall = document.getElementById("clientsWall");
const searchInput = document.getElementById("searchInput");

function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function enterSite() {
  if (!landing) return;

  landing.classList.add("is-leaving");

  setTimeout(() => {
    document.body.classList.remove("landing-active");
    document.body.classList.add("entered");
    window.scrollTo(0, 0);
  }, 600);
}

if (landing) {
  const skipLanding = new URLSearchParams(window.location.search).get("skipLanding");

  if (skipLanding === "true") {
    document.body.classList.remove("landing-active");
    document.body.classList.add("entered");
  } else {
    landing.addEventListener("click", enterSite);
  }
}

if (cursor) {
  document.addEventListener("mousemove", event => {
    cursor.style.left = event.clientX + "px";
    cursor.style.top = event.clientY + "px";
  });
}

function getSearchTerms() {
  const terms = new Set();

  clients.forEach(client => terms.add(client));

  if (typeof campaigns !== "undefined") {
    campaigns.forEach(campaign => {
      terms.add(campaign.client);
      terms.add(campaign.title);
      terms.add(campaign.category);

      campaign.credits.forEach(credit => {
        if (Array.isArray(credit.value)) {
          credit.value.forEach(value => terms.add(value));
        } else {
          terms.add(credit.value);
        }
      });
    });
  }

  return Array.from(terms).filter(Boolean);
}

function renderClients(list) {
  if (!clientsWall) return;

  clientsWall.innerHTML = "";

  if (list.length === 0) {
    clientsWall.innerHTML = `<span class="client-name">NO RESULTS</span>`;
    return;
  }

  const repeatedList = list.length > 8 ? [...list, ...list] : list;

  repeatedList.forEach((item, index) => {
    const span = document.createElement("span");
    span.className = "client-name";
    span.textContent = item;

    span.addEventListener("click", () => {
      window.location.href = `search.html?q=${encodeURIComponent(item)}`;
    });

    clientsWall.appendChild(span);

    if (index < repeatedList.length - 1) {
      clientsWall.append(" / ");
    }
  });
}

if (searchInput && clientsWall) {
  searchInput.addEventListener("input", () => {
    const value = normalize(searchInput.value.trim());

    if (value === "") {
      clientsWall.classList.remove("is-filtered");
      renderClients(clients);
      return;
    }

    clientsWall.classList.add("is-filtered");

    const terms = getSearchTerms();

    const filtered = terms.filter(term =>
      normalize(term).includes(value)
    );

    renderClients(filtered);
  });

  renderClients(clients);
}

/* GLOBAL SEARCH */

document.querySelectorAll(".search").forEach(input => {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      const value = input.value.trim();

      if (value) {
        window.location.href = `search.html?q=${encodeURIComponent(value)}`;
      }
    }
  });
});