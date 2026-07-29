const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

const expectedClients = [
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
  "Kristin Scott Thomas",
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
  "Jack Huston",
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

const absentClients = new Set([
  "Kristin Scott Thomas",
  "Jack Huston"
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
    createElement: () => ({
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
      classList: createClassList(),
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
      clickable: entry.clickable
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

test("Clients contains the canonical list in the requested order without duplicates", () => {
  const { clients } = loadClientsScript();
  const names = clients.map(client => client.name);

  assert.deepEqual(names, expectedClients);
  assert.equal(names.length, 96);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(
    clients.filter(client => !client.clickable).map(client => client.name),
    Array.from(absentClients)
  );
});

test("every clickable Client is an exact credit value and produces search results", () => {
  const campaigns = loadCollection("data/campaigns.js", "campaigns");
  const portfolioProjects = loadCollection(
    "data/portfolio-projects.js",
    "portfolioProjects"
  );
  const beforeCampaigns = JSON.stringify(campaigns);
  const beforePortfolio = JSON.stringify(portfolioProjects);
  const occurrences = getCreditOccurrences(campaigns);
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

    if (client.clickable) {
      assert.ok(
        occurrences.get(client.name) > 0,
        `${client.name} must exactly match at least one credit`
      );
      assert.ok(
        matchingCampaigns.length + matchingPortfolio.length > 0,
        `${client.name} must produce at least one result`
      );
    } else {
      assert.equal(occurrences.has(client.name), false);
      assert.equal(matchingCampaigns.length + matchingPortfolio.length, 0);
    }
  });

  assert.equal(JSON.stringify(campaigns), beforeCampaigns);
  assert.equal(JSON.stringify(portfolioProjects), beforePortfolio);
});

test("clickable entries generate their exact encoded query and absent entries do not link", () => {
  const fixture = loadClientsScript();
  fixture.renderClients(fixture.clients);
  const firstPass = fixture.nodes.slice(0, expectedClients.length);

  firstPass.forEach((node, index) => {
    const name = expectedClients[index];

    assert.equal(node.textContent, name);
    if (absentClients.has(name)) {
      assert.equal(node.classList.contains("is-clickable"), false);
      assert.equal(node.listeners.click, undefined);
      assert.equal(node.style.cursor, "default");
      assert.equal(node.style.color, "var(--text-grey)");
      return;
    }

    assert.equal(node.classList.contains("is-clickable"), true);
    node.listeners.click();
    assert.equal(
      fixture.context.window.location.href,
      `search.html?q=${encodeURIComponent(name)}`
    );
  });
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
});
