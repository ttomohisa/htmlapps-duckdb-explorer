const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');
const { test } = require('node:test');

// Run the real conversion on the same Arrow build the app embeds.
const html = fs.readFileSync(process.env.APP_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
const source = payload ? gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString() : html;
const built = source.includes('__EMBEDDED_ASSET_BUNDLE_JSON__') ? fs.readFileSync(path.join(__dirname, '../duckdb-explorer.html'), 'utf8') : source;
const asset = JSON.parse(built.match(/^  const assetBundle = (.*);$/m)[1]).dependencies['apache-arrow'].assets.umd;
const bytes = Buffer.from(asset.base64, 'base64');
const arrowModule = {exports:{}};
new Function('module', 'exports', (asset.compression === 'gzip' ? gunzipSync(bytes) : bytes).toString())(arrowModule, arrowModule.exports);
const A = arrowModule.exports;
const ctx = vm.createContext({window:{Arrow:A}, Date});
vm.runInContext(source.slice(source.indexOf('  function isArrowRecord('), source.indexOf('  function safeValue(')), ctx);
vm.runInContext(source.slice(source.indexOf('  function profileKind('), source.indexOf('  function profileKey(')), ctx);

function vector(type, data) {
  return A.makeVector(A.makeData({type, length:data.length, data}));
}
function rows(columns) {
  return structuredClone(ctx.arrowRows(new A.Table(columns)));
}
const field = (name, type) => new A.Field(name, type, true);

test('dates, naive timestamps, UTC instants and clock times retain their SQL meaning and exact fractions', () => {
  const columns = {
    day: vector(new A.DateDay(), Int32Array.of(19782)),
    date64: vector(new A.DateMillisecond(), BigInt64Array.of(-86400000n)),
    sec: vector(new A.TimestampSecond(), BigInt64Array.of(0n)),
    ms: vector(new A.TimestampMillisecond(), BigInt64Array.of(-10n)),
    us: vector(new A.TimestampMicrosecond(), BigInt64Array.of(-1n)),
    ns: vector(new A.TimestampNanosecond(), BigInt64Array.of(1735729200123456789n)),
    zoned: vector(new A.TimestampMicrosecond('Asia/Tokyo'), BigInt64Array.of(1735689600000001n)),
    clock: vector(new A.TimeMicrosecond(), BigInt64Array.of(45296123456n)),
    numeric: vector(new A.Int32(), Int32Array.of(19782))
  };
  assert.deepEqual(rows(columns), [{
    day:'2024-02-29', date64:'1969-12-31', sec:'1970-01-01T00:00:00', ms:'1969-12-31T23:59:59.99',
    us:'1969-12-31T23:59:59.999999', ns:'2025-01-01T11:00:00.123456789',
    zoned:'2025-01-01T00:00:00.000001Z', clock:'12:34:56.123456', numeric:19782
  }]);
});

test('sliced batches use the corresponding raw timestamps and validity bits for each row', () => {
  const type = new A.TimestampNanosecond('UTC');
  const input = A.makeVector(A.makeData({type, length:4, nullCount:1, nullBitmap:Uint8Array.of(11),
    data:BigInt64Array.of(0n, 1n, 2n, -1n)}));
  const first = new A.Table({t:input.slice(1, 3)});
  const second = new A.Table({t:input.slice(3)});
  assert.deepEqual(Array.from(ctx.arrowRows(first.concat(second)), row => row.t),
    ['1970-01-01T00:00:00.000000001Z', null, '1969-12-31T23:59:59.999999999Z']);
});

test('nested dates and timestamps stay exact in arrays, struct fields, map keys and values, and unions', () => {
  const ns = vector(new A.TimestampNanosecond(), BigInt64Array.of(-1n, 1735729200123456789n));
  const item = field('item', ns.type);
  const list = A.makeData({type:new A.List(item), length:1, valueOffsets:Int32Array.of(0,2), child:ns.data[0]});
  const fixed = A.makeData({type:new A.FixedSizeList(2, item), length:1, child:ns.data[0]});
  const days = vector(new A.DateDay(), Int32Array.of(0, -1));
  const entries = A.makeData({type:new A.Struct([field('key', days.type), field('value', ns.type)]), length:2, children:[days.data[0], ns.data[0]]});
  const map = A.makeData({type:new A.Map_(field('entries', entries.type)), length:1, valueOffsets:Int32Array.of(0,2), child:entries});
  const struct = A.makeData({type:new A.Struct([field('__proto__', list.type), field('fixed', fixed.type), field('map', map.type)]), length:1, children:[list,fixed,map]});
  const union = A.makeData({type:new A.DenseUnion([7],[field('ns', ns.type)]), length:1, typeIds:Int8Array.of(7), valueOffsets:Int32Array.of(1), children:[ns.data[0]]});
  const preEpoch = '1969-12-31T23:59:59.999999999', modern = '2025-01-01T11:00:00.123456789';
  assert.deepEqual(rows({nested:A.makeVector(struct), choice:A.makeVector(union)}), [{
    nested:{['__proto__']:[preEpoch, modern], fixed:[preEpoch, modern], map:{'1970-01-01':preEpoch,'1969-12-31':modern}}, choice:modern
  }]);
});

test('DuckDB infinite and extended calendar values are readable alongside finite values', () => {
  const dates = vector(new A.DateDay(), Int32Array.of(2147483647, -2147483647, 146097 * 1000));
  const stamps = vector(new A.TimestampMicrosecond(), BigInt64Array.of(9223372036854775807n, -9223372036854775807n, 0n));
  assert.deepEqual(rows({date:dates, stamp:stamps}), [
    {date:'infinity', stamp:'infinity'}, {date:'-infinity', stamp:'-infinity'}, {date:'+401970-01-01', stamp:'1970-01-01T00:00:00'}
  ]);
});

test('structured map keys containing timestamps expose distinct nanoseconds in JSON', () => {
  const ticks = vector(new A.TimestampNanosecond(), BigInt64Array.of(1735729200123456788n, 1735729200123456789n));
  const keys = A.makeData({type:new A.Struct([field('when', ticks.type)]), length:2, children:[ticks.data[0]]});
  const values = A.vectorFromArray(['first', 'next'], new A.Utf8());
  const entries = A.makeData({type:new A.Struct([field('key', keys.type), field('value', values.type)]), length:2, children:[keys,values.data[0]]});
  const map = A.makeData({type:new A.Map_(field('entries', entries.type)), length:1, valueOffsets:Int32Array.of(0,2), child:entries});
  assert.deepEqual(rows({map:A.makeVector(map)}), [{map:{
    '{"when":"2025-01-01T11:00:00.123456788"}':'first', '{"when":"2025-01-01T11:00:00.123456789"}':'next'
  }}]);
});

test('timestamp precision variants and timezone aliases receive temporal min/max profiles', () => {
  for(const type of ['DATE','TIME','TIME WITH TIME ZONE','TIMETZ','TIMESTAMP','TIMESTAMP_S','TIMESTAMP_MS','TIMESTAMP_NS','TIMESTAMPTZ','TIMESTAMP WITH TIME ZONE']){
    assert.equal(ctx.profileKind(type),'temporal',type);
  }
});
