class DynamicTable {
  constructor(dynamicTable = {}) {
    this._table = dynamicTable;

    this._proxy = new Proxy(this, {
      get: (target, prop) => {
        if (!isNaN(prop)) return target._table[prop];
        return target[prop];
      },
      set: (target, prop, value) => {
        if (!isNaN(prop)) {
          target._table[prop] = value;
          return true;
        }
        target[prop] = value;
        return true;
      },
      deleteProperty: (target, prop) => {
        if (!isNaN(prop)) {
          target.removeAt(Number(prop));
          return true;
        }
        return false;
      },
      has: (target, prop) => {
        if (!isNaN(prop)) return prop in target._table;
        return prop in target;
      },
      ownKeys: (target) => Reflect.ownKeys(target._table),
      getOwnPropertyDescriptor: (target, prop) => {
        if (!isNaN(prop)) return Object.getOwnPropertyDescriptor(target._table, prop);
        return Object.getOwnPropertyDescriptor(target, prop);
      }
    });

    return this._proxy;
  }

  async save() {
    // Async save logic goes here
    throw new Error("Save function not implemented.");
  }

  findByKeyValue(key, value) {
    for (let index in this._table) {
      if (this._table[index][key] === value) {
        return this._table[index];
      }
    }
    return null;
  }

  sortByKey(key, descending = false) {
    const entries = Object.entries(this._table)
      .sort(([, a], [, b]) => {
        if (a[key] < b[key]) return descending ? 1 : -1;
        if (a[key] > b[key]) return descending ? -1 : 1;
        return 0;
      });

    this._table = {};
    entries.forEach(([, item], idx) => {
      this._table[idx] = item;
    });
  }

  insert(item, index = this.length) {
    // Shift items to the right starting from index
    for (let i = this.length - 1; i >= index; i--) {
      this._table[i + 1] = this._table[i];
    }
    this._table[index] = item;
  }

  removeAt(index) {
    if (!(index in this._table)) return;

    for (let i = index; i < this.length - 1; i++) {
      this._table[i] = this._table[i + 1];
    }
    delete this._table[this.length - 1];
  }

  get length() {
    return Object.keys(this._table).length;
  }

  toArray() {
    return Object.values(this._table);
  }
}
