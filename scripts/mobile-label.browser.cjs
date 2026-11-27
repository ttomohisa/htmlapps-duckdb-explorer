'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const evidence = path.resolve(process.env.GITHUB_ACTIONS ? 'test-results/mobile-label' : '.cache/mobile-label');
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || undefined});
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
        const source=page.locator('#sampleSource');
        await page.locator('#relationRows :is(th,.record-card):visible').first().waitFor();
        assert.equal(await source.innerText(),language==='ja'?'サンプルDB':'Sample database');
        assert.ok(await source.isVisible(),label+': bundled data is identified at all widths');
        const open=page.locator('#changeFileBtn');
        assert.ok(await open.isVisible(),label+': file picker remains available');
        assert.ok(await open.locator('span').evaluate(el=>el.getBoundingClientRect().width>24),label+': file action has a visible label');
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
