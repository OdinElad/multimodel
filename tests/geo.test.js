// Run: node tests/geo.test.js   (no dependencies). Tests the on-device place naming (src/geo.js + geo/cities15000.json).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolveName, nearestIn } = require('../src/geo.js');
const geo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'geo', 'cities15000.json'), 'utf8'));

// CITIES (Hebrew list) and the translations, loaded the same way the browser sees them
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(['i18n.js', 'i18n_v2.js', 'cities.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n') + ';this.S=S;this.L=L;this.CITIES=CITIES;', ctx);
const mkT = lang => (k, p) => { const a = ctx.S[k]; let s = a ? a[ctx.L.indexOf(lang)] : k; if (p) for (const x in p) s = s.split('{' + x + '}').join(p[x]); return s; };
const name = (lang, lat, lon) => resolveName({ lang, cities: ctx.CITIES, geo, lat, lon, t: mkT(lang) });

let failed = 0;
function test(n, fn) { try { fn(); console.log('ok   ' + n); } catch (e) { failed++; console.log('FAIL ' + n + '\n     ' + e.message); } }

test('data file looks right', () => {
  assert.ok(geo.length > 20000 && geo.length < 30000);
  assert.ok(geo.every(r => r.length === 4 && typeof r[0] === 'string' && Math.abs(r[1]) <= 90 && Math.abs(r[2]) <= 180 && /^[A-Z]{2}$/.test(r[3])));
});
test('Paris (en)', () => assert.strictEqual(name('en', 48.8566, 2.3522), 'Paris'));
test('New York (en)', () => assert.strictEqual(name('en', 40.7128, -74.006), 'New York City'));
test('Tokyo (en)', () => assert.strictEqual(name('en', 35.6762, 139.6503), 'Tokyo'));
test('Hadera (en, from the GeoNames list)', () => assert.strictEqual(name('en', 32.434, 34.9197), 'Hadera'));
test('Hadera (he, from the Hebrew list)', () => assert.strictEqual(name('he', 32.434, 34.9197), 'חדרה'));
test('Paris (he) falls back to the list name', () => assert.strictEqual(name('he', 48.8566, 2.3522), 'Paris'));
test('mid-ocean point gives "My location" (en)', () => assert.strictEqual(name('en', 0, -30), 'My location'));
test('mid-ocean point gives "המיקום שלי" (he)', () => assert.strictEqual(name('he', 0, -30), 'המיקום שלי'));
test('15 to 40 km from any place gives "Near X"', () => {
  // about 28 km west of Tel Aviv, in the sea
  const n = nearestIn(geo, 32.08, 34.5); assert.ok(n.d > 15 && n.d <= 40, 'distance ' + n.d);
  assert.strictEqual(name('en', 32.08, 34.5), 'Near ' + n.c[0]);
});
test('Hebrew: an Israeli place 4 to 15 km away is preferred over a Latin name', () => {
  const n = nearestIn(ctx.CITIES, 32.43, 35.12); // east of Hadera, near Harish
  assert.ok(n.d > 4 && n.d <= 15, 'distance ' + n.d);
  assert.strictEqual(name('he', 32.43, 35.12), 'ליד ' + n.c[0]);
});
test('offline (no geo list): Hebrew list still works, otherwise "My location"', () => {
  const t = mkT('en');
  assert.strictEqual(resolveName({ lang: 'he', cities: ctx.CITIES, geo: null, lat: 32.434, lon: 34.9197, t: mkT('he') }), 'חדרה');
  assert.strictEqual(resolveName({ lang: 'en', cities: ctx.CITIES, geo: null, lat: 48.8566, lon: 2.3522, t }), 'My location');
});
test('every language has the "near" and "myLoc" texts', () => {
  for (const l of ctx.L) { assert.ok(mkT(l)('near', { p: 'X' }).includes('X'), l); assert.ok(mkT(l)('myLoc').length > 0, l); }
});
test('no request to a naming service in the app code', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(!/bigdatacloud/i.test(src)); assert.ok(!/reverse-geocode/i.test(src));
});

if (failed) { console.log(failed + ' test(s) failed'); process.exit(1); } else console.log('all geo tests passed');
