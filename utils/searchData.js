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
      "magazine-books": "Magazine and Books",
      "magazine-and-books": "Magazine and Books",
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
    addValue(
      values,
      type === "portfolio" ? formatSection(record.section) : record.category
    );

    if (type === "campaign" && Array.isArray(record.credits)) {
      record.credits.forEach(credit => {
        if (!credit || typeof credit !== "object") return;
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

  function getTerms(campaignRecords, portfolioRecords) {
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

    return Array.from(uniqueTerms.values());
  }

  global.RRSUnifiedSearch = {
    formatSection,
    getSearchableValues,
    getTerms,
    matches,
    normalize
  };
}(window));
