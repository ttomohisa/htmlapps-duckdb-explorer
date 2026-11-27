const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(process.env.APP_HTML || path.join(root, 'src/index.template.html'), 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
const source = payload ? gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString() : html;
const bundle = source.match(/^  const assetBundle = (.*);$/m)[1];

test('the standalone demo expands to the repository sample database', { skip: bundle.startsWith('__') }, () => {
  const asset = JSON.parse(bundle).demoDatabase;
  assert.ok(asset, 'The release contains an embedded demo database');
  assert.equal(asset.compression, 'gzip');
  const sample = fs.readFileSync(path.join(root, 'test-data/browser-kitty-sample.duckdb'));
  assert.equal(asset.originalBytes, sample.length);
  assert.deepEqual(gunzipSync(Buffer.from(asset.base64, 'base64')), sample);
});

function opening(inflateAsset) {
  const start = source.indexOf('  async function openFile(');
  const end = source.indexOf('\n  async function ', start + 1);
  const state = {}, errors = [];
  const demoError = { hidden: true }, demoButton = { focus() {} };
  const context = vm.createContext({
    state, el: { fileName: {}, fileMeta: {} }, clearTimeout, console: { error() {} },
    inflateAsset, assetBundle: { demoDatabase: {} }, File: require('node:buffer').File,
    $: id => id === 'demoError' ? demoError : demoButton, t: key => key,
    showWorkspace() {}, showIntro() {}, renderFullState() {}, formatBytes() {}, disposeDatabase() {},
    loadDuckDBApi: () => ({ DuckDBDataProtocol: { BROWSER_FILEREADER: 1 }, DuckDBAccessMode: { READ_ONLY: 1 } }),
    initializeDuckDBRuntime() {
      state.db = { registerFileHandle() {}, open() {}, connect() { return {}; } };
    },
    hardenDuckDBSession() {}, loadObjects() {}, toast() {}, renderOpenError(error) { errors.push(error); }
  });
  vm.runInContext('let openFileGeneration=0,openFileQueue=Promise.resolve();\n' + source.slice(start, end), context);
  return { open: context.openFile, state, demoError, errors };
}

test('an invalid sample returns to the file chooser with a demo error', async () => {
  const page = opening(async () => { throw new Error('Invalid gzip'); });
  await page.open(null, true);
  assert.equal(page.demoError.hidden, false);
  await page.open({ name: 'selected.duckdb', size: 4 });
  assert.equal(page.state.file.name, 'selected.duckdb');
  assert.deepEqual(page.errors, []);
});

test('a late sample decoding failure cannot interrupt a subsequently selected file', async () => {
  let rejectSample;
  const page = opening(() => new Promise((resolve, reject) => { rejectSample = reject; }));
  const sample = page.open(null, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof rejectSample, 'function', 'The demo started decompressing');
  const file = page.open({ name: 'latest.duckdb', size: 4 });
  rejectSample(new Error('Replaced during decoding'));
  await Promise.all([file, sample]);
  assert.equal(page.state.file.name, 'latest.duckdb');
  assert.equal(page.demoError.hidden, true);
  assert.deepEqual(page.errors, []);
});
