const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

const expectedTalents = [
  "Yasmin Le Bon",
  "Dusan Reljin",
  "Norman Jean Roy",
  "Jennifer Lopez",
  "Jacob Bixenman",
  "Francesco Carrozzini",
  "Brianna Capozzi",
  "Georgia May Jagger",
  "Gia Coppola",
  "Irina Shayk",
  "Chris Colls",
  "Cedric Buchet",
  "Dree Hemingway",
  "Arizona Muse",
  "Henrik Purienne",
  "Mert Alas and Marcus Piggott",
  "Lily Aldridge",
  "Steve Aoki",
  "Juergen Teller",
  "Vittoria Ceretti",
  "Adut Akech",
  "Grace Hartzel",
  "Mikael Jansson",
  "Kaia Gerber",
  "Inez and Vinoodh",
  "Gigi Hadid",
  "Rianne Van Rampaey",
  "Troye Sivan",
  "Ellen Von Unwerth",
  "Terry Richardson",
  "Carmelo Anthony",
  "David Bailey",
  "Kes Glozier",
  "David Sims",
  "Chiara Clemente",
  "Kendall Jenner",
  "Peter Lindbergh",
  "Maria Carla Boscono",
  "Baby Strange",
  "Christy Turlington",
  "Liya Kebede",
  "Mark Borthwick",
  "Kenya Kinski",
  "Will Peltz",
  "Steven Meisel",
  "Karen Elson",
  "Birdy",
  "Steve Mccurry",
  "Bruce Weber",
  "Patricia Arquette",
  "Ben Barnes",
  "Michal Pudelka",
  "Venetia Scott",
  "Sølve Sundsbø",
  "Mario Sorrenti",
  "Gisele Bundchen",
  "Malgosia Bela",
  "Angelo Pennetta",
  "Kasia Smutniak",
  "Stefano Accorsi",
  "Lykke Li",
  "Craig McDean",
  "Jeff Burton",
  "Kate Moss",
  "Blake Lively",
  "Guido Mocafico",
  "Abbey Lee",
  "Penelope Cruz",
  "Sarah Moon",
  "Amber Valletta",
  "Matteo Garrone",
  "Eric Bana",
  "Charlotte Casiraghi",
  "James Franco",
  "Deborah Turbeville",
  "Nicolas Winding Refn",
  "Nathaniel Goldberg",
  "Frank Miller",
  "Evan Rachel Wood",
  "Chris Evans",
  "Clive Owen",
  "Kirsten Dunst",
  "Stephanie Seymour",
  "Laetitia Casta",
  "Julianne Moore",
  "Chris Cunningham",
  "Karlie Kloss",
  "Clare Danes",
  "Rihanna",
  "David Lynch",
  "Drew Barrymore",
  "Willy Vanderperre",
  "Rie Rasmussen",
  "Philip Lorca Di Corcia"
];

const expectedBrands = [
  "Blazé",
  "Bulgari",
  "Bulgari Hotel & Residences London",
  "Cerruti",
  "Chantecler",
  "Diesel",
  "Dirk Bikkembergs",
  "Dondup",
  "Elie Saab",
  "Elisabetta Franchi",
  "Emilio Pucci",
  "Ermanno Scervino",
  "Falconeri",
  "Fendi",
  "Ferragamo",
  "Feudi di San Gregorio",
  "Francesco Scognamiglio",
  "Gucci",
  "Hogan",
  "Intimissimi",
  "La Perla",
  "Liberty",
  "Liu Jo",
  "Loewe",
  "Marella",
  "Marina Rinaldi",
  "Missoni",
  "Paciotti",
  "Patrizia Pepe",
  "Peuterey",
  "Pinko",
  "RED Valentino",
  "Trussardi",
  "Valentino",
  "Vilebrequin",
  "Vionnet",
  "Walk For Giants"
];

function getExpectedWall() {
  const entries = [];
  let previousTalentIndex = 0;

  expectedBrands.forEach((brand, brandIndex) => {
    const nextTalentIndex = Math.floor(
      ((brandIndex + 1) * expectedTalents.length) / expectedBrands.length
    );

    expectedTalents.slice(previousTalentIndex, nextTalentIndex).forEach(name => {
      entries.push({ name, type: "talent" });
    });
    entries.push({ name: brand, type: "brand" });
    previousTalentIndex = nextTalentIndex;
  });

  return entries;
}

const expectedClients = getExpectedWall();
const excludedNames = new Set([
  "Kristin Scott Thomas",
  "Jack Huston",
  "Allora Fest"
]);

function loadCollection(filename, collectionName) {
  const context = {};
  vm.createContext(context);
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  vm.runInContext(`${source}\nthis.collection = ${collectionName};`, context);
  return context.collection;
}

function createClassList() {
  const values = new Set();

  return {
    add: value => values.add(value),
    contains: value => values.has(value),
    remove: value => values.delete(value)
  };
}

function loadClientsScript() {
  const nodes = [];
  const clientsWall = {
    append: () => {},
    appendChild: node => nodes.push(node),
    classList: createClassList(),
    set innerHTML(value) {
      if (value === "") nodes.length = 0;
    }
  };
  const document = {
    addEventListener: () => {},
    createElement: tagName => ({
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
      classList: createClassList(),
      tagName: tagName.toUpperCase(),
      listeners: {},
      style: {},
      textContent: ""
    }),
    getElementById: id => id === "clientsWall" ? clientsWall : null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const context = {
    document,
    RRSUnifiedSearch: {
      normalize: value => String(value).toLowerCase()
    },
    setTimeout: () => {},
    URLSearchParams,
    window: {
      location: {
        href: "",
        search: ""
      },
      scrollTo: () => {}
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(root, "script.js"), "utf8");
  vm.runInContext(
    `${source}\nthis.clientEntries = clients; this.renderClientEntries = renderClients;`,
    context
  );

  return {
    clients: Array.from(context.clientEntries, entry => ({
      name: entry.name,
      type: entry.type
    })),
    context,
    nodes,
    renderClients: context.renderClientEntries
  };
}

function getCreditOccurrences(campaigns) {
  const occurrences = new Map();

  campaigns.forEach(campaign => {
    (Array.isArray(campaign.credits) ? campaign.credits : []).forEach(credit => {
      const values = Array.isArray(credit.value) ? credit.value : [credit.value];

      values.forEach(value => {
        if (typeof value !== "string") return;
        const cleanValue = value.trim();
        occurrences.set(cleanValue, (occurrences.get(cleanValue) || 0) + 1);
      });
    });
  });

  return occurrences;
}

test("the curated wall contains one stable mixed sequence of 37 brands and 94 talents", () => {
  const { clients } = loadClientsScript();
  const names = clients.map(client => client.name);

  assert.deepEqual(clients, expectedClients);
  assert.equal(names.length, 131);
  assert.equal(new Set(names).size, names.length);
  assert.equal(clients.filter(client => client.type === "brand").length, 37);
  assert.equal(clients.filter(client => client.type === "talent").length, 94);
  excludedNames.forEach(name => assert.equal(names.includes(name), false));

  const brandIndexes = clients
    .map((client, index) => client.type === "brand" ? index : -1)
    .filter(index => index >= 0);
  assert.equal(brandIndexes[0], 2);
  brandIndexes.slice(1).forEach((index, position) => {
    const distance = index - brandIndexes[position];
    assert.ok(distance === 3 || distance === 4);
  });
});

test("all 131 wall entries come from real structured data and produce Search results", () => {
  const campaigns = loadCollection("data/campaigns.js", "campaigns");
  const portfolioProjects = loadCollection(
    "data/portfolio-projects.js",
    "portfolioProjects"
  );
  const magazinesBooks = loadCollection(
    "data/magazines-books.js",
    "magazinesBooks"
  );
  const beforeCampaigns = JSON.stringify(campaigns);
  const beforePortfolio = JSON.stringify(portfolioProjects);
  const beforeMagazinesBooks = JSON.stringify(magazinesBooks);
  const creditOccurrences = getCreditOccurrences(campaigns);
  const clientOccurrences = new Set([
    ...campaigns.map(campaign => campaign.client),
    ...portfolioProjects.map(project => project.client)
  ]);
  const searchContext = { window: {} };
  searchContext.window = searchContext;
  vm.createContext(searchContext);
  vm.runInContext(
    fs.readFileSync(path.join(root, "utils/searchData.js"), "utf8"),
    searchContext
  );
  const { clients } = loadClientsScript();

  clients.forEach(client => {
    const matchingCampaigns = campaigns.filter(campaign =>
      searchContext.RRSUnifiedSearch.matches(campaign, "campaign", client.name)
    );
    const matchingPortfolio = portfolioProjects.filter(project =>
      searchContext.RRSUnifiedSearch.matches(project, "portfolio", client.name)
    );
    const matchingMagazinesBooks = magazinesBooks.filter(record =>
      searchContext.RRSUnifiedSearch.matches(record, "magazines-books", client.name)
    );

    if (client.type === "brand") {
      assert.ok(
        clientOccurrences.has(client.name),
        `${client.name} must exactly match a structured client field`
      );
    } else {
      assert.ok(
        creditOccurrences.get(client.name) > 0,
        `${client.name} must exactly match at least one real credit`
      );
    }

    assert.ok(
      matchingCampaigns.length
        + matchingPortfolio.length
        + matchingMagazinesBooks.length > 0,
      `${client.name} must produce at least one result`
    );
  });

  assert.equal(JSON.stringify(campaigns), beforeCampaigns);
  assert.equal(JSON.stringify(portfolioProjects), beforePortfolio);
  assert.equal(JSON.stringify(magazinesBooks), beforeMagazinesBooks);
});

test("the renderer creates exactly 131 real same-tab links with encoded Search URLs", () => {
  const fixture = loadClientsScript();
  fixture.renderClients(fixture.clients);
  assert.equal(fixture.nodes.length, 131);

  fixture.nodes.forEach((node, index) => {
    const name = expectedClients[index].name;
    assert.equal(node.tagName, "A");
    assert.equal(node.textContent, name);
    assert.equal(node.className, "client-name is-clickable");
    assert.equal(
      node.href,
      `search.html?q=${encodeURIComponent(name)}`
    );
    assert.equal(node.target, undefined);
  });
});

test("the wall uses no random order and no duplicated render sequence", () => {
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "style.css"), "utf8");
  const renderer = script.slice(
    script.indexOf("function renderClients"),
    script.indexOf("/* SEARCH SUGGESTIONS */")
  );

  assert.doesNotMatch(renderer, /repeatedList|\.\.\.list|Math\.random/);
  assert.match(renderer, /document\.createElement\("a"\)/);
  assert.match(styles, /animation:\s*wallMove 28s ease-in-out infinite alternate/);
  assert.match(styles, /animation:\s*wallMoveMobile 28s ease-in-out infinite alternate/);
});

test("known supplied typos and non-canonical variants are absent", () => {
  const { clients } = loadClientsScript();
  const names = new Set(clients.map(client => client.name));
  const rejectedVariants = [
    "Irina Shaik",
    "Mert Alas and Marcus Piggot",
    "Aduth Akech",
    "Mikael Jannson",
    "Inez van Laamsweerde and Vinoodh Matadin",
    "Gig Hadin",
    "Chisty Turlington",
    "Lia Kebede",
    "Kasja Smutniak",
    "Likke Li",
    "Even Rachel Woods",
    "Claire Danes",
    "Abbey Lee Kershaw",
    "Philip Lorca di Corcia"
  ];

  rejectedVariants.forEach(variant => assert.equal(names.has(variant), false));
  excludedNames.forEach(name => assert.equal(names.has(name), false));
});
