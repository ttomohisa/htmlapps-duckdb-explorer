const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const sourcePath = process.env.APP_HTML || path.resolve(__dirname, '../src/index.template.html');
const html = fs.readFileSync(sourcePath, 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
const source = payload ? require('node:zlib').gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8') : html;
function actual(name) {
  const start = source.search(new RegExp('^  (?:async )?function ' + name + '\\(', 'm'));
  assert.ok(start >= 0, `Production function ${name} exists`);
  const next = source.slice(start + 1).search(/^  (?:async )?function /m);
  return source.slice(start, next < 0 ? source.length : start + 1 + next).trim();
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function load(ctx, ...names) { vm.runInContext(names.map(actual).join('\n'), ctx); }

test('schema metadata remains bound to the initial database during a source replacement', async () => {
  const waiting = deferred(), readsA = [], readsB = [];
  const fileA = {name:'first.duckdb',size:32},fileB={name:'second.duckdb',size:64};
  const connectionA = { async query(sql) {
    readsA.push(sql);
    if(readsA.length===1) await waiting.promise;
    if(sql.includes('information_schema.schemata')) return [{schema_name:'main'}];
    if(sql.includes('information_schema.columns')) return [{table_schema:'main',table_name:'first',column_name:'a',ordinal_position:1,is_nullable:'YES',data_type:'INTEGER',column_default:null}];
    return [];
  } };
  const connectionB = { async query(sql) { readsB.push(sql); throw Error('Report unexpectedly queried second database'); } };
  const state = {conn:connectionA,file:fileA,objects:[{schema:'main',name:'first',type:'table',estimated:3n}],overview:{duckdbVersion:'A',schemaCount:1n,tableCount:1n,viewCount:0n,columnCount:1n}};
  const ctx = vm.createContext({state, Date,Map,arrowRows:items=>items,reportProfileSnapshot:()=>[{source:state.file.name}]});
  load(ctx,'loadSchemaReportData');
  const pending = ctx.loadSchemaReportData();
  state.conn=connectionB;state.file=fileB;state.objects=[{schema:'main',name:'second',type:'table',estimated:50n}];state.overview={duckdbVersion:'B'};
  waiting.resolve();
  const report = await pending;
  assert.equal(readsA.length,3,'All three metadata queries remain on first connection');
  assert.equal(readsB.length,0);
  assert.equal(report.source.name,'first.duckdb');
  assert.equal(report.source.duckdbVersion,'A');
  assert.equal(report.objects[0].name,'first');
  assert.equal(report.profiles[0].source,'first.duckdb');
});

test('a stale data-dictionary export cannot download, toast or unlock the next file report', async () => {
  const waiting=deferred(), downloads=[], messages=[];
  const fileA={name:'first.duckdb'},fileB={name:'second.duckdb'};
  const connectionA={}, connectionB={};
  const state={conn:connectionA,file:fileA,reportSaving:false,reportToken:0};
  const button={disabled:false};
  let built=0;
  const ctx=vm.createContext({state, $:()=>button, t:key=>key, toast:message=>messages.push(message),
    loadSchemaReportData:()=>waiting.promise, buildSchemaReportHtml:()=>{built++;return '<html></html>'},
    safeFilenamePart:s=>s, URL:{createObjectURL:()=> 'blob:report',revokeObjectURL(){}},
    Blob, setTimeout(){}, console:{error(){}},
    document:{body:{append(){}},createElement(){return {click(){downloads.push(this.download)},remove(){}}}}
  });
  load(ctx,'saveSchemaReport');
  const pending=ctx.saveSchemaReport();
  assert.equal(state.reportSaving,true);
  assert.equal(button.disabled,true);
  state.reportToken++;state.conn=connectionB;state.file=fileB;state.reportSaving=true;button.disabled=true;
  waiting.resolve({source:{name:'first.duckdb'}});
  await pending;
  assert.equal(built,0);assert.deepEqual(downloads,[]);
  assert.equal(messages.includes('reportSaved'),false);
  assert.equal(state.reportSaving,true,'Old finally may not unlock the next export');
  assert.equal(button.disabled,true);
});

test('column analysis issues its follow-up query against the original connection and relation', async () => {
  const waiting=deferred(), readsA=[],readsB=[];
  const relationA={schema:'main',name:'first'}, relationB={schema:'main',name:'second'};
  const connectionA={async query(sql){readsA.push(sql);if(readsA.length===1){await waiting.promise;return [{total_rows:2n,non_null_rows:2n,null_rows:0n,distinct_estimate:2n,min_length:1n,max_length:3n,avg_length:2}]}return [{value:'x',frequency:2n}]} };
  const connectionB={async query(sql){readsB.push(sql);throw Error('Analysis queried the replacement DB')} };
  const state={conn:connectionA,selected:relationA};
  const ctx=vm.createContext({state,arrowRows:r=>r});
  load(ctx,'sqlIdent','profileKind','loadColumnProfile');
  const col={column_name:'label',data_type:'VARCHAR'};
  const pending=ctx.loadColumnProfile(col,connectionA,relationA);
  state.conn=connectionB;state.selected=relationB;waiting.resolve();
  const profile=await pending;
  assert.equal(readsA.length,2);assert.equal(readsB.length,0);
  assert.ok(readsA.every(sql=>sql.includes('"main"."first"')));
  assert.equal(profile.topValues[0].value,'x');
});

test('new file selection invalidates any in-flight schema-report generation', () => {
  assert.match(actual('openFile'),/state\.reportToken\+\+/);
  assert.match(actual('disposeDatabase'),/reportToken:state\.reportToken\+1/);
});
