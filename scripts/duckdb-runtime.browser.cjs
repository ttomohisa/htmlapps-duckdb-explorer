'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'test-results/duckdb-runtime');
const appUrl = pathToFileURL(path.join(root, 'dist/index.html')).href;
const baseFile = path.join(root, 'test-data/browser-kitty-sample.duckdb');
const compareFile = path.join(root, 'test-data/browser-kitty-sample-after.duckdb');
const timeout = 90000;

async function checkSession(browser, mobile) {
  const label = mobile ? 'mobile' : 'desktop';
  const ctx = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1360,height:900},acceptDownloads:true,reducedMotion:'reduce'});
  const page = await ctx.newPage();
  page.setDefaultTimeout(timeout);
  const errors=[],requests=[];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => {if(/^https?:/.test(req.url()))requests.push(req.url());});
  try {
    await page.goto(appUrl);
    await page.locator('#fileInput').setInputFiles(baseFile);
    if (mobile) await page.locator('#tree button[data-schema="main"][data-name="orders"]').waitFor({state:'visible'});
    else await page.locator('#overviewView .overview-stat').first().waitFor({state:'visible'});
    assert.equal(await page.locator('#fileName').textContent(),path.basename(baseFile));
    await page.locator('#tree button[data-schema="main"][data-name="orders"]').click();
    if (mobile) await page.locator('#dataPanel .record-card').first().waitFor({state:'visible'});
    else await page.locator('#dataPanel .data-table tbody tr').first().waitFor({state:'visible'});
    const sqlNav = mobile ? page.locator('#mobileNav [data-mobile="sql"]') : page.locator('#sqlTreeButton');
    await sqlNav.click();
    await page.locator('#sqlEditor').fill('SELECT count(*) AS order_count FROM main.orders;');
    await page.locator('#runSqlBtn').click();
    await page.locator('#sqlResult .sql-result-status').waitFor({state:'visible'});
    assert.match(await page.locator('#sqlResult').innerText(),/order_count/i);
    await page.locator('#sqlEditor').fill('DROP TABLE main.orders;');
    await page.locator('#runSqlBtn').click();
    await page.locator('#sqlResult .sql-error').waitFor({state:'visible'});
    await page.locator('#langBtn').click();
    assert.ok(['ja','en'].includes(await page.locator('html').getAttribute('lang')));
    const overviewNav = mobile ? page.locator('#mobileNav [data-mobile="overview"]') : page.locator('#overviewTreeButton');
    await overviewNav.click();
    await page.locator('#overviewView .overview-stat').first().waitFor({state:'visible'});
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#saveSchemaReportBtn').click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(),/-data-dictionary\.html$/);
    const downloadPath = await download.path();
    const report = fs.readFileSync(downloadPath,'utf8');
    assert.match(report,/reportData/);
    assert.match(report,/browser-kitty-sample/);
    await page.locator('#compareFileInput').setInputFiles(compareFile);
    await page.locator('#comparisonView .diff-stat-value').first().waitFor({state:'visible'});
    const diffCounts = await page.locator('#comparisonView .diff-stat-value').allTextContents();
    assert.ok(diffCounts.some(value=>Number(value.replace(/[^0-9]/g,''))>0),'Fixture comparison reports at least one difference');
    await page.locator('#fileInput').setInputFiles(compareFile);
    if (mobile) await page.locator('#tree button[data-schema="main"][data-name="products"]').waitFor({state:'visible'});
    else await page.locator('#overviewView .overview-stat').first().waitFor({state:'visible'});
    assert.equal(await page.locator('#fileName').textContent(),path.basename(compareFile));
    assert.equal(await page.locator('#comparisonView').isVisible(),false,'Source switch clears comparison view');
    assert.deepEqual(errors,[],`${label} JavaScript exceptions`);
    assert.deepEqual(requests,[],`${label} external runtime requests`);
    console.log('PASS '+label+': DuckDB file, rows, SQL, denied writes, report, diff, replacement');
  } catch (error) {
    await page.screenshot({path:path.join(evidence,'failure-'+label+'.png'),fullPage:true}).catch(()=>{});
    throw error;
  } finally { await ctx.close(); }
}
async function main() {
  if(!fs.existsSync(baseFile)||!fs.existsSync(compareFile))throw Error('Generated DuckDB fixtures are required; run scripts/prepare-release.ps1 first');
  fs.mkdirSync(evidence,{recursive:true});
  const browser=await chromium.launch();
  try {await checkSession(browser,false);await checkSession(browser,true);}finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
