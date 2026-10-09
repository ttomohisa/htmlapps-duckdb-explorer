// A changed brand fill/radius or a stale embedded representation fails this contract.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)=(["'])(.*?)\2/g)].map(m => [m[1], m[3]]));
const compact = svg => svg.replace(/>\s+</g, '><').trim().replace(/'/g, '"').replace(/white/g, '#fff');
function background(svg, label) {
  const rects = [...svg.matchAll(/<rect\b[^>]*>/g)].map(m => attrs(m[0]));
  const bg = rects.find(a => Number(a.width) > 30 && Number(a.height) > 30 && /^#16624f$/i.test(a.fill || ''));
  assert.ok(bg, label + ': canonical background color');
  assert.equal(Number(bg.rx), Number(bg.width) / 4, label + ': horizontal radius');
  assert.equal(Number(bg.ry || bg.rx), Number(bg.height) / 4, label + ': vertical radius');
}
test('brand asset, embedded favicon and header keep canonical color and exact 25% corners', () => {
  const asset = read('assets/favicon.svg');
  background(asset, 'asset');
  for (const file of ['src/index.template.html', 'dist/index.html', 'duckdb-explorer.html']) {
    const html = read(file);
    const link = [...html.matchAll(/<link\b[^>]*>/g)].map(m => attrs(m[0])).find(a => a.rel === 'icon');
    assert.ok(link && link.href.startsWith('data:image/svg+xml'), file + ': embedded favicon');
    const data = link.href.slice(link.href.indexOf(',') + 1);
    const icon = link.href.startsWith('data:image/svg+xml;base64,') ? Buffer.from(data, 'base64').toString('utf8') : decodeURIComponent(data);
    assert.equal(compact(icon), compact(asset), file + ': favicon asset parity');
    const header = html.match(/<header\b[\s\S]*?<\/header>/)[0];
    background(header.match(/<svg\b[\s\S]*?<\/svg>/)[0], file + ': header');
    for (const m of html.matchAll(/\.app-header \.brand-mark\s*\{([^}]+)\}/g)) if (/border-radius/.test(m[1])) assert.match(m[1], /border-radius:\s*25%/);
  }
});
