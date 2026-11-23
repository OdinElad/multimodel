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

if (failed) { console.log(failed + ' test(s) failed'); process.exit(1); } else console.log('all calc tests passed');
