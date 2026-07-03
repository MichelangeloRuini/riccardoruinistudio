const clients = [
  "10 Magazine", "Allora Fest", "Blazé Milano", "Bulgari", "Bulgari Hotel & Residences",
  "Cerruti", "Chantecler", "Diesel Watches", "Dirk Bikkembergs", "Dondup",
  "Elie Saab", "Elisabetta Franchi", "Emilio Pucci", "Ermanno Scervino",
  "Falconeri", "Fendi", "Ferragamo", "Francesco Scognamiglio", "GQ Style UK",
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

function enterSite() {
  landing.classList.add("is-leaving");

  setTimeout(() => {
    document.body.classList.remove("landing-active");
    document.body.classList.add("entered");
    window.scrollTo(0, 0);
  }, 600);
}

const skipLanding = new URLSearchParams(window.location.search).get("skipLanding");

if (skipLanding === "true") {
  document.body.classList.remove("landing-active");
  document.body.classList.add("entered");
} else {
  landing.addEventListener("click", enterSite);
}

document.addEventListener("mousemove", event => {
  cursor.style.left = event.clientX + "px";
  cursor.style.top = event.clientY + "px";
});

function renderClients(list) {
  clientsWall.innerHTML = "";

  if (list.length === 0) {
    clientsWall.innerHTML = `<span class="client-name">NO RESULTS</span>`;
    return;
  }

  const repeatedList = [...list, ...list];

  repeatedList.forEach((client, index) => {
    const span = document.createElement("span");
    span.className = "client-name";
    span.textContent = client;

    span.addEventListener("click", () => {
      console.log("Open page for:", client);
    });

    clientsWall.appendChild(span);

    if (index < repeatedList.length - 1) {
      clientsWall.append(" / ");
    }
  });
}

searchInput.addEventListener("input", () => {
  const value = searchInput.value.trim().toLowerCase();

  if (value === "") {
    clientsWall.classList.remove("is-filtered");
    renderClients(clients);
    return;
  }

  clientsWall.classList.add("is-filtered");

  const filtered = clients.filter(client =>
    client.toLowerCase().includes(value)
  );

  renderClients(filtered);
});

renderClients(clients);