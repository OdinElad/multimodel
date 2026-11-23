// Run: node tests/calc.test.js   (no dependencies)
const assert = require('assert');
const { avg, med, needFor, majority, consensus, dayCounts } = require('../src/calc.js');
let failed = 0;
function test(name, fn) { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); } }

test('needFor: strict majority, at least 2', () => {
  assert.strictEqual(needFor(2), 2); assert.strictEqual(needFor(3), 2); assert.strictEqual(needFor(4), 3);
  assert.strictEqual(needFor(5), 3); assert.strictEqual(needFor(6), 4);
});
test('majority({n:4,k:2}) is false', () => assert.strictEqual(majority({ n: 4, k: 2 }), false));
test('majority({n:4,k:3}) is true', () => assert.strictEqual(majority({ n: 4, k: 3 }), true));
test('majority({n:5,k:3}) is true', () => assert.strictEqual(majority({ n: 5, k: 3 }), true));
test('majority({n:5,k:2}) is false', () => assert.strictEqual(majority({ n: 5, k: 2 }), false));
test('majority({n:2,k:2}) is true', () => assert.strictEqual(majority({ n: 2, k: 2 }), true));
test('majority({n:2,k:1}) is false', () => assert.strictEqual(majority({ n: 2, k: 1 }), false));
test('majority({n:0,k:0}) is false', () => assert.strictEqual(majority({ n: 0, k: 0 }), false));
test('single selected model decides by itself', () => {
  assert.strictEqual(majority({ n: 1, k: 1 }), true); assert.strictEqual(majority({ n: 1, k: 0 }), false);
});

test('dayCounts: a model without rain data is not counted as 0 in the denominator', () => {
  const per = [{ rain: 5 }, { rain: 2 }, { rain: null }, { rain: undefined }, { rain: 0 }];
  const c = dayCounts(per);
  assert.strictEqual(c.nRain, 3); assert.strictEqual(c.rainN, 2); assert.strictEqual(c.heavyN, 0);
  assert.strictEqual(c.rainAvg, 7 / 3); assert.strictEqual(c.rainMax, 5);
});
test('dayCounts: heavy rain, wind and thunder use their own denominators', () => {
  const per = [{ rain: 25, gust: 70, code: 95 }, { rain: 30, gust: null, code: 3 }, { rain: null, gust: 65, code: null, cape: 1500 }, { rain: 1, gust: 10, code: 1 }];
  const c = dayCounts(per);
  assert.strictEqual(c.nRain, 3); assert.strictEqual(c.heavyN, 2);
  assert.strictEqual(c.nWind, 3); assert.strictEqual(c.windN, 2);
  assert.strictEqual(c.nThunder, 4); assert.strictEqual(c.thunderN, 1); // cape alone (no rain value) is not thunder
});
test('dayCounts: empty input is safe', () => {
  const c = dayCounts([]); assert.strictEqual(c.nRain, 0); assert.strictEqual(c.rainMax, 0); assert.strictEqual(c.nThunder, 0);
});
test('avg and med', () => { assert.strictEqual(avg([1, 2, 3]), 2); assert.strictEqual(med([3, 1, 2]), 2); assert.strictEqual(med([1, 2, 3, 4]), 2.5); });

test('consensus [10,10,20,20]: median 15, high disagreement flag, no NaN', () => {
  const c = consensus([10, 10, 20, 20]);
  assert.strictEqual(c.med, 15); assert.strictEqual(c.disagree, true); assert.strictEqual(c.empty, false);
  assert.deepStrictEqual(c.out, [false, false, false, false]); // nothing filtered when fewer than 2 would remain
  assert.ok(Number.isFinite(c.inMin) && Number.isFinite(c.inMax) && Number.isFinite(c.min) && Number.isFinite(c.max));
});
test('consensus []: empty state ("no data")', () => {
  const c = consensus([]); assert.strictEqual(c.empty, true); assert.strictEqual(c.med, null);
});
test('consensus with only null values is empty too', () => assert.strictEqual(consensus([null, undefined]).empty, true));
test('consensus [10,10,10,10,30]: 30 is an outlier, median 10', () => {
  const c = consensus([10, 10, 10, 10, 30]);
  assert.deepStrictEqual(c.out, [false, false, false, false, true]); assert.strictEqual(c.med, 10);
  assert.strictEqual(c.disagree, false); assert.strictEqual(c.max, 30); assert.strictEqual(c.inMax, 10);
});
test('consensus keeps a normal spread untouched', () => {
  const c = consensus([14, 15, 16, 15.5]); assert.strictEqual(c.disagree, false); assert.ok(c.out.every(x => !x)); assert.strictEqual(c.med, 15.25);
});
test('consensus with one or two models never filters', () => {
  assert.strictEqual(consensus([12]).med, 12); assert.strictEqual(consensus([12]).disagree, false);
  const c = consensus([10, 30]); assert.strictEqual(c.med, 20); assert.deepStrictEqual(c.out, [false, false]);
});
test('consensus ignores missing values in the middle', () => {
  const c = consensus([10, null, 10, 10, 10, 30]); assert.deepStrictEqual(c.out, [false, false, false, false, false, true]); assert.strictEqual(c.med, 10);
});

if (failed) { console.log(failed + ' test(s) failed'); process.exit(1); } else console.log('all calc tests passed');
