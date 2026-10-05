const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

function normalizeBuildConstants(html) {
  return html.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/^  const (APP_CONFIG|BUILD_MANIFEST|assetBundle) = .*;$/gm, '  const $1 = <embedded>;');
}
test('tracked root release alias contains the current source', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.template.html'), 'utf8');
  const alias = fs.readFileSync(path.join(__dirname, '../duckdb-explorer.html'), 'utf8');
  assert.equal(normalizeBuildConstants(alias), normalizeBuildConstants(source), 'Rebuild and synchronize duckdb-explorer.html from the verified readable release artifact');
});

test('validation CI checks the committed root alias before regenerating it', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/build-standalone.yml'), 'utf8');
  const verifyCommitted = workflow.indexOf('run: ./scripts/check-repository.ps1');
  const rebuild = workflow.indexOf('run: ./scripts/prepare-release.ps1');
  assert.ok(verifyCommitted >= 0 && verifyCommitted < rebuild, 'Validate the committed source/root pair before the release flow updates the checkout alias');
});
