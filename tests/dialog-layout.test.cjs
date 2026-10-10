const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const targets = process.argv.slice(2);
if (!targets.length) targets.push(process.env.APP_HTML || 'src/index.template.html');
for (const target of targets) {
  const html = fs.readFileSync(path.resolve(root, target), 'utf8');
  const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  const source = payload ? gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8') : html;
  const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
  function rule(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp('(?:^|})\\s*' + escaped + '\\{([^}]+)\\}'));
    return Object.fromEntries((match?.[1] || '').split(';').filter(Boolean).map(d => d.split(':').map(s => s.trim())));
  }
  // CSS contracts complement native rendered geometry. Removing title wrapping
  // and shrink constraints recreates the 1306px overflow at a 960x757 viewport.
  test(`${target}: dialog body shares the actual bounded height with its header`, () => {
    assert.equal(rule('dialog[open]').display, 'flex');
    assert.equal(rule('dialog[open]')['flex-direction'], 'column');
    assert.equal(rule('.dialog-head').flex, 'none');
    assert.equal(rule('.dialog-body')['min-height'], '0');
    assert.equal(rule('.dialog-head h2')['min-width'], '0');
    assert.equal(rule('.dialog-head h2')['overflow-wrap'], 'anywhere');
    assert.equal(rule('.dialog-head h2')['max-height'], 'min(4.5em,30dvh)');
    assert.equal(rule('.dialog-head h2').overflow, 'auto');
    assert.equal(rule('.close-btn').flex, 'none');
    assert.match(rule('dialog')['max-height'], /100dvh/);
    assert.equal(rule('.dialog-body').overflow, 'auto');
  });
  test(`${target}: bounded long-title scroll areas are keyboard reachable`, () => {
    for (const id of ['detailTitle', 'profileTitle']) {
      assert.match(source, new RegExp('<h2 id="' + id + '" tabindex="0"'));
    }
    assert.ok(rule('.dialog-head h2:focus-visible').outline);
  });
  test(`${target}: modal scrolling cannot move the background document`, () => {
    assert.equal(rule('html:has(dialog[open])').overflow, 'hidden');
    assert.equal(rule('.dialog-body')['overscroll-behavior'], 'contain');
  });
}
