class Character {
  constructor(actor) {
    this.actor = actor;
    this._cache = {};

    this.data = this._createProxy("system", () => this.actor.system);
    this.csb = this._createProxy("system.props", () => this.actor.system?.props ?? {});
  }

  _createProxy(prefix, systemGetter, path = "") {
    const getIgnore = new Set([' #path# ', ' #cache# ']);

    const handler = {
      get: (target, prop, receiver) => {
        if (prop === '_value') {
          const fullPath = path ? `${prefix}.${path}` : prefix;

          if (fullPath in this._cache) {
            return this._cache[fullPath];
          }

          const parts = path.split('.').filter(Boolean);
          let val = systemGetter();
          for (const part of parts) {
            if (val && part in val) {
              val = val[part];
            } else {
              val = undefined;
              break;
            }
          }

          return val !== undefined ? val : "";
        }

        if (!getIgnore.has(prop)) {
          const newPath = path ? `${path}.${prop}` : prop;
          return this._createProxy(prefix, systemGetter, newPath);
        }

        return Reflect.get(target, prop, receiver);
      },

      set: (target, prop, value) => {
        const fullPath = path ? `${prefix}.${path}.${prop}` : `${prefix}.${prop}`;
        this._cache[fullPath] = value;
        return true;
      }
    };

    return new Proxy({}, handler);
  }

  async update() {
    try {
      await this.actor.update(this._cache);
      this._cache = {};
      return { success: true };
    } catch (error) {
      console.error("Character update failed:", error);
      return { success: false, error };
    }
  }
}
