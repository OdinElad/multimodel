// ===== On-device place naming (no network lookups of the user's position) =====
// geo/cities15000.json: [[name, lat, lon, countryCode], ...], GeoNames (CC BY 4.0), built by tools/make_geo.js.
function geoKm(a,b,c,d){const R=6371,r=x=>x*Math.PI/180;const h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function nearestIn(list,lat,lon){
  let best=null,bd=Infinity;
  if(!Array.isArray(list))return {c:null,d:bd};
  for(const c of list){
    if(Math.abs(c[1]-lat)>1)continue; // cheap prefilter, 1 degree is about 111 km
    const d=geoKm(lat,lon,c[1],c[2]);if(d<bd){bd=d;best=c}
  }
  return {c:best,d:bd};
}
// Returns the place name to show. o: {lang, cities (Hebrew list), geo (list or null), lat, lon, t (translate fn)}
function resolveName(o){
  const he=o.lang==='he';
  const hc=he?nearestIn(o.cities,o.lat,o.lon):{c:null,d:Infinity};
  if(he&&hc.d<=4)return hc.c[0];
  if(he&&hc.d<=15)return o.t('near',{p:hc.c[0]});
  const g=nearestIn(o.geo,o.lat,o.lon);
  if(g.c&&g.d<=15)return g.c[0];
  if(g.c&&g.d<=40)return o.t('near',{p:g.c[0]});
  return o.t('myLoc');
}
if(typeof module!=='undefined'&&module.exports)module.exports={geoKm,nearestIn,resolveName};
