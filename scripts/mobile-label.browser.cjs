'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const evidence = path.resolve('test-results/mobile-label');
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const language of ['ja', 'en']) for (const [width, height] of [[1360,900],[320,568],[393,252]]) {
      const context = await browser.newContext({ viewport: {width,height}, locale: language, reducedMotion:'reduce' });
      const page = await context.newPage();
      const errors=[], requests=[];
      const label=`${language}-${width}x${height}`;
      page.on('pageerror', e=>errors.push(e.message));
      page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
      page.on('request', r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
      try {
        await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/index.html')).href);
        await page.locator('#langBtn').waitFor();
        if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#langBtn').click();
        const badge=page.locator('[data-i18n="brandMeta"]');
        assert.equal(await badge.innerText(),language==='ja'?'テーブル閲覧 · SQL検索 · 構造比較':'Tables · SQL queries · Schema comparison');
        assert.equal(await badge.isVisible(), width > 760, label+': hide header subtitle on mobile');
        assert.equal(await page.locator('.local-badge').isVisible(), width > 760, label+': hide local badge on mobile');
        if(width > 760) assert.ok(await badge.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1;}), label+': badge not clipped');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': page width');
        const footer=page.locator('footer');
        assert.equal(await footer.count(),1,label+': shared informational footer is present');
        assert.equal(await footer.isVisible(),width>760,label+': footer hidden on phone widths');
        if(width>760) assert.equal((await footer.innerText()).trim(),language==='ja'?'DuckDB Explorer · MIT License · データの閲覧はブラウザー内で完結':'DuckDB Explorer · MIT License · Data viewing stays in the browser',label+': footer text');
        if(width!==393) await page.screenshot({path:path.join(evidence,label+'.png')});
        await page.locator('#helpBtn').click();
        const body=page.locator('#helpDialog .dialog-body');
        assert.equal(await page.locator('#helpDialog .dialog-body > h3:first-child').evaluate(el=>getComputedStyle(el).marginTop),'0px',label+': no excessive space above the first help heading');
        await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
        const helpEnd = await page.locator('[data-i18n="helpNote3"]').evaluate(el=>{const r=el.getBoundingClientRect(),body=el.closest(".dialog-body").getBoundingClientRect(),dialog=el.closest('dialog').getBoundingClientRect();return {top:r.top,bottom:r.bottom,clipTop:Math.max(0,body.top,dialog.top),clipBottom:Math.min(innerHeight,body.bottom,dialog.bottom)};});
        assert.ok(helpEnd.top>=helpEnd.clipTop-1&&helpEnd.bottom<=helpEnd.clipBottom+1,label+': final Help guidance reachable '+JSON.stringify(helpEnd));
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#helpDialog').isVisible(),false);
        assert.deepEqual(errors,[],label+': runtime errors');
        assert.deepEqual(requests,[],label+': external requests');
        console.log('PASS '+label);
      } catch(error) {
        await page.screenshot({path:path.join(evidence,'failure-'+label+'.png')}).catch(()=>{});
        throw error;
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
