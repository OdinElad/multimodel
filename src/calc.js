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
if(typeof module!=='undefined'&&module.exports)module.exports={avg,med,needFor,majority,consensus,dayCounts};
