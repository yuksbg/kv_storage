/* Native custom element: no CDN, framework, or build step required. */
class KVStoragePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._selected = "";
    this._request = 0;
    this._busy = false;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; height:100%; overflow:auto; color:var(--primary-text-color); background:var(--primary-background-color); font-family:var(--paper-font-body1_-_font-family, sans-serif); }
        header { display:flex; align-items:center; gap:16px; padding:16px 24px; border-bottom:1px solid var(--divider-color); }
        [hidden] { display:none !important; }
        h1 { margin:0; font-size:24px; font-weight:500; } main { max-width:1100px; margin:auto; padding:24px; }
        p { line-height:1.5; } .tools { display:flex; gap:16px; align-items:end; flex-wrap:wrap; margin:24px 0; }
        label { display:flex; flex-direction:column; gap:8px; } input, select, textarea, button { font:inherit; }
        input, select, textarea { box-sizing:border-box; padding:10px; color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:4px; }
        button { min-height:40px; padding:8px 16px; border:1px solid var(--divider-color); border-radius:4px; color:var(--primary-color); background:var(--card-background-color); cursor:pointer; }
        button:disabled { opacity:.5; cursor:wait; } button.primary { background:var(--primary-color); color:var(--text-primary-color, white); border-color:var(--primary-color); }
        :focus-visible { outline:2px solid var(--primary-color); outline-offset:3px; }
        .scroll { overflow:auto; } table { width:100%; border-collapse:collapse; text-align:left; } th, td { padding:14px 10px; border-bottom:1px solid var(--divider-color); vertical-align:top; } th { font-weight:500; }
        pre { white-space:pre-wrap; overflow-wrap:anywhere; margin:0; font:14px/1.5 monospace; } td:first-child { overflow-wrap:anywhere; } td:last-child { white-space:nowrap; }
        form { margin-top:32px; display:grid; gap:16px; max-width:650px; } h2 { font-size:20px; font-weight:500; margin:0; } textarea { width:100%; min-height:100px; font-family:monospace; }
        #status { min-height:24px; } #status.error { color:var(--error-color); } .hint { color:var(--secondary-text-color); } .actions { display:flex; gap:8px; }
        @media (max-width:600px) { main { padding:16px; } header { padding:12px 16px; } th, td { padding:10px 6px; } td:last-child button { display:block; width:100%; margin-bottom:8px; } }
      </style>
      <header><ha-menu-button></ha-menu-button><h1>KV Storage</h1></header>
      <main>
        <p>Persistent values for your automations and scripts.</p>
        <div class="tools"><label>Store<select id="stores" aria-label="Store"></select></label><button id="refresh">Refresh</button><a href="/config/integrations/integration/kv_storage">Manage stores</a></div>
        <p id="entity" class="hint"></p><p id="status" role="status" aria-live="polite"></p>
        <div class="scroll"><table><thead><tr><th>Key</th><th>Value</th><th>Actions</th></tr></thead><tbody></tbody></table></div>
        <p id="empty">Add a store in Settings → Devices & services → Add integration → KV Storage.</p>
        <form><h2>Set a value</h2><label>Key<input id="key" required maxlength="255" autocomplete="off"></label>
          <label>Value type<select id="type"><option value="text">Text</option><option value="json">JSON (number, boolean, list, object, null)</option></select></label>
          <label>Value<textarea id="value" aria-describedby="value-help"></textarea></label>
          <span id="value-help" class="hint">Text preserves leading zeroes in codes. JSON preserves structured data.</span>
          <div><button class="primary" type="submit">Save value</button></div>
        </form>
      </main>`;
    this.$("#stores").addEventListener("change", () => {
      this._selected = this.$("#stores").value;
      this._snapshot = null;
      this.$("form").reset();
      this.hass = this._hass;
    });
    this.$("#refresh").addEventListener("click", () => this.load());
    this.$("form").addEventListener("submit", (event) => {
      event.preventDefault();
      let value = this.$("#value").value;
      try { if (this.$("#type").value === "json") value = JSON.parse(value); }
      catch { this.status("Invalid JSON. Check the value and try again.", true); return; }
      this.mutate("set", { key: this.$("#key").value, value });
    });
  }

  $(selector) { return this.shadowRoot.querySelector(selector); }

  set hass(hass) {
    this._hass = hass;
    this.$("ha-menu-button").hass = hass;
    const stores = Object.values(hass.states).filter((s) => s.entity_id.startsWith("sensor.") &&
      typeof s.attributes.kv_storage_store === "string" && !["unavailable", "unknown"].includes(s.state))
      .sort((a, b) => a.attributes.kv_storage_store.localeCompare(b.attributes.kv_storage_store));
    const signature = stores.map((s) => `${s.entity_id}:${s.attributes.kv_storage_store}`).join("|");
    if (signature !== this._storeSignature) {
      this._storeSignature = signature;
      this.$("#stores").replaceChildren(...stores.map((s) => {
        const option = document.createElement("option");
        option.value = option.textContent = s.attributes.kv_storage_store;
        return option;
      }));
    }
    if (!stores.some((s) => s.attributes.kv_storage_store === this._selected)) {
      this._selected = stores[0]?.attributes.kv_storage_store || "";
    }
    this.$("#stores").value = this._selected;
    this.$("form").hidden = !this._selected;
    const state = stores.find((s) => s.attributes.kv_storage_store === this._selected);
    this.$("#entity").textContent = state ? `${state.entity_id} · ${state.state} keys` : "";
    if (state !== this._snapshot) {
      this._snapshot = state;
      this.load();
    }
  }

  set narrow(value) { this.$("ha-menu-button").narrow = value; }

  status(message, error = false) {
    this.$("#status").textContent = message;
    this.$("#status").classList.toggle("error", error);
  }

  async load() {
    const request = ++this._request;
    if (!this._selected) {
      this.renderValues({});
      return;
    }
    try {
      const result = await this._hass.callWS({ type: "call_service", domain: "kv_storage", service: "get",
        service_data: { store: this._selected }, return_response: true });
      if (request !== this._request) return;
      this.renderValues(result.response.values);
    } catch (error) {
      if (request === this._request) {
        this.$("tbody").replaceChildren();
        this.status(error.message || "Could not load this store.", true);
      }
    }
  }

  renderValues(values) {
    const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
    this.$("tbody").replaceChildren(...entries.map(([key, value]) => {
      const row = document.createElement("tr");
      const name = document.createElement("td"); name.textContent = key;
      const cell = document.createElement("td");
      const code = document.createElement("pre"); code.textContent = JSON.stringify(value, null, 2); cell.append(code);
      const actions = document.createElement("td");
      const edit = document.createElement("button"); edit.textContent = "Edit"; edit.setAttribute("aria-label", `Edit ${key}`);
      edit.addEventListener("click", () => {
        this.$("#key").value = key;
        this.$("#type").value = typeof value === "string" ? "text" : "json";
        this.$("#value").value = typeof value === "string" ? value : JSON.stringify(value, null, 2);
        this.$("#value").focus();
      });
      const remove = document.createElement("button"); remove.textContent = "Delete"; remove.setAttribute("aria-label", `Delete ${key}`);
      remove.addEventListener("click", () => {
        if (window.confirm(`Delete “${key}” from ${this._selected}?`)) this.mutate("delete", { key });
      });
      actions.append(edit, remove); row.append(name, cell, actions); return row;
    }));
    this.$("#empty").hidden = entries.length > 0;
    this.$("#empty").textContent = this._selected ? "This store is empty. Add your first value below." :
      "Add a store in Settings → Devices & services → Add integration → KV Storage.";
    this.setBusy(this._busy);
  }

  setBusy(busy) {
    this._busy = busy;
    this.shadowRoot.querySelectorAll("button, input, select, textarea").forEach((element) => { element.disabled = busy; });
  }

  async mutate(service, fields) {
    if (this._busy || !this._selected) return;
    this.setBusy(true);
    try {
      await this._hass.callService("kv_storage", service, { store: this._selected, ...fields });
      this.status(service === "set" ? "Value saved." : "Value deleted.");
      if (service === "set") this.$("form").reset();
      await this.load();
    } catch (error) { this.status(error.message || "The operation failed.", true); }
    finally { this.setBusy(false); }
  }
}
if (!customElements.get("kv-storage-panel")) customElements.define("kv-storage-panel", KVStoragePanel);
