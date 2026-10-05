const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Execute the production functions with a tiny DOM/query double. No database,
// WASM, browser, network, or duplicated application implementation is involved.
const html = fs.readFileSync(process.env.APP_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
const source = payload ? require('node:zlib').gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8') : html;
function actual(name, optional = false) {
  const start = source.search(new RegExp('^  (?:async )?function ' + name + '\\(', 'm'));
  if (optional && start < 0) return '';
  assert.ok(start >= 0, `Production function ${name} exists`);
  const next = source.slice(start + 1).search(/^  (?:async )?function /m);
  return source.slice(start, next < 0 ? source.length : start + 1 + next).trim();
}
const functions = ['t', 'applyLanguage', 'renderColumns', 'renderRelationHead', 'escapeHtml', 'formatCount', 'sqlIdent', 'arrowRows', 'normalizeValue', 'safeValue', 'disposeDatabase', 'selectObject', 'buildWhereClause', 'buildOrderClause', 'refreshQuery', 'loadPage', 'renderCell', 'dataToolbarHtml', 'renderFilterSummary', 'renderData', 'renderDataFromCache', 'bindDataControls', 'csvCell', 'safeFilenamePart', 'downloadText', 'exportVisible', 'renderRelationError'];
const stateHelpers = ['relationRequestKey', 'isRelationRequestCurrent', 'hasCurrentRelationResult', 'beginRelationLoad', 'renderRelationState', 'setRelationError'];
function element() {
  const listeners = new Map();
  return { innerHTML: '', textContent: '', value: '', disabled: false, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, querySelectorAll() { return []; }, append() {}, remove() {}, click() { return this.fire('click'); }, close() {}, focus() {}, addEventListener(type, fn) { listeners.set(type, fn); }, fire(type, event = {}) { return listeners.get(type)?.(event); } };
}
function setup() {
  const nodes = new Map(), dynamicNodes = [], timers = new Map(), downloads = [], blobs = new Map(), toasts = [];
  let timerId = 0;
  const dataPanel = element();
  Object.defineProperty(dataPanel, 'innerHTML', { get() { return this.html || ''; }, set(html) { this.html = html; nodes.clear(); dynamicNodes.length = 0; for (const match of html.matchAll(/<(?:button|th)\b([^>]*)>/g)) { const node = element(), selectors = []; for (const attr of match[1].matchAll(/data-([a-z-]+)(?:="([^"]*)")?/g)) { node.dataset[attr[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = attr[2] || ''; selectors.push(`[data-${attr[1]}]`); } if (/class="cell-btn"/.test(match[1])) selectors.push('.cell-btn'); if (selectors.length) dynamicNodes.push({ node, selectors }); } for (const match of html.matchAll(/<(?:input|button)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) { const node = element(); node.value = match[1].match(/\bvalue="([^"]*)"/)?.[1] || ''; node.disabled = /\bdisabled\b/.test(match[1]); nodes.set(match[2], node); } } });
  const el = { dataPanel, columnsPanel: element(), profileDialog: element(), overviewView: element(), comparisonView: element(), sqlView: element(), emptyRelation: element(), relationView: element(), relationKicker: element(), relationName: element(), rowCount: element(), columnCount: element() };
  const context = vm.createContext({ el, Blob, Date, Map, ArrayBuffer, Uint8Array, window: { innerWidth: 1000 }, console: { error() {} }, StandaloneAssets: { revoke() {} }, URL: { createObjectURL(blob) { const url = 'blob:' + blobs.size; blobs.set(url, blob); return url; }, revokeObjectURL() {} }, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }, document: { documentElement: {}, querySelectorAll(selector) { return dynamicNodes.filter(item => item.selectors.includes(selector)).map(item => item.node); }, body: element(), createElement() { const a = element(); a.click = () => downloads.push({ name: a.download, blob: blobs.get(a.href) }); return a; } }, $: id => id === 'langBtn' ? element() : nodes.get(id), toast: message => toasts.push(message), renderObjectTree() {}, renderColumns() {}, renderRelationHead() {}, updateFilterDialogOptions() {}, setMobileSection() {} });
  const translations = source.slice(source.indexOf('  const I18N='), source.indexOf('  let lang='));
  assert.ok(translations.includes('helpTitle'), 'Real Japanese/English translations were extracted');
  const stateDeclaration = source.match(/^  const state=([^\n]+);$/m)[1];
  vm.runInContext(`${translations}\nlet lang='en'; globalThis.state=${stateDeclaration};\n${functions.map(name => actual(name)).join('\n')}\n${stateHelpers.map(name => actual(name, true)).join('\n')}`, context);
  const state = context.state;
  Object.assign(state, { selected: { schema: 'main', name: 'orders', type: 'table' }, columns: [{ column_name: 'id', data_type: 'INTEGER' }], file: { name: 'fictional.duckdb' }, totalRows: 2n, filteredRows: 2n, pageSize: 1n, viewMode: 'relation' });
  return { state, el, nodes, dynamicNodes, downloads, toasts, call: (name, ...args) => context[name](...args), language(lang) { vm.runInContext(`lang=${JSON.stringify(lang)}; applyLanguage()`, context); }, async flushTimers() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) await fn(); } };
}
function table(rows, fields = ['id']) { rows.schema = { fields: fields.map(name => ({ name })) }; return rows; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function ready(h, rows = [{ id: 1n }], fields = ['id']) { h.state.conn = { query: async () => table(rows, fields) }; await h.call('loadPage'); }
function assertUnavailable(h) { for (const format of ['json', 'csv']) h.call('exportVisible', format); assert.equal(h.downloads.length, 0, 'No stale rows may be downloaded'); }
function assertLoading(h) { assert.match(h.el.dataPanel.innerHTML, /spinner/); assert.doesNotMatch(h.el.dataPanel.innerHTML, /id="exportJson"|class="cell-btn"/); assertUnavailable(h); }

// Removing the state/identity guard would make these tests expose old rows,
// the wrong page filename, a hidden error, or an out-of-order query result.
test('language changes keep a pending page loading and block both exports', async () => {
  const h = setup(); await ready(h); const q = deferred(); h.state.conn.query = () => q.promise; h.state.page = 1n;
  const pending = h.call('loadPage');
  for (const lang of ['ja', 'en', 'ja']) { h.language(lang); assertLoading(h); }
  q.resolve(table([{ id: 2n }])); await pending;
  h.language('en'); assert.match(h.el.dataPanel.innerHTML, /Page 2 of 2/); h.call('exportVisible', 'json');
  assert.equal(h.downloads[0].name, 'fictional-main-orders-page-2.json');
  assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [{ id: '2' }]);
});
test('a failed page keeps its error across languages and can be retried', async () => {
  const h = setup(); await ready(h); h.state.page = 1n; h.state.conn.query = async () => { throw new Error('Fictional page failure'); }; await h.call('loadPage');
  for (const lang of ['ja', 'en']) { h.language(lang); assert.match(h.el.dataPanel.innerHTML, /error-card/); assert.match(h.el.dataPanel.innerHTML, /Fictional page failure/); assertUnavailable(h); }
  h.state.conn.query = async () => table([{ id: 2n }]); await h.call('loadPage'); h.language('ja');
  assert.doesNotMatch(h.el.dataPanel.innerHTML, /error-card/); h.call('exportVisible', 'json'); assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [{ id: '2' }]);
});
for (const condition of ['search', 'filter', 'sort']) test(`${condition} refresh owns count and row loading through language changes`, async () => {
  const h = setup(); await ready(h); h.state.page = 1n;
  if (condition === 'filter') h.state.filters = [{ column: 'id', operator: 'equals', value: '2' }];
  else h.state.search = '2';
  if (condition === 'sort') h.state.sort = { column: 'id', direction: 'desc' };
  const count = deferred(), rows = deferred(), issued = [];
  h.state.conn.query = sql => { issued.push(sql); return issued.length === 1 ? count.promise : rows.promise; };
  const pending = h.call('refreshQuery', condition !== 'sort'); h.language('ja'); assertLoading(h);
  count.resolve(table([{ row_count: 2n }], ['row_count'])); await Promise.resolve(); await Promise.resolve(); h.language('en'); assertLoading(h);
  rows.resolve(table([{ id: 2n }])); await pending;
  const where = issued[0].slice(issued[0].indexOf(' WHERE ')); assert.ok(issued[1].includes(where), 'Count and page use the same filter');
  if (condition === 'sort') assert.match(issued[1], /ORDER BY "id" DESC NULLS LAST LIMIT 1 OFFSET 1/);
  else assert.match(issued[1], /LIMIT 1 OFFSET 0/);
  h.call('exportVisible', 'json'); assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [{ id: '2' }]);
});
test('count failure remains an error, never a cached successful page', async () => {
  const h = setup(); await ready(h); h.state.search = 'fictional'; h.state.conn.query = async () => { throw new Error('Fictional count failure'); }; await h.call('refreshQuery');
  h.language('ja'); assert.match(h.el.dataPanel.innerHTML, /Fictional count failure/); assertUnavailable(h);
});
for (const outcome of ['success', 'failure']) test(`stale page ${outcome} cannot replace a newer result`, async () => {
  const h = setup(); await ready(h); const first = deferred(), second = deferred(); let index = 0;
  h.state.conn.query = () => ++index === 1 ? first.promise : second.promise;
  const a = h.call('loadPage'); h.state.page = 1n; const b = h.call('loadPage'); second.resolve(table([{ id: 2n }])); await b;
  if (outcome === 'success') first.resolve(table([{ id: 1n }])); else first.reject(new Error('Old failure'));
  await a; h.language('en'); assert.doesNotMatch(h.el.dataPanel.innerHTML, /Old failure/); h.call('exportVisible', 'json'); assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [{ id: '2' }]);
});
test('a changed request identity rejects rows even before the next debounced query', async () => {
  const h = setup(); await ready(h); const q = deferred(); h.state.conn.query = () => q.promise; const pending = h.call('loadPage'); h.state.search = 'newer';
  q.resolve(table([{ id: 99n }])); await pending; h.language('en'); assertLoading(h);
});
test('editing search immediately prevents exporting or relabeling the previous result', async () => {
  const h = setup(); await ready(h); const search = h.nodes.get('rowSearch'); search.value = 'fictional'; search.fire('input');
  assertUnavailable(h); for (const id of ['exportCsv', 'exportJson', 'prevPage', 'nextPage']) assert.equal(h.nodes.get(id).disabled, true, `${id} is disabled while search is pending`); h.language('ja'); assertLoading(h);
});
test('stale count cannot start a page query after the filter changes', async () => {
  const h = setup(); await ready(h); const count = deferred(); let calls = 0; h.state.search = 'old'; h.state.conn.query = () => { calls++; return count.promise; };
  const pending = h.call('refreshQuery'); h.state.search = 'new'; count.resolve(table([{ row_count: 99n }], ['row_count'])); await pending;
  assert.equal(calls, 1); assert.notEqual(h.state.filteredRows, 99n); assertUnavailable(h);
});
test('metadata load/failure stays loading/error across language changes', async () => {
  const h = setup(); await ready(h); const metadata = deferred(); h.state.conn.query = () => metadata.promise;
  const pending = h.call('selectObject', { schema: 'archive', name: 'fictional', type: 'view' }); h.language('ja'); assertLoading(h);
  metadata.reject(new Error('Fictional metadata failure')); await pending; h.language('en');
  assert.match(h.el.dataPanel.innerHTML, /Fictional metadata failure/); assert.match(h.el.columnsPanel.innerHTML, /Fictional metadata failure/); assertUnavailable(h);
});
test('database disposal invalidates exports before asynchronous cleanup completes', async () => {
  const h = setup(); await ready(h); const close = deferred(); h.state.conn.close = () => close.promise; const pending = h.call('disposeDatabase');
  assertUnavailable(h); close.resolve(); await pending; assert.equal(h.state.lastRows.length, 0);
});
test('an empty current page stays empty after language changes and cannot export', async () => {
  const h = setup(); await ready(h); h.state.filteredRows = 0n; h.state.totalRows = 0n; h.state.conn.query = async () => table([]); await h.call('loadPage');
  h.language('en'); assert.equal(h.nodes.get('exportCsv').disabled, true); assert.equal(h.nodes.get('exportJson').disabled, true); assert.match(h.el.dataPanel.innerHTML, /No matching rows/); assert.doesNotMatch(h.el.dataPanel.innerHTML, /class="cell-btn"/); assertUnavailable(h);
});
test('current-page CSV serialization retains BOM, CRLF, BigInt, quotes, null and nested values', async () => {
  const h = setup(); await ready(h, [{ id: 7n, note: 'a,"b\n', blank: null, nested: { n: 9n } }], ['id', 'note', 'blank', 'nested']); h.language('ja'); h.call('exportVisible', 'csv');
  const bytes = Buffer.from(await h.downloads[0].blob.arrayBuffer()); assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
  assert.equal(bytes.toString('utf8'), '\uFEFFid,note,blank,nested\r\n7,"a,""b\n",,"{""n"":""9""}"');
});

test('page buttons load the matching page and filename repeatedly', async () => {
  const h = setup(); await ready(h); h.state.conn.query = async sql => table([{ id: /OFFSET 1$/.test(sql) ? 2n : 1n }]);
  await h.nodes.get('nextPage').click(); h.language('ja'); await h.nodes.get('prevPage').click(); h.language('en');
  h.call('exportVisible', 'json'); assert.equal(h.downloads[0].name, 'fictional-main-orders-page-1.json'); assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [{ id: '1' }]);
});
test('a search debounce cannot run against a newly selected relation', async () => {
  const h = setup(); await ready(h); const search = h.nodes.get('rowSearch'); search.value = 'old search'; search.fire('input');
  const issued = []; h.state.conn.query = async sql => { issued.push(sql); if (sql.includes('information_schema')) return table([{ column_name: 'id', data_type: 'INTEGER' }]); if (sql.includes('count(*)')) return table([{ row_count: 2n }], ['row_count']); return table([{ id: 2n }]); };
  await h.call('selectObject', { schema: 'archive', name: 'new_orders', type: 'table' }); const calls = issued.length; await h.flushTimers(); assert.equal(issued.length, calls);
  h.language('en'); h.call('exportVisible', 'json'); assert.equal(h.downloads[0].name, 'fictional-archive-new_orders-page-1.json');
});
for (const change of ['page', 'size', 'schema', 'relation', 'filter', 'sort', 'file', 'connection']) test(`cached exports require the current ${change} identity`, async () => {
  const h = setup(); await ready(h);
  if (change === 'page') h.state.page = 1n;
  if (change === 'size') h.state.pageSize = 100n;
  if (change === 'schema') h.state.selected.schema = 'archive';
  if (change === 'relation') h.state.selected.name = 'other';
  if (change === 'filter') h.state.filters.push({ column: 'id', operator: 'equals', value: '9' });
  if (change === 'sort') h.state.sort = { column: 'id', direction: 'desc' };
  if (change === 'file') h.state.file = { name: 'other.duckdb' };
  if (change === 'connection') h.state.conn = { query: async () => table([{ id: 9n }]) };
  assertUnavailable(h); h.language('en'); assertLoading(h);
});

test('sort-header activation refreshes ownership and preserves its page offset', async () => {
  const h = setup(); h.state.page = 1n; await ready(h); const q = deferred(); let issued = ''; h.state.conn.query = sql => { issued = sql; return q.promise; };
  const header = h.dynamicNodes.find(item => item.selectors.includes('[data-sort]')).node; header.fire('keydown', { key: 'Enter', preventDefault() {} }); h.language('ja'); assertLoading(h); assert.match(issued, /ORDER BY "id" ASC NULLS LAST LIMIT 1 OFFSET 1/);
  q.resolve(table([{ id: 2n }])); await new Promise(setImmediate); h.call('exportVisible', 'json'); assert.equal(h.downloads[0].name, 'fictional-main-orders-page-2.json');
});
test('removing a filter chip resets the page and cannot resurrect the previous filtered rows', async () => {
  const h = setup(); h.state.filters = [{ column: 'id', operator: 'equals', value: '1' }]; await ready(h); const q = deferred(); let issued = ''; h.state.conn.query = sql => { issued = sql; return q.promise; };
  const remove = h.dynamicNodes.find(item => item.selectors.includes('[data-remove-filter]')).node; remove.click(); h.language('en'); assertLoading(h); assert.equal(h.state.filters.length, 0); assert.doesNotMatch(issued, / WHERE /); assert.match(issued, /OFFSET 0$/);
  q.resolve(table([{ id: 2n }])); await new Promise(setImmediate); h.call('exportVisible', 'json'); assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [{ id: '2' }]);
});
test('relation reselection recovers a failed page through metadata and row reload', async () => {
  const h = setup(); await ready(h); h.state.conn.query = async () => { throw new Error('Fictional failure'); }; await h.call('loadPage'); h.language('ja');
  h.state.conn.query = async sql => sql.includes('information_schema') ? table([{ column_name: 'id', data_type: 'INTEGER' }]) : sql.includes('count(*)') ? table([{ row_count: 2n }], ['row_count']) : table([{ id: 2n }]);
  await h.call('selectObject', h.state.selected); h.language('en'); assert.doesNotMatch(h.el.dataPanel.innerHTML, /error-card/); h.call('exportVisible', 'json'); assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [{ id: '2' }]);
});

// Current-use help copy is checked on every generated variant by the same CI path.
const help = source.match(/<dialog id="helpDialog">([\s\S]*?)<\/dialog>/)[1];
const translations = vm.runInNewContext('(' + source.match(/const I18N=(\{[\s\S]*?\n  \});/)[1] + ')');

test('help describes current use without version-scoped release notes', () => {
  assert.doesNotMatch(help, /v\d+\.(?:\d+|x)|helpVersion/);
  for (const language of ['ja', 'en']) {
    const text = Object.entries(translations[language]).filter(([key]) => key.startsWith('help')).map(([, value]) => value).join('\n');
    assert.doesNotMatch(text, /v\d+\.(?:\d+|x)|このバージョン|This version|stable release|正式版/);
    assert.match(translations[language].helpNote1, language === 'ja' ? /読み取り専用.*元のDuckDBファイルは変更しません/ : /read-only.*never modifies the original DuckDB file/);
  }
});

test('help keeps bilingual instructions and factual limitations', () => {
  for (const language of ['ja', 'en']) {
    for (const key of ['helpCanBody', 'helpPageExport', 'helpStep1', 'helpStep2', 'helpStep3', 'helpStep4', 'helpStep5', 'helpStep6', 'helpPrivacyBody', 'helpNote1', 'helpNote2', 'helpNote3']) {
      assert.ok(translations[language][key], `${language}.${key} remains available`);
    }
    for (const [, key] of help.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(translations[language][key], `${language}.${key} has a translation`);
  }
  assert.match(translations.ja.helpStep3, /100行/);
  assert.match(translations.en.helpStep3, /100 rows/);
  assert.match(translations.ja.helpStep4, /読み取り専用SQLを1文ずつ/);
  assert.match(translations.en.helpStep4, /one read-only/);
  assert.match(translations.ja.helpPageExport, /現在のページだけ/);
  assert.match(translations.en.helpPageExport, /only the current successfully loaded page/);
  assert.match(translations.ja.helpNote3, /開けない場合/);
  assert.match(translations.en.helpNote3, /may not open/);
});

test('application version remains visible outside the help dialog', () => {
  assert.match(source, /class="version-badge">v1\.0\.0<\/span>/);
});
