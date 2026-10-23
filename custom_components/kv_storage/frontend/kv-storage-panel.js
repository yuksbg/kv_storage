/* Theme-aware store browser. No external frontend dependencies. */
const KV_ICONS = {
  add: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15"/>',
  edit: '<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  delete: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
};
const kvIcon = (name) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KV_ICONS[name]}</svg>`;

class KVStoragePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._selected = '';
    this._request = 0;
    this._busy = false;
    this._values = {};
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; height:100%; overflow:auto; color:var(--primary-text-color,#212121); background:var(--primary-background-color,#fafafa); font-family:var(--paper-font-body1_-_font-family,Roboto,Arial,sans-serif); font-size:14px; }
        * { box-sizing:border-box; } [hidden] { display:none!important; }
        header { height:64px; display:flex; align-items:center; gap:16px; padding:0 24px; border-bottom:1px solid var(--divider-color,#ddd); background:var(--app-header-background-color,var(--card-background-color,#fff)); color:var(--app-header-text-color,var(--primary-text-color)); }
        h1 { font-size:20px; font-weight:500; margin:0; } h2 { font-size:24px; line-height:1.4; font-weight:500; margin:0; } p { line-height:1.6; }
        main { max-width:1440px; margin:0 auto; padding:32px 40px; }
        .heading { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:28px; }
        .heading p { margin:6px 0 0; color:var(--secondary-text-color,#666); }
        a { color:var(--primary-color,#03a9f4); text-decoration:none; } a:hover { text-decoration:underline; }
        button,input,select,textarea { font:inherit; } button,a,input,select,textarea { -webkit-tap-highlight-color:transparent; }
        button { display:inline-flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; min-height:40px; border:1px solid var(--divider-color,#ddd); border-radius:6px; padding:0 16px; background:var(--card-background-color,#fff); color:var(--primary-text-color,#212121); font-weight:500; white-space:nowrap; }
        button:hover { background:var(--secondary-background-color,#eee); } button:disabled { opacity:.45; cursor:default; }
        button.primary { background:var(--primary-color,#03a9f4); border-color:var(--primary-color,#03a9f4); color:var(--text-primary-color,#fff); }
        button.primary:hover { filter:brightness(.94); } button.icon { width:40px; padding:0; border-color:transparent; background:transparent; color:var(--secondary-text-color,#666); }
        button.icon:hover { background:var(--secondary-background-color,#eee); color:var(--primary-text-color); } button.danger { color:var(--error-color,#db4437); }
        :focus-visible { outline:2px solid var(--primary-color,#03a9f4); outline-offset:3px; }
        .browser { background:var(--card-background-color,#fff); border:1px solid var(--divider-color,#ddd); border-radius:10px; overflow:hidden; }
        .toolbar { padding:20px 24px; display:flex; align-items:center; flex-wrap:wrap; gap:16px; border-bottom:1px solid var(--divider-color,#ddd); }
        .store-field { display:flex; align-items:center; gap:12px; font-weight:500; }
        input,select,textarea { color:var(--primary-text-color,#212121); background:var(--card-background-color,#fff); border:1px solid var(--divider-color,#ccc); border-radius:6px; min-height:42px; padding:10px 12px; }
        select { min-width:170px; } .search { display:flex; align-items:center; gap:10px; margin-left:auto; flex:1 1 180px; min-width:160px; max-width:360px; padding:0 12px; border:1px solid var(--divider-color,#ddd); border-radius:6px; color:var(--secondary-text-color,#666); }
        .search:focus-within { outline:2px solid var(--primary-color,#03a9f4); outline-offset:1px; } .search input { width:100%; border:0; background:transparent; padding-left:0; outline:none; }
        .context { display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; padding:14px 24px; color:var(--secondary-text-color,#666); font-size:13px; }
        #entity { overflow-wrap:anywhere; } .scroll { overflow:auto; }
        table { width:100%; border-collapse:collapse; table-layout:fixed; text-align:left; } th { color:var(--secondary-text-color,#666); font-size:13px; font-weight:500; background:var(--secondary-background-color,#f5f5f5); }
        th,td { padding:16px 24px; border-bottom:1px solid var(--divider-color,#ddd); vertical-align:middle; } tbody tr:last-child td { border-bottom:0; } tbody tr:hover { background:var(--table-row-alternative-background-color,var(--primary-background-color,#fafafa)); }
        .key-col { width:35%; } .type-col { width:100px; } .actions-col { width:116px; text-align:right; } td.actions-col { padding:8px 16px; }
        .key { font:14px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap:anywhere; }
        .value { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font:14px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; }
        .type { color:var(--secondary-text-color,#666); font-size:13px; } .bool { color:var(--primary-color,#03a9f4); } .null { color:var(--secondary-text-color,#666); font-style:italic; }
        #empty { padding:48px 24px; text-align:center; } #empty h3 { font-size:18px; font-weight:500; margin:0 0 8px; } #empty p { color:var(--secondary-text-color,#666); margin:0; }
        .footnote { color:var(--secondary-text-color,#666); margin:16px 0; font-size:13px; }
        #status:empty { display:none; } #status { margin:0 0 18px; padding:12px 16px; border-left:3px solid var(--primary-color,#03a9f4); background:var(--card-background-color,#fff); } #status.error,.error { color:var(--error-color,#db4437); } #status.error { border-color:var(--error-color,#db4437); }
        dialog { color:var(--primary-text-color,#212121); background:var(--card-background-color,#fff); border:1px solid var(--divider-color,#ddd); border-radius:12px; padding:0; width:560px; max-width:calc(100vw - 32px); max-height:calc(100vh - 48px); }
        dialog::backdrop { background:rgba(0,0,0,.55); } .dialog-head { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 24px; border-bottom:1px solid var(--divider-color,#ddd); } .dialog-head h2 { font-size:20px; }
        form { margin:0; } .fields { padding:24px; display:grid; gap:20px; } label.field { display:grid; gap:8px; font-weight:500; } .field input,.field select,.field textarea { width:100%; font-weight:400; } textarea { min-height:180px; resize:vertical; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; line-height:1.6; tab-size:2; }
        .hint { color:var(--secondary-text-color,#666); font-weight:400; font-size:13px; line-height:1.5; } .dialog-actions { display:flex; gap:12px; justify-content:flex-end; padding:16px 24px; border-top:1px solid var(--divider-color,#ddd); } #editor-error:empty { display:none; } #editor-error { margin:0; line-height:1.5; }
        @media(max-width:700px) { main { padding:24px 16px; } header { padding:0 16px; } .heading { align-items:flex-start; gap:12px; } .heading h2 { font-size:22px; } .heading p { max-width:240px; } .toolbar { padding:16px; gap:12px; display:grid; grid-template-columns:minmax(0,1fr) 36px; } .store-field { grid-column:1; grid-row:1; } .store-field select { min-width:0; width:100%; } #refresh { grid-column:2; grid-row:1; } .search { grid-column:1 / -1; grid-row:2; width:100%; max-width:none; } .toolbar a { grid-column:1 / -1; grid-row:3; } .context { padding:14px 16px; } th,td { padding:14px 12px; } .type-col { display:none; } .key-col { width:40%; } .actions-col { width:88px; } td.actions-col { padding:8px 4px; } button.icon { width:36px; } .heading button { padding:0 12px; } .fields { padding:20px; } }
      </style>
      <header><ha-menu-button></ha-menu-button><h1>KV Storage</h1></header>
      <main>
        <div class="heading"><div><h2>Your stored values</h2><p>Shared state for your automations and scripts.</p></div><button id="add" class="primary">${kvIcon('add')}Add entry</button></div>
        <div id="status" role="status" aria-live="polite"></div>
        <section class="browser" aria-label="Store entries">
          <div class="toolbar"><label class="store-field">Store <select id="stores" aria-label="Store"></select></label><a href="/config/integrations/integration/kv_storage">Manage stores</a><label class="search">${kvIcon('search')}<input id="search" type="search" placeholder="Search keys or values" aria-label="Search keys or values"></label><button id="refresh" class="icon" title="Refresh entries" aria-label="Refresh entries">${kvIcon('refresh')}</button></div>
          <div class="context"><span id="entity"></span><span id="count" aria-live="polite"></span></div>
          <div class="scroll"><table><thead><tr><th class="key-col" scope="col">Key</th><th scope="col">Value</th><th class="type-col" scope="col">Type</th><th class="actions-col" scope="col">Actions</th></tr></thead><tbody></tbody></table></div>
          <div id="empty" hidden><h3></h3><p></p></div>
        </section>
        <p class="footnote">Saved values persist across restarts and are available to your automations immediately.</p>
      </main>
      <dialog id="editor" aria-labelledby="editor-title"><form>
        <div class="dialog-head"><h2 id="editor-title">Add entry</h2><button type="button" class="icon" id="close" aria-label="Close editor">${kvIcon('close')}</button></div>
        <div class="fields"><label class="field">Key<input id="key" required maxlength="255" autocomplete="off" placeholder="e.g. bathroom_mode"></label>
          <label class="field">Value type<select id="type" aria-label="Value type"><option value="text">Text</option><option value="json">JSON</option></select></label>
          <label class="field">Value<textarea id="value" aria-label="Value" spellcheck="false" aria-describedby="value-help"></textarea><span id="value-help" class="hint">Text preserves leading zeroes in codes, such as 0012.</span></label>
          <p id="editor-error" class="error" role="alert"></p>
        </div><div class="dialog-actions"><button type="button" id="cancel">Cancel</button><button class="primary" type="submit">Save entry</button></div>
      </form></dialog>`;
    this.$('#stores').addEventListener('change', () => {
      this._selected = this.$('#stores').value;
      this._values = {};
      this._snapshot = null;
      this.status('');
      this.renderValues();
      this.hass = this._hass;
    });
    this.$('#search').addEventListener('input', () => this.renderValues());
    this.$('#refresh').addEventListener('click', () => this.load());
    this.$('#add').addEventListener('click', () => this.openEditor());
    for (const id of ['#cancel', '#close']) this.$(id).addEventListener('click', () => this.$('#editor').close());
    this.$('#editor').addEventListener('cancel', (event) => { if (this._busy) event.preventDefault(); });
    this.$('#type').addEventListener('change', () => this.updateHint());
    this.$('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const key = this.$('#key').value;
      if (!key.trim()) { this.$('#editor-error').textContent = 'Enter a non-empty key.'; return; }
      if (!this._editing && Object.hasOwn(this._values, key)) {
        this.$('#editor-error').textContent = 'This key already exists. Use its Edit button to change the value.'; return;
      }
      let value = this.$('#value').value;
      try { if (this.$('#type').value === 'json') value = JSON.parse(value); }
      catch { this.$('#editor-error').textContent = 'Invalid JSON. Check quotes, commas, and brackets.'; return; }
      this.mutate('set', { key, value });
    });
  }

  $(selector) { return this.shadowRoot.querySelector(selector); }

  set hass(hass) {
    this._hass = hass;
    this.$('ha-menu-button').hass = hass;
    const stores = Object.values(hass.states).filter((state) => state.entity_id.startsWith('sensor.') &&
      typeof state.attributes.kv_storage_store === 'string' && !['unavailable', 'unknown'].includes(state.state))
      .sort((a, b) => a.attributes.kv_storage_store.localeCompare(b.attributes.kv_storage_store));
    const signature = stores.map((state) => `${state.entity_id}:${state.attributes.kv_storage_store}`).join('|');
    if (signature !== this._storeSignature) {
      this._storeSignature = signature;
      this.$('#stores').replaceChildren(...stores.map((state) => {
        const option = document.createElement('option');
        option.value = option.textContent = state.attributes.kv_storage_store;
        return option;
      }));
    }
    if (!stores.some((state) => state.attributes.kv_storage_store === this._selected)) {
      this._selected = stores[0]?.attributes.kv_storage_store || '';
    }
    // Never let an open editor silently switch its write destination.
    if (this.$('#editor').open && this._editorStore !== this._selected) this.$('#editor').close();
    this.$('#stores').value = this._selected;
    this.setBusy(this._busy);
    const state = stores.find((state) => state.attributes.kv_storage_store === this._selected);
    this.$('#entity').textContent = state?.entity_id || 'No stores available';
    if (state !== this._snapshot || !state) {
      this._snapshot = state;
      this.load();
    }
  }

  set narrow(value) { this.$('ha-menu-button').narrow = value; }

  status(message, error = false) {
    this.$('#status').textContent = message;
    this.$('#status').classList.toggle('error', error);
  }

  async load() {
    const request = ++this._request;
    if (!this._selected) { this._values = {}; this.renderValues(); return; }
    this.$('#count').textContent = 'Loading…';
    try {
      const result = await this._hass.callWS({ type: 'call_service', domain: 'kv_storage', service: 'get',
        service_data: { store: this._selected }, return_response: true });
      if (request !== this._request) return;
      this._values = result.response.values;
      if (this.$('#status').classList.contains('error')) this.status('');
      this.renderValues();
    } catch (error) {
      if (request === this._request) {
        this._values = {};
        this.renderValues();
        this.$('#count').textContent = 'Unable to load';
        this.status(error.message || 'Could not load this store. Try refreshing.', true);
      }
    }
  }

  renderValues() {
    const query = this.$('#search').value.trim().toLowerCase();
    const all = Object.entries(this._values).sort(([a], [b]) => a.localeCompare(b));
    const entries = all.filter(([key, value]) => `${key} ${JSON.stringify(value)}`.toLowerCase().includes(query));
    this.$('#count').textContent = query ? `${entries.length} of ${all.length} entries` : `${all.length} ${all.length === 1 ? 'entry' : 'entries'}`;
    this.$('tbody').replaceChildren(...entries.map(([key, value]) => {
      const row = document.createElement('tr');
      const name = document.createElement('td'); name.className = 'key'; name.textContent = key;
      const cell = document.createElement('td');
      const code = document.createElement('pre'); code.className = 'value';
      code.textContent = JSON.stringify(value, null, 2);
      if (typeof value === 'boolean') code.classList.add('bool');
      if (value === null) code.classList.add('null');
      cell.append(code);
      const type = document.createElement('td'); type.className = 'type type-col';
      type.textContent = value === null ? 'Null' : Array.isArray(value) ? 'Array' : ({string:'Text', number:'Number', boolean:'Boolean', object:'Object'})[typeof value];
      const actions = document.createElement('td'); actions.className = 'actions-col';
      const edit = document.createElement('button'); edit.className = 'icon'; edit.innerHTML = kvIcon('edit');
      edit.title = `Edit ${key}`; edit.setAttribute('aria-label', edit.title);
      edit.addEventListener('click', () => this.openEditor(key, value));
      const remove = document.createElement('button'); remove.className = 'icon danger'; remove.innerHTML = kvIcon('delete');
      remove.title = `Delete ${key}`; remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => {
        if (window.confirm(`Delete “${key}” from ${this._selected}? This cannot be undone.`)) this.mutate('delete', { key });
      });
      actions.append(edit, remove); row.append(name, cell, type, actions); return row;
    }));
    this.$('#empty').hidden = entries.length > 0;
    this.$('#empty h3').textContent = !this._selected ? 'Create your first store' : query ? 'No matching entries' : 'This store is ready';
    this.$('#empty p').textContent = !this._selected ? 'Open Manage stores to add KV Storage.' : query ? 'Try another key or value, or clear your search.' : 'Select Add entry to save your first value.';
    this.setBusy(this._busy);
  }

  openEditor(key, value) {
    this._editing = key !== undefined;
    this._editorStore = this._selected;
    this.$('form').reset();
    this.$('#editor-title').textContent = this._editing ? 'Edit entry' : 'Add entry';
    this.$('#key').value = key ?? '';
    this.$('#key').readOnly = this._editing;
    this.$('#type').value = !this._editing || typeof value === 'string' ? 'text' : 'json';
    this.$('#value').value = !this._editing ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    this.$('#editor-error').textContent = '';
    this.updateHint();
    this.$('#editor').showModal();
    this.$(this._editing ? '#value' : '#key').focus();
  }

  updateHint() {
    this.$('#value-help').textContent = this.$('#type').value === 'text' ? 'Text preserves leading zeroes in codes, such as 0012.' : 'Enter valid JSON: a number, boolean, array, object, or null.';
  }

  setBusy(busy) {
    this._busy = busy;
    this.shadowRoot.querySelectorAll('button, input, select, textarea').forEach((element) => { element.disabled = busy; });
    this.$('#add').disabled = busy || !this._selected;
    this.$('#refresh').disabled = busy || !this._selected;
    this.$('#stores').disabled = busy || !this._selected;
  }

  async mutate(service, fields) {
    if (this._busy || !this._selected) return;
    const store = service === 'set' ? this._editorStore : this._selected;
    this.setBusy(true);
    try {
      await this._hass.callService('kv_storage', service, { store, ...fields });
      this.status(service === 'set' ? `Saved “${fields.key}”.` : `Deleted “${fields.key}”.`);
      if (service === 'set') this.$('#editor').close();
      await this.load();
    } catch (error) {
      const message = error.message || 'The operation failed. Try again.';
      if (service === 'set' && this.$('#editor').open) this.$('#editor-error').textContent = message;
      else this.status(message, true);
    } finally { this.setBusy(false); }
  }
}
if (!customElements.get('kv-storage-panel')) customElements.define('kv-storage-panel', KVStoragePanel);
