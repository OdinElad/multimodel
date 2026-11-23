#!/usr/bin/env node
// Builds geo/cities15000.json (places with population >= 15000) for on-device place naming.
// Source: GeoNames (CC BY 4.0), through the npm package all-the-cities@3.1.0 (derived from GeoNames cities1000).
// Usage:  npm install --no-save all-the-cities@3.1.0   (in any folder)
//         NODE_PATH=<that folder>/node_modules node tools/make_geo.js
// Output format: [[name, lat, lon, countryCode], ...], coordinates rounded to 2 decimals.
const fs = require('fs');
const path = require('path');
const cities = require('all-the-cities');
const rows = cities
  .filter(c => c.population >= 15000)
  .sort((a, b) => b.population - a.population || a.cityId - b.cityId)
  .map(c => [c.name, +c.loc.coordinates[1].toFixed(2), +c.loc.coordinates[0].toFixed(2), c.country]);
const out = path.join(__dirname, '..', 'geo', 'cities15000.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(rows));
console.log(rows.length + ' places, ' + fs.statSync(out).size + ' bytes');
