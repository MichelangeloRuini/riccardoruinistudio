(function initializeUnifiedSearch(global) {
  function normalize(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function formatSection(section) {
    const normalizedSection = String(section == null ? "" : section)
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
    const sectionLabels = {
      "brand-identity": "Visual Identity",
      "magazine-books": "Magazines & Books",
      "magazine-and-books": "Magazines & Books",
      branding: "Branding",
      films: "Films"
    };

    return sectionLabels[normalizedSection] || normalizedSection
      .replace(/-+/g, " ")
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  function addValue(values, value) {
    if (Array.isArray(value)) {
      value.forEach(item => addValue(values, item));
      return;
    }

    if (typeof value === "string" && value.trim()) {
      values.push(value.trim());
    }
  }

  function getSearchableValues(record, type) {
    const values = [];

    if (!record || typeof record !== "object") return values;

    addValue(values, record.client);
    addValue(values, record.title);

    if (type === "magazines-books" && typeof record.id === "string") {
      addValue(values, record.id.replace(/[-_]+/g, " "));
    }

    addValue(
      values,
      type === "portfolio" ? formatSection(record.section) : record.category
    );

    if ((type === "campaign" || type === "magazines-books") && Array.isArray(record.credits)) {
      record.credits.forEach(credit => {
        if (type === "magazines-books" && typeof credit === "string") {
          addValue(values, credit);
          return;
        }

        if (!credit || typeof credit !== "object" || Array.isArray(credit)) return;
        addValue(values, credit.label);
        addValue(values, credit.value);
      });
    }

    return values;
  }

  function matches(record, type, query) {
    const cleanQuery = normalize(String(query == null ? "" : query).trim());

    if (!cleanQuery) return false;

    return getSearchableValues(record, type).some(value =>
      normalize(value).includes(cleanQuery)
    );
  }

  function getTerms(campaignRecords, portfolioRecords, magazinesBooksRecords) {
    const uniqueTerms = new Map();

    function collect(records, type) {
      if (!Array.isArray(records)) return;

      records.forEach(record => {
        getSearchableValues(record, type).forEach(value => {
          const key = normalize(value);
          if (key && !uniqueTerms.has(key)) uniqueTerms.set(key, value);
        });
      });
    }

    collect(campaignRecords, "campaign");
    collect(portfolioRecords, "portfolio");
    collect(magazinesBooksRecords, "magazines-books");

    return Array.from(uniqueTerms.values());
  }

  function getMagazinesBooksUrl(record) {
    const id = record && typeof record.id === "string" ? record.id.trim() : "";

    return `magazines-books.html?project=${encodeURIComponent(id)}`;
  }

  function getSuggestionItems(campaignRecords, portfolioRecords, magazinesBooksRecords) {
    const items = getTerms(campaignRecords, portfolioRecords).map(label => ({
      label,
      url: `search.html?q=${encodeURIComponent(label)}`
    }));
    const knownLabels = new Set(items.map(item => normalize(item.label)));

    if (Array.isArray(magazinesBooksRecords)) {
      magazinesBooksRecords.forEach(record => {
        getSearchableValues(record, "magazines-books").forEach(label => {
          const key = normalize(label);

          if (!key || knownLabels.has(key)) return;
          knownLabels.add(key);
          items.push({
            label,
            url: getMagazinesBooksUrl(record)
          });
        });
      });
    }

    return items;
  }

  global.RRSUnifiedSearch = {
    formatSection,
    getMagazinesBooksUrl,
    getSearchableValues,
    getSuggestionItems,
    getTerms,
    matches,
    normalize
  };
}(window));
