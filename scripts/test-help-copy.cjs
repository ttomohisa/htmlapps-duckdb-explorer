'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const argument = process.argv.indexOf('--html');
const file = argument >= 0 ? process.argv[argument + 1] : path.join(__dirname, '../src/index.template.html');
let html = fs.readFileSync(file, 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/);
if (payload) html = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
const excluded = [
  "言語を切り替えても読み込み状態やエラーは保持されます。検索・保存・ページ移動の操作欄は、画面幅に応じて折り返します。ダイアログ内をスクロールしても背景のページは動きません。長い列名は見出し内で折り返し、必要に応じて見出しをスクロールできます。",
  " Switching language keeps the loading or error state. Search, export, and paging controls wrap to fit the available width. Dialogs scroll without moving the background page; long column titles wrap and can be scrolled within their heading.",
  "DB比較では比較先のDuckDBを別のブラウザー内ランタイムで一時的に開きます。",
  " Database comparison temporarily opens the second DuckDB file in another in-browser runtime."
];
for (const text of excluded) {
  assert.equal(html.includes(text), false, `User-facing help must exclude obsolete audit/implementation copy: ${text}`);
}
console.log('User-facing help copy regression passed.');
