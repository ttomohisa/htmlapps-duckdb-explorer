'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, process.env.GITHUB_ACTIONS ? 'test-results/duckdb-runtime' : '.cache/duckdb-runtime');
const baseFile = path.join(root, 'test-data/browser-kitty-sample.duckdb');
const compareFile = path.join(root, 'test-data/browser-kitty-sample-after.duckdb');
const timeout = 90000;

async function downloadText(page, selector, expectedName) {
  if (selector === '#exportCsv' || selector === '#exportJson') {
    await page.locator('#exportMenuButton').click();
  }
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  assert.match(download.suggestedFilename(), expectedName);
  return fs.readFileSync(await download.path(), 'utf8');
}

async function filterRange(page, column, operator, start, end) {
  await page.locator('#addFilter').click();
  await page.locator('#filterColumn').selectOption(column);
  await page.locator('#filterOperator').selectOption(operator);
  await page.locator('#filterValue').fill(start);
  await page.locator('#filterEndValue').fill(end);
  await page.locator('#applyFilterBtn').click();
  await page.locator('#filterDialog').waitFor({state:'hidden'});
}

async function checkCatalog(page) {
  const search = page.locator('#objectSearch');
  const matches = page.locator('#tree button[data-name]');
  await page.keyboard.press('/');
  await page.waitForFunction(() => document.activeElement.id === 'objectSearch');
  await search.fill('no-matching-object');
  assert.equal(await matches.count(), 0);
  assert.equal(await page.locator('#tree .tree-empty').isVisible(), true);
  await search.press('Escape');
  assert.ok(await matches.count() > 1);

  const schema = page.locator('#tree details').filter({has:page.locator('summary[data-schema="main"]')});
  await schema.locator('summary').click();
  assert.equal(await schema.getAttribute('open'), null);
  await search.fill('MAIN.ORDERS');
  assert.equal(await matches.count(), 1);
  await search.press('ArrowDown');
  assert.equal(await matches.first().evaluate(button => button === document.activeElement), true);
  await search.press('Escape');
  assert.equal(await schema.getAttribute('open'), null, 'Clearing search restores the collapsed schema');
  await search.fill('main.orders');
  await search.press('Enter');
  await page.waitForFunction(() => document.activeElement.id === 'rowSearch');
}

async function checkExploration(page, mobile) {
  const rows = page.locator(mobile ? '#relationRows .record-card' : '#relationRows .data-table tbody tr');
  const status = page.locator('#relationPager .panel-status');
  await rows.first().waitFor({state:'visible'});
  assert.equal(await page.locator('#relationName').getAttribute('title'), 'main.orders');
  assert.equal(await page.locator('#fileName').textContent(), path.basename(baseFile));
  assert.equal(await page.locator('#countRows').isVisible(), true, 'The first page loads before an exact count');
  const firstPage = JSON.parse(await downloadText(page, '#exportJson', /-orders-page-1\.json$/));
  assert.equal(firstPage.length, 100, 'The extra row fetched for paging is excluded from exports');
  assert.equal(await rows.count(), 100);
  if (!mobile) {
    await page.locator('#countRows').click();
    await page.locator('#rowCount').filter({hasText:'250'}).waitFor({state:'visible'});
  }
  await page.locator('#lastPage').click();
  await status.filter({hasText:'201–250'}).waitFor({state:'visible'});
  assert.equal(await rows.count(), 50);
  assert.equal(await page.locator('#lastPage').isDisabled(), true);
  await page.locator('#firstPage').click();
  await status.filter({hasText:'1–100'}).waitFor({state:'visible'});

  if (mobile) {
    await page.locator('#mobileSort').selectOption('desc:0');
  } else {
    const header = page.locator('th[data-sort="order_id"]');
    await header.click();
    await page.locator('th[data-sort="order_id"][aria-sort="ascending"]').click();
  }
  const topId = mobile ? '.record-field-value' : '[data-column="order_id"]';
  await rows.first().locator(topId).first().filter({hasText:/^250$/}).waitFor({state:'visible'});

  const search = page.locator('#rowSearch');
  const original = await search.elementHandle();
  await search.fill('paid');
  await search.evaluate(input => input.setSelectionRange(1, 3));
  await page.locator('#relationChips .filter-chip').filter({hasText:'paid'}).waitFor({state:'visible'});
  assert.deepEqual(await original.evaluate(input => [
    input === document.getElementById('rowSearch'), input === document.activeElement,
    input.selectionStart, input.selectionEnd
  ]), [true, true, 1, 3], 'Refreshing search results retains the field, focus and selection');
  await original.dispose();
  assert.equal(await rows.count(), 50);
  const matches = rows.locator('mark');
  assert.equal(await matches.first().textContent(), 'paid');
  if (mobile) {
    await search.fill('Manual review');
    await rows.first().locator('mark').filter({hasText:'Manual review'}).waitFor({state:'visible'});
    assert.equal(await rows.first().locator('.record-head .record-field-name').textContent(), 'order_id');
  }
  await page.locator('#clearSearch').click();
  await status.filter({hasText:'1–100'}).waitFor({state:'visible'});

  await filterRange(page, 'order_id', 'numberBetween', '3', '10');
  await status.filter({hasText:/\b1–8\b/}).waitFor({state:'visible'});
  await filterRange(page, 'ordered_at', 'dateBetween', '2025-01-01', '2025-01-01');
  await status.filter({hasText:/\b1–3\b/}).waitFor({state:'visible'});
  const filtered = JSON.parse(await downloadText(page, '#exportJson', /-orders-page-1\.json$/));
  assert.deepEqual(filtered.map(row => [row.order_id, row.ordered_at]), [
    ['5', '2025-01-01T23:00:00'], ['4', '2025-01-01T20:00:00'], ['3', '2025-01-01T17:00:00']
  ], 'The ranges include both numeric endpoints and the full ending calendar day');
}

async function checkSqlDates(page, mobile) {
  const query = "SELECT DATE '2024-02-29' AS day, TIMESTAMP '1969-12-31 23:59:59.123456' AS stamp, ordered_at FROM main.orders WHERE order_id = 1";
  const expected = ['2024-02-29', '1969-12-31T23:59:59.123456', '2025-01-01T11:00:00'];
  await page.locator('#sqlEditor').fill(query);
  await page.locator('#runSqlBtn').click();
  const values = page.locator(mobile ? '#sqlResult .record-card .record-field-value' : '#sqlResult tbody tr td .cell-btn');
  await values.filter({hasText:expected[1]}).waitFor({state:'visible'});
  assert.deepEqual(await values.allTextContents(), expected);
  const csv = await downloadText(page, '#sqlExportCsv', /-sql-result\.csv$/);
  assert.equal(csv.replace(/^\uFEFF/,'').trimEnd(), 'day,stamp,ordered_at\r\n' + expected.join(','));
}

async function checkSession(browser, variant, mobile) {
  const label = variant.replace(/\.html$/, '') + (mobile ? '-mobile' : '-desktop');
  const ctx = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1360,height:900},locale:mobile?'ja-JP':'en-US',acceptDownloads:true,reducedMotion:'reduce'});
  const page = await ctx.newPage();
  page.setDefaultTimeout(timeout);
  const errors=[],requests=[];
  const consoleErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') consoleErrors.push(message.text());});
  page.on('request', req => {if(/^https?:/.test(req.url()))requests.push(req.url());});
  page.on('websocket', socket => requests.push(socket.url()));
  try {
    await page.goto(pathToFileURL(path.join(root, 'dist', variant)).href);
    await page.locator('#openDemoBtn').click();
    await checkExploration(page, mobile);
    await page.locator('#fileInput').setInputFiles(baseFile);
    await page.locator('#overviewView .overview-stat').first().waitFor({state:'visible'});
    if (mobile) await page.locator('#mobileNav [data-mobile="objects"]').click();
    assert.equal(await page.locator('#fileName').textContent(),path.basename(baseFile));
    await checkCatalog(page);
    if (mobile) await page.locator('#dataPanel .record-card').first().waitFor({state:'visible'});
    else await page.locator('#dataPanel .data-table tbody tr').first().waitFor({state:'visible'});
    const sqlNav = mobile ? page.locator('#mobileNav [data-mobile="sql"]') : page.locator('#sqlTreeButton');
    await sqlNav.click();
    await page.locator('#sqlEditor').fill('SELECT count(*) AS order_count FROM main.orders;');
    await page.locator('#runSqlBtn').click();
    await page.locator('#sqlResult .sql-result-status').waitFor({state:'visible'});
    assert.match(await page.locator('#sqlResult').innerText(),/order_count/i);
    await checkSqlDates(page, mobile);
    await page.locator('#sqlEditor').fill('DROP TABLE main.orders;');
    await page.locator('#runSqlBtn').click();
    await page.locator('#sqlResult .sql-error').waitFor({state:'visible'});
    await page.locator('#langBtn').click();
    assert.ok(['ja','en'].includes(await page.locator('html').getAttribute('lang')));
    const overviewNav = mobile ? page.locator('#mobileNav [data-mobile="overview"]') : page.locator('#overviewTreeButton');
    await overviewNav.click();
    await page.locator('#overviewView .overview-stat').first().waitFor({state:'visible'});
    const report = await downloadText(page, '#saveSchemaReportBtn', /-data-dictionary\.html$/);
    assert.match(report,/reportData/);
    assert.match(report,/browser-kitty-sample/);
    await page.locator('#compareFileInput').setInputFiles(compareFile);
    await page.locator('#comparisonView .diff-stat-value').first().waitFor({state:'visible'});
    const diffCounts = await page.locator('#comparisonView .diff-stat-value').allTextContents();
    assert.ok(diffCounts.some(value=>Number(value.replace(/[^0-9]/g,''))>0),'Fixture comparison reports at least one difference');
    await page.locator('#fileInput').setInputFiles(compareFile);
    await page.locator('#overviewView .overview-stat').first().waitFor({state:'visible'});
    if (mobile) {
      await page.locator('#mobileNav [data-mobile="objects"]').click();
      await page.locator('#tree button[data-schema="main"][data-name="products"]').waitFor({state:'visible'});
    }
    assert.equal(await page.locator('#objectSearch').inputValue(), '', 'Replacing the database clears its catalog search');
    assert.equal(await page.locator('#fileName').textContent(),path.basename(compareFile));
    assert.equal(await page.locator('#comparisonView').isVisible(),false,'Source switch clears comparison view');
    assert.deepEqual(errors,[],`${label} JavaScript exceptions`);
    assert.deepEqual(requests,[],`${label} external runtime requests`);
    console.log('PASS '+label+': demo, paging/count, sorting, search focus, typed filters, temporal exports, SQL, report, comparison, replacement, offline');
  } catch (error) {
    await page.screenshot({path:path.join(evidence,'failure-'+label+'.png'),fullPage:true}).catch(()=>{});
    if (consoleErrors.length) console.error(label, consoleErrors.join('\n'));
    throw error;
  } finally { await ctx.close(); }
}
async function main() {
  if(!fs.existsSync(baseFile)||!fs.existsSync(compareFile))throw Error('Generated DuckDB fixtures are required; run scripts/prepare-release.ps1 first');
  fs.mkdirSync(evidence,{recursive:true});
  const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || undefined});
  try {
    for (const variant of ['index.html', 'index.self-extract.html']) {
      await checkSession(browser,variant,false);
      await checkSession(browser,variant,true);
    }
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
