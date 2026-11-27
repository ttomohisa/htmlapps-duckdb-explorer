const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');

const html = fs.readFileSync(process.env.APP_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
const source = payload ? gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8') : html;
const functions = source.slice(source.indexOf('  function t('), source.indexOf('  window.AppToast ='));

function setup(type, operator, value = '', endValue = '') {
  const column = 'amount "quoted"';
  const state = { columns: [{column_name: column, data_type: type}], search: '', filters: [] };
  const el = {
    filterColumn: {value: column}, filterOperator: {value: operator},
    filterValue: {value, focus() {}, setAttribute() {}, removeAttribute() {}},
    filterEndValue: {value: endValue, focus() {}, setAttribute() {}, removeAttribute() {}},
    filterError: {textContent: ''}, filterDialog: {close() {}}
  };
  const ctx = vm.createContext({ state, el, $: id => el[id], I18N: {ja:{}, en:{}}, lang:'en' });
  vm.runInContext(functions, ctx);
  ctx.refreshQuery = () => {};
  return ctx;
}

test('integer bounds retain adjacent BIGINT values and use quoted identifiers in the query', () => {
  const ctx = setup('BIGINT', 'numberBetween', '9007199254740992', '9007199254740993');
  ctx.applyFilter();
  const where = ctx.buildWhereClause();
  assert.match(where, /"amount ""quoted""" >= CAST\('9007199254740992' AS BIGINT\)/);
  assert.match(where, /"amount ""quoted""" <= CAST\('9007199254740993' AS BIGINT\)/);
  assert.match(ctx.renderFilterSummary(), /9007199254740992.*9007199254740993/);
});

test('one-sided decimal bounds preserve the input precision and sign', () => {
  for (const [op, symbol] of [['gte','>='], ['lte','<=']]) {
    const ctx = setup('DECIMAL(38,4)', op, '-90071992547409931234.0001');
    ctx.applyFilter();
    assert.equal(ctx.buildWhereClause(), ` WHERE "amount ""quoted""" ${symbol} CAST('-90071992547409931234.0001' AS DECIMAL(38,4))`);
  }
});

test('invalid numeric bounds stay out of the query and show a field error', () => {
  for (const [type, start, end] of [
    ['BIGINT','9007199254740993','9007199254740992'], ['DECIMAL(38,4)','0.0002','0.0001'],
    ['DOUBLE','3',''], ['DOUBLE','garbage','3'], ['INTEGER','1.1','2'],
    ['UTINYINT','-1','5'], ['SMALLINT','1','32768'], ['DECIMAL(4,2)','4.001','5']
  ]) {
    const ctx = setup(type, 'numberBetween', start, end);
    ctx.applyFilter();
    assert.equal(ctx.state.filters.length, 0, `${type} ${start} .. ${end}`);
    assert.ok(ctx.el.filterError.textContent);
  }
});

test('date bounds include an entire ending calendar day', () => {
  for (const type of ['DATE','TIMESTAMP','TIMESTAMP_NS','TIMESTAMP WITH TIME ZONE']) {
    const ctx = setup(type, 'dateBetween', '2024-02-29', '2024-02-29');
    ctx.applyFilter();
    const where = ctx.buildWhereClause();
    assert.match(where, /"amount ""quoted""" >= DATE '2024-02-29'/);
    assert.match(where, /"amount ""quoted""" < \(DATE '2024-02-29' \+ 1\)/);
  }
  for (const [op, pattern] of [['dateFrom', / >= DATE /], ['dateThrough', / < \(DATE /]]) {
    const ctx = setup('DATE', op, '2024-02-29');
    ctx.applyFilter();
    assert.match(ctx.buildWhereClause(), pattern);
  }
});

test('calendar bounds reject nonexistent days, reversed ranges and non-date columns', () => {
  for (const [type, start, end] of [
    ['DATE','2025-02-29','2025-03-01'], ['TIMESTAMP','2025-03-01','2025-02-28'],
    ['TIME','2025-04-01','2025-04-02'], ['DATE[]','2025-04-01','2025-04-02']
  ]) {
    const ctx = setup(type, 'dateBetween', start, end);
    ctx.applyFilter();
    assert.equal(ctx.state.filters.length, 0, `${type} ${start} .. ${end}`);
  }
});

test('text and NULL filters retain their existing semantics on typed columns', () => {
  const text = setup('DECIMAL(10,2)', 'contains', "a'B");
  text.applyFilter();
  assert.match(text.buildWhereClause(), /contains\(lower\(TRY_CAST\("amount ""quoted""" AS VARCHAR\)\), 'a''b'\)/);
  const nil = setup('TIMESTAMP', 'isNull');
  nil.applyFilter();
  assert.equal(nil.buildWhereClause(), ' WHERE "amount ""quoted""" IS NULL');
});
