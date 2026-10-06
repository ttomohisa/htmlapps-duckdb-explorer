const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Execute the production functions with a tiny DOM/query double. No database,
// WASM, browser, network, or duplicated application implementation is involved.
// Arrow-specific cases load the pinned library already embedded in the release.
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
const functions = ['t', 'applyLanguage', 'renderColumns', 'renderRelationHead', 'escapeHtml', 'formatCount', 'sqlIdent', 'arrowRows', 'normalizeValue', 'safeValue', 'disposeDatabase', 'selectObject', 'buildWhereClause', 'buildOrderClause', 'refreshQuery', 'loadPage', 'renderCell', 'dataToolbarHtml', 'renderFilterSummary', 'renderData', 'renderDataFromCache', 'bindDataControls', 'csvCell', 'safeFilenamePart', 'downloadText', 'exportVisible', 'renderRelationError', 'exportSqlResult', 'downloadSqlText', 'openRowDetail', 'openSqlRowDetail'];
const stateHelpers = ['isArrowRecord', 'relationRequestKey', 'isRelationRequestCurrent', 'hasCurrentRelationResult', 'beginRelationLoad', 'renderRelationState', 'setRelationError'];
function element() {
  const listeners = new Map();
  return { innerHTML: '', textContent: '', value: '', disabled: false, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, querySelectorAll() { return []; }, append() {}, remove() {}, click() { return this.fire('click'); }, close() {}, showModal() {}, focus() {}, addEventListener(type, fn) { listeners.set(type, fn); }, fire(type, event = {}) { return listeners.get(type)?.(event); } };
}
function setup(Arrow) {
  const nodes = new Map(), dynamicNodes = [], timers = new Map(), downloads = [], blobs = new Map(), toasts = [];
  let timerId = 0;
  const dataPanel = element();
  Object.defineProperty(dataPanel, 'innerHTML', { get() { return this.html || ''; }, set(html) { this.html = html; nodes.clear(); dynamicNodes.length = 0; for (const match of html.matchAll(/<(?:button|th)\b([^>]*)>/g)) { const node = element(), selectors = []; for (const attr of match[1].matchAll(/data-([a-z-]+)(?:="([^"]*)")?/g)) { node.dataset[attr[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = attr[2] || ''; selectors.push(`[data-${attr[1]}]`); } if (/class="cell-btn"/.test(match[1])) selectors.push('.cell-btn'); if (selectors.length) dynamicNodes.push({ node, selectors }); } for (const match of html.matchAll(/<(?:input|button)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) { const node = element(); node.value = match[1].match(/\bvalue="([^"]*)"/)?.[1] || ''; node.disabled = /\bdisabled\b/.test(match[1]); nodes.set(match[2], node); } } });
  const el = { dataPanel, columnsPanel: element(), profileDialog: element(), overviewView: element(), comparisonView: element(), sqlView: element(), emptyRelation: element(), relationView: element(), relationKicker: element(), relationName: element(), rowCount: element(), columnCount: element(), detailTitle: element(), detailMeta: element(), detailValue: element(), detailDialog: element() };
  const context = vm.createContext({ el, Blob, Date, Map, ArrayBuffer, Uint8Array, window: { innerWidth: 1000, Arrow }, console: { error() {} }, StandaloneAssets: { revoke() {} }, URL: { createObjectURL(blob) { const url = 'blob:' + blobs.size; blobs.set(url, blob); return url; }, revokeObjectURL() {} }, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }, document: { documentElement: {}, querySelectorAll(selector) { return dynamicNodes.filter(item => item.selectors.includes(selector)).map(item => item.node); }, body: element(), createElement() { const a = element(); a.click = () => downloads.push({ name: a.download, blob: blobs.get(a.href) }); return a; } }, $: id => id === 'langBtn' ? element() : nodes.get(id), toast: message => toasts.push(message), renderObjectTree() {}, renderColumns() {}, renderRelationHead() {}, updateFilterDialogOptions() {}, setMobileSection() {} });
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
  assertUnavailable(h); for (const id of ['exportCsv', 'exportJson', 'firstPage', 'prevPage', 'nextPage', 'lastPage']) assert.equal(h.nodes.get(id).disabled, true, `${id} is disabled while search is pending`); h.language('ja'); assertLoading(h);
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

const pagerIds = ['firstPage', 'prevPage', 'nextPage', 'lastPage'];
function assertPager(h, disabled) {
  for (const [index, id] of pagerIds.entries()) {
    assert.ok(h.nodes.has(id), `${id} is rendered`);
    assert.equal(h.nodes.get(id).disabled, disabled[index], `${id} boundary state`);
  }
}
for (const total of [0n, 1n, 100n, 200n, 201n, 9007199254740993123n]) test(`first/last paging uses exact BigInt boundaries for ${total} rows`, async () => {
  const h = setup(), issued = [];
  Object.assign(h.state, { totalRows: total, filteredRows: total, pageSize: 100n });
  const lastPage = total === 0n ? 0n : (total - 1n) / 100n;
  h.state.conn = { query: async sql => { issued.push(sql); const offset = BigInt(sql.match(/OFFSET (\d+)$/)[1]); return table(total ? [{ id: offset + 1n }] : []); } };
  await h.call('loadPage');
  assertPager(h, [true, true, lastPage === 0n, lastPage === 0n]);
  await h.nodes.get('firstPage').click(); assert.equal(issued.length, 1, 'Current boundary does not query');
  await h.nodes.get('lastPage').click();
  assert.equal(h.state.page, lastPage);
  assert.equal(issued.length, lastPage ? 2 : 1);
  assert.match(issued.at(-1), new RegExp(`LIMIT 100 OFFSET ${lastPage * 100n}$`));
  assertPager(h, [lastPage === 0n, lastPage === 0n, true, true]);
  await h.nodes.get('lastPage').click(); assert.equal(issued.length, lastPage ? 2 : 1);
  if (total) {
    h.call('exportVisible', 'json');
    assert.equal(h.downloads[0].name, `fictional-main-orders-page-${lastPage + 1n}.json`);
    assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [{ id: String(lastPage * 100n + 1n) }]);
    h.call('exportVisible', 'csv');
    assert.equal(await h.downloads[1].blob.text(), `id\r\n${lastPage * 100n + 1n}`);
  } else assertUnavailable(h);
  await h.nodes.get('firstPage').click(); assert.equal(h.state.page, 0n);
  assertPager(h, [true, true, lastPage === 0n, lastPage === 0n]);
});
test('all four pager controls have Japanese and English accessible names and titles', async () => {
  const h = setup(); await ready(h);
  for (const language of ['ja', 'en']) {
    h.language(language);
    for (const id of pagerIds) {
      const label = translations[language][id]; assert.ok(label, `${language}.${id}`);
      const button = h.el.dataPanel.innerHTML.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))[0];
      assert.ok(button.includes(`aria-label="${label}"`)); assert.ok(button.includes(`title="${label}"`));
    }
  }
});
test('repeated saved boundary controls cannot start another page during loading or error', async () => {
  const h = setup(); h.state.pageSize = 100n; h.state.totalRows = h.state.filteredRows = 201n; await ready(h);
  const first = h.nodes.get('firstPage'), last = h.nodes.get('lastPage'), q = deferred(); let calls = 0;
  h.state.conn.query = () => { calls++; return q.promise; };
  const pending = last.click(); await last.click(); await first.click();
  assert.equal(calls, 1); assert.equal(h.state.page, 2n);
  for (const language of ['ja', 'en']) { h.language(language); assertLoading(h); }
  q.reject(new Error('Boundary page failed')); await pending;
  await first.click(); await last.click(); assert.equal(calls, 1);
  h.language('ja'); assert.match(h.el.dataPanel.innerHTML, /Boundary page failed/); assertUnavailable(h);
  h.state.conn.query = async () => table([{ id: 201n }]); await h.call('loadPage');
  h.language('en'); assertPager(h, [false, false, true, true]);
});
test('debounced search disables boundary controls immediately and blocks saved listeners', async () => {
  const h = setup(); h.state.pageSize = 100n; h.state.totalRows = h.state.filteredRows = 201n; await ready(h);
  const saved = pagerIds.map(id => h.nodes.get(id)); let queries = 0; h.state.conn.query = async sql => { queries++; return table([{ id: 1n }]); };
  const search = h.nodes.get('rowSearch'); search.value = 'new'; search.fire('input');
  assertPager(h, [true, true, true, true]);
  for (const button of saved) await button.click(); assert.equal(queries, 0); assert.equal(h.state.page, 0n); assertUnavailable(h);
});
for (const outcome of ['success', 'failure']) test(`stale boundary page ${outcome} cannot replace a newer search/filter/sort result`, async () => {
  const h = setup(); h.state.pageSize = 100n; h.state.totalRows = h.state.filteredRows = 301n; await ready(h);
  const q = deferred(); h.state.conn.query = () => q.promise; const pending = h.nodes.get('lastPage').click();
  h.state.search = 'new'; h.state.filters = [{ column: 'id', operator: 'equals', value: '201' }]; h.state.sort = { column: 'id', direction: 'desc' };
  const issued = [];
  h.state.conn.query = async sql => { issued.push(sql); return sql.includes('count(*)') ? table([{ row_count: 201n }], ['row_count']) : table([{ id: /OFFSET 200$/.test(sql) ? 201n : 1n }]); };
  await h.call('refreshQuery'); await h.nodes.get('lastPage').click();
  if (outcome === 'success') q.resolve(table([{ id: 'stale' }])); else q.reject(new Error('stale boundary failure'));
  await pending; h.language('ja'); h.language('en');
  assert.equal(h.state.page, 2n); assert.match(issued.at(-1), /WHERE .*ORDER BY "id" DESC NULLS LAST LIMIT 100 OFFSET 200$/);
  assertPager(h, [false, false, true, true]); h.call('exportVisible', 'json');
  assert.equal(h.downloads[0].name, 'fictional-main-orders-page-3.json'); assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [{ id: '201' }]);
});

function specialRecord() {
  const value = JSON.parse('{"__proto__":{"nested":"kept"},"constructor":"constructor data","toString":"string data"}');
  value.array = [JSON.parse('{"__proto__":"array data"}'), 9007199254740993n, null];
  value.map = new Map([['__proto__', JSON.parse('{"__proto__":"map data"}')], ['constructor', 7n]]);
  value.date = new Date('2026-10-06T00:00:00.000Z');
  value.binary = new Uint8Array([0, 128, 255]).subarray(1);
  return value;
}
const specialExpected = JSON.parse('{"__proto__":{"nested":"kept"},"constructor":"constructor data","toString":"string data","array":[{"__proto__":"array data"},"9007199254740993",null],"map":{"__proto__":{"__proto__":"map data"},"constructor":"7"},"date":"2026-10-06T00:00:00.000Z","binary":{"bytes":[128,255]}}');
test('normalization preserves own special keys recursively without changing object prototypes', () => {
  const h = setup(), input = specialRecord(), prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype);
  const normalized = h.call('normalizeValue', input);
  assert.ok(Object.hasOwn(normalized, '__proto__'));
  const descriptor = Object.getOwnPropertyDescriptor(normalized, '__proto__');
  assert.equal(descriptor.enumerable, true); assert.equal(descriptor.writable, true); assert.equal(descriptor.configurable, true); assert.equal(descriptor.get, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), specialExpected);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototypeBefore);
  assert.equal(Object.getPrototypeOf(normalized), Object.getPrototypeOf(h.call('normalizeValue', {})), 'Result prototype was not replaced');
  assert.equal(Object.getPrototypeOf(input), Object.prototype, 'Input stays unchanged');
});
for (const sql of [false, true]) for (const protoValue of ['scalar data', 42n, null, specialRecord()]) test(`${sql ? 'SQL' : 'relation'} JSON and full record details retain own __proto__ (${protoValue === null ? 'null' : typeof protoValue})`, async () => {
  const h = setup(), prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype);
  const input = JSON.parse('{"__proto__":null,"constructor":"ordinary","toString":"also ordinary"}');
  input.__proto__ = protoValue;
  const expected = JSON.parse('{"__proto__":null,"constructor":"ordinary","toString":"also ordinary"}');
  expected.__proto__ = typeof protoValue === 'bigint' ? '42' : typeof protoValue === 'object' && protoValue !== null ? specialExpected : protoValue;
  await ready(h, [input], Object.keys(input));
  Object.assign(h.state, { sqlHasResult: true, sqlLastFields: Object.keys(input), sqlLastRows: [input] });
  h.call(sql ? 'exportSqlResult' : 'exportVisible', 'json');
  assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [expected]);
  h.call(sql ? 'openSqlRowDetail' : 'openRowDetail', 0);
  assert.deepEqual(JSON.parse(h.el.detailValue.textContent), expected);
  assert.equal(h.state.detailCopyText, h.el.detailValue.textContent);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototypeBefore);
});
for (const sql of [false, true]) test(`${sql ? 'SQL' : 'relation'} nested CSV preserves special keys, BOM, and quoted data`, async () => {
  const h = setup(), input = JSON.parse('{"__proto__":"quoted, value","nested":null}'); input.nested = specialRecord();
  await ready(h, [input], Object.keys(input));
  Object.assign(h.state, { sqlHasResult: true, sqlLastFields: Object.keys(input), sqlLastRows: [input] });
  h.call(sql ? 'exportSqlResult' : 'exportVisible', 'csv');
  const bytes = Buffer.from(await h.downloads[0].blob.arrayBuffer());
  assert.equal(bytes.toString('utf8'), '\uFEFF__proto__,nested\r\n"quoted, value","' + JSON.stringify(specialExpected).replaceAll('"', '""') + '"');
});

for (const sql of [false, true]) test(`${sql ? 'SQL' : 'relation'} record details independently preserve nested own data keys`, async () => {
  const h = setup(), input = specialRecord(); await ready(h, [input], Object.keys(input));
  Object.assign(h.state, { sqlHasResult: true, sqlLastFields: Object.keys(input), sqlLastRows: [input] });
  h.call(sql ? 'openSqlRowDetail' : 'openRowDetail', 0);
  assert.deepEqual(JSON.parse(h.el.detailValue.textContent), specialExpected);
});

test('pager can wrap its controls at narrow widths instead of widening the page', () => {
  assert.match(source, /\.pager\{[^}]*flex-wrap:wrap/);
});

// Load the actual pinned Arrow runtime from the standalone artifact. This works
// in a fresh checkout too: no npm install, cache, browser, or database is needed.
function embeddedArrow() {
  const built = source.includes('__EMBEDDED_ASSET_BUNDLE_JSON__') ? fs.readFileSync(path.join(__dirname, '../duckdb-explorer.html'), 'utf8') : source;
  const bundle = JSON.parse(built.match(/^  const assetBundle = (.*);$/m)[1]);
  const dependency = bundle.dependencies['apache-arrow']; assert.equal(dependency.version, '17.0.0');
  const asset = dependency.assets.umd, bytes = Buffer.from(asset.base64, 'base64');
  const script = asset.compression === 'gzip' ? require('node:zlib').gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  const module = { exports: {} }; new Function('module', 'exports', script)(module, module.exports); return module.exports;
}
const Arrow = embeddedArrow();
function arrowRecord(values) {
  const fields = Object.keys(values).map(name => new Arrow.Field(name, new Arrow.Utf8(), true));
  const children = Object.values(values).map(value => Arrow.vectorFromArray([value], new Arrow.Utf8()).data[0]);
  const data = Arrow.makeData({ type: new Arrow.Struct(fields), length: 1, children });
  return new Arrow.Table(new Arrow.RecordBatch(new Arrow.Schema(fields), data));
}
for (const sql of [false, true]) test(`pinned Arrow StructRow ingestion preserves special fields in ${sql ? 'SQL' : 'relation'} exports and details`, async () => {
  const h = setup(Arrow), input = JSON.parse('{"__proto__":"kept","constructor":"ordinary","toString":"also ordinary","toJSON":"column data"}');
  const result = arrowRecord(input); h.state.conn = { query: async () => result }; await h.call('loadPage');
  const rows = h.call('arrowRows', result);
  assert.equal(rows[0].__proto__, 'kept'); assert.equal(rows[0].constructor, 'ordinary'); assert.equal(rows[0].toJSON, 'column data');
  Object.assign(h.state, { sqlHasResult: true, sqlLastFields: result.schema.fields.map(f => f.name), sqlLastRows: rows });
  h.call(sql ? 'exportSqlResult' : 'exportVisible', 'json'); assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), [input]);
  h.call(sql ? 'openSqlRowDetail' : 'openRowDetail', 0); assert.deepEqual(JSON.parse(h.el.detailValue.textContent), input);
  h.call(sql ? 'exportSqlResult' : 'exportVisible', 'csv'); assert.equal(await h.downloads[1].blob.text(), '__proto__,constructor,toString,toJSON\r\nkept,ordinary,also ordinary,column data');
});
test('pinned Arrow StructRow and MapRow nested normalization preserves own special keys', () => {
  const h = setup(Arrow), input = JSON.parse('{"__proto__":"struct value","constructor":"struct constructor","toString":"struct string"}');
  const row = Array.from(arrowRecord(input))[0];
  const entryType = new Arrow.Struct([new Arrow.Field('key', new Arrow.Utf8(), false), new Arrow.Field('value', new Arrow.Utf8(), true)]);
  const type = new Arrow.Map_(new Arrow.Field('entries', entryType, false));
  const map = Arrow.vectorFromArray([new Map([['__proto__', 'map value'], ['constructor', 'map constructor']])], type).get(0);
  const expectedMap = JSON.parse('{"__proto__":"map value","constructor":"map constructor"}');
  const prototype = Object.getPrototypeOf(h.call('normalizeValue', {})), before = Object.getOwnPropertyDescriptors(prototype);
  const actual = h.call('normalizeValue', { row, map, array: [row, map], plain: specialRecord() });
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), { row: input, map: expectedMap, array: [input, expectedMap], plain: specialExpected });
  assert.deepEqual(Object.getOwnPropertyDescriptors(prototype), before);
});
