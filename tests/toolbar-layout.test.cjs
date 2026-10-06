const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// CSS-contract regressions for the real 1180px English toolbar collision.
// These check overflow-prevention rules; rendered geometry is verified separately.
const html = fs.readFileSync(process.env.APP_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
const source = payload ? require('node:zlib').gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8') : html;
const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
const desktop = css.slice(0, css.indexOf('@media'));
function declarations(selector, styles = desktop) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = styles.match(new RegExp('(?:^|})\\s*' + escaped + '\\{([^}]+)\\}'));
  assert.ok(rule, `CSS rule exists: ${selector}`);
  return Object.fromEntries(rule[1].split(';').filter(Boolean).map(item => item.split(':').map(part => part.trim())));
}

test('desktop toolbar and its controls wrap before exports collide with paging', () => {
  assert.equal(declarations('.panel-toolbar')['flex-wrap'], 'wrap');
  assert.equal(declarations('.panel-toolbar').flex, 'none', 'Wrapped rows retain their full height');
  const controls = declarations('.data-controls');
  assert.equal(controls['flex-wrap'], 'wrap');
  assert.equal(controls.flex, '1 1 420px', 'Reserve a useful control row before wrapping the pager');
  assert.equal(controls['min-width'], '0');
  assert.equal(controls['max-width'], '100%');
});

test('search and export group can fit the available desktop or narrow mobile width', () => {
  const search = declarations('.search-box');
  assert.equal(search['min-width'], '0');
  assert.equal(search.flex, '1 1 180px');
  const exports = declarations('.export-group');
  assert.equal(exports['flex-wrap'], 'wrap', 'English export labels can use separate rows on 320px screens');
  assert.equal(exports['min-width'], '0');
  assert.equal(exports['max-width'], '100%');
});

test('large page counts wrap without shrinking pager hit targets or crossing export controls', () => {
  const pager = declarations('.pager');
  assert.equal(pager['flex-wrap'], 'wrap');
  assert.equal(pager['min-width'], '0');
  assert.equal(pager['max-width'], '100%');
  assert.equal(declarations('.pager button').flex, 'none');
  assert.equal(declarations('.panel-status')['overflow-wrap'], 'anywhere');
  assert.equal(declarations('.page-label')['overflow-wrap'], 'anywhere');
  assert.equal(declarations('.page-label')['max-width'], '100%');
});

test('release metadata and visible badge identify patch 1.0.1', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.config.json'), 'utf8'));
  assert.equal(config.version, '1.0.1');
  assert.match(source, /class="version-badge">v1\.0\.1<\/span>/);
});
