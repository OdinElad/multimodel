// ===== Pure calculation helpers (no DOM, no globals). Tested by tests/calc.test.js =====
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const med=a=>{const s=[...a].sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2};
// Strict majority of n models, never fewer than 2 (4 models need 3, 5 need 3, 2 need 2). Same rule in server/alerts_lib.php.
const needFor=n=>Math.max(2,Math.floor(n/2)+1);
// s = {n: models that have a value, k: models that cross the threshold}. With a single selected model, that model decides.
const majority=s=>s.n>0&&s.k>=(s.n===1?1:needFor(s.n));

// Consensus of the models' values for one moment. Outlier: differs from the median of the others by 3 or more (needs 3 others).
// If fewer than 2 values would be left after filtering, nothing is filtered, the median of all is used and disagree=true.
// Returns {empty,med,min,max,inMin,inMax,out:[bool per input],disagree}.
function consensus(vals){
  const v=vals.map(x=>x==null?NaN:+x),ok=v.filter(Number.isFinite);
  if(!ok.length)return {empty:true,med:null,min:null,max:null,inMin:null,inMax:null,out:v.map(()=>false),disagree:false};
  // compare each value with the others (by position, so equal values are handled correctly)
  const idx=v.map((x,i)=>Number.isFinite(x)?i:-1).filter(i=>i>=0);
  let out=v.map((x,i)=>{
    if(!Number.isFinite(x))return false;
    const others=idx.filter(j=>j!==i).map(j=>v[j]);
    return others.length>=3&&Math.abs(x-med(others))>=3;
  });
  let disagree=false;
  let inl=idx.filter(i=>!out[i]);
  if(inl.length<2&&ok.length>=2){out=out.map(()=>false);inl=idx;disagree=true}
  const iv=inl.map(i=>v[i]);
  return {empty:false,med:med(iv),min:Math.min(...ok),max:Math.max(...ok),inMin:Math.min(...iv),inMax:Math.max(...iv),out,disagree};
}

// Per-day counts from the per-model rows [{max,min,rain,gust,code,cape}] (a missing value is null/undefined).
// A model with no value for a hazard is not counted in that hazard's denominator (n*), it does not count as "0".
function dayCounts(per){
  const has=k=>per.filter(x=>x[k]!=null);
  const rains=has('rain'),gusts=has('gust');
  const thunderPer=per.filter(x=>x.code!=null||x.cape!=null);
  return {
    nRain:rains.length,rainN:rains.filter(x=>x.rain>=1).length,heavyN:rains.filter(x=>x.rain>=20).length,
    rainAvg:rains.length?avg(rains.map(x=>x.rain)):0,rainMax:rains.length?Math.max(...rains.map(x=>x.rain)):0,
    nWind:gusts.length,windN:gusts.filter(x=>x.gust>=60).length,gustMax:gusts.length?Math.max(...gusts.map(x=>x.gust)):0,
    nThunder:thunderPer.length,thunderN:thunderPer.filter(x=>(x.code>=95)||(x.cape!=null&&x.cape>=1000&&(x.rain??0)>=1)).length
  };
}

// Current temperature estimate for the user's place, corrected by nearby measurements.
// For each nearby station the server gives the measurement (temp_c) and the models' median at the station
// at the same time (model_c). Their difference is how far off the models are in this area right now
// (for example a clear night that cools faster than the models think). The differences are averaged with weights
// that favour stations that are close and in a similar setting (distance from the sea, elevation), and the
// average is added to the models' median for the user's place. The result is an estimate, not a measurement.
// Returns {value, corr, n} or null when no station is similar enough to learn from.
const EST={maxKm:25,minSim:0.25,maxCorr:8};
function similarity(c,userCoast,userElev){
  let s=1;
  if(c.coast_km!=null&&userCoast!=null&&!(c.coast_km>25&&userCoast>25))s*=Math.exp(-Math.abs(c.coast_km-userCoast)/3);
  if(c.elev!=null&&userElev!=null)s*=Math.exp(-Math.abs(c.elev-userElev)/100);
  return s;
}
function obsEstimate(modelNow,cands,userCoast,userElev){
  if(typeof modelNow!=='number'||!Number.isFinite(modelNow))return null;
  const list=(cands||[]).filter(c=>c&&Number.isFinite(c.temp_c)&&Number.isFinite(c.model_c)&&Number.isFinite(c.dist_km)&&c.dist_km<=EST.maxKm);
  let ws=0,sum=0,best=0,n=0;
  for(const c of list){
    const sim=similarity(c,userCoast,userElev);best=Math.max(best,sim);
    const w=sim/(c.dist_km*c.dist_km+4);ws+=w;sum+=w*(c.temp_c-c.model_c);n++;
  }
  if(!n||best<EST.minSim||!(ws>0))return null;
  const corr=Math.max(-EST.maxCorr,Math.min(EST.maxCorr,sum/ws));
  return {value:modelNow+corr,corr,n};
}
if(typeof module!=='undefined'&&module.exports)module.exports={avg,med,needFor,majority,consensus,dayCounts,obsEstimate,EST};
