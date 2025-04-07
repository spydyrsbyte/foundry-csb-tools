class LookupService {
  constructor(url) {
    this.url = url;
    this.lookups = new Map(); // Map<lookupName, Map<entryName, entry>>
  }

  async load() {
    try {
      const response = await fetch(this.url);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
      const data = await response.json();

      for (const [lookupName, entries] of Object.entries(data)) {
        const entryMap = new Map();
        for (const entry of entries) {
          if (entry.name) {
            entryMap.set(entry.name, entry);
          } else {
            console.warn(`Missing 'name' in entry of ${lookupName}:`, entry);
          }
        }
        this.lookups.set(lookupName, entryMap);
      }
    } catch (err) {
      console.error("Error loading lookup data:", err);
    }
  }

  /** Get a specific entry by lookup name and entry name */
  get(lookupName, entryName) {
    const lookup = this.lookups.get(lookupName);
    return lookup ? lookup.get(entryName) : undefined;
  }

  /** Get all entries in a lookup by name */
  getAll(lookupName) {
    const lookup = this.lookups.get(lookupName);
    return lookup ? Array.from(lookup.values()) : [];
  }

  /** Get all lookup names available */
  getLookupNames() {
    return Array.from(this.lookups.keys());
  }
}
