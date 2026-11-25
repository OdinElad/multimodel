// avg, med, majority, consensus and dayCounts live in calc.js (pure functions, tested in tests/calc.test.js)
const r1=v=>Math.round(v*10)/10;
const q2=v=>Math.round(+v*100)/100; // coordinates leave the device rounded to 2 decimals (about 1 km)
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function load(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}

// ===== שפה ויחידות (לפי האדם, לא לפי המקום) =====
function navLangs(){const a=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'en']);return a.map(x=>String(x))}
function detectLang(){for(const l of navLangs()){let p=l.toLowerCase().split(/[-_]/)[0];if(p==='iw')p='he';if(L.includes(p))return p}return 'en'}
// אזור "אמריקאי" נקבע רק אם גם הגדרת האזור וגם אזור הזמן מתאימים (הרבה מחשבים בישראל מוגדרים en-US).
// התוצאה נשמרת בפעם הראשונה, כך שמי שטס לחו"ל ממשיך לקבל את אותן יחידות.
function detectImperial(){
  const saved=load('mm_units_det');if(saved==='imperial'||saved==='metric')return saved==='imperial';
  const IMP=['US','LR','MM','PR','GU','VI','AS','MP','UM','BS','BZ','KY','PW','FM','MH'];
  let region='';
  for(const l of navLangs()){const m=l.match(/[-_]([A-Za-z]{2})\b/);if(m){region=m[1].toUpperCase();break}}
  if(!region){try{region=new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).maximize().region||''}catch(e){}}
  let tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}
  const tzOk=!tz||/^(America|Pacific|US)\//.test(tz)||tz==='Africa/Monrovia'||tz==='Asia/Yangon'||tz==='Asia/Rangoon';
  const imp=IMP.includes(region)&&tzOk;
  store('mm_units_det',imp?'imperial':'metric');
  return imp;
}
let LANG='en',LI=1,LOC='en';
const U={imp:false};
function applyPrefs(){
  const pl=load('mm_lang')||'auto',pu=load('mm_units')||'auto';
  LANG=pl==='auto'?detectLang():pl;LI=L.indexOf(LANG);if(LI<0){LANG='en';LI=1}
  LOC={zh:'zh-CN',he:'he-IL',ar:'ar',ru:'ru-RU',ja:'ja-JP',fr:'fr-FR',de:'de-DE',es:'es-ES',it:'it-IT',pt:'pt-PT',nl:'nl-NL',pl:'pl-PL',uk:'uk-UA'}[LANG]||'en';
  U.imp=pu==='auto'?detectImperial():pu==='imperial';
  document.documentElement.lang=LANG;document.documentElement.dir=RTL[LANG]?'rtl':'ltr';
  document.title=t('appName')+' | '+t('tagline');
}
function t(k,p){const a=S[k];let s=a?(a[LI]??a[1]):k;if(p)for(const x in p)s=s.split('{'+x+'}').join(p[x]);return s}
const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;

// המרות תצוגה (כל החישובים נעשים במטרי)
const cT=c=>U.imp?c*9/5+32:c;
const fT=c=>c==null?'·':Math.round(cT(c))+'°';
const fT1=c=>c==null?'·':r1(cT(c))+'°';
const fDiff=d=>r1(U.imp?d*9/5:d)+'°';
const wU=()=>U.imp?'mph':t('kmh');
const cW=k=>U.imp?k*0.621371:k;
const fW=k=>Math.round(cW(k))+' '+wU();
const rU=()=>U.imp?'in':t('mm');
const cR=m=>U.imp?m/25.4:m;
const nR=m=>U.imp?Math.round(m/25.4*100)/100:r1(m);
const fR=m=>nR(m)+' '+rU();
const fDist=k=>U.imp?r1(k*0.621371)+' mi':r1(k)+' '+t('km');
const tUnit=()=>U.imp?'°F':'°C';
function fmtH(iso){const h=+iso.slice(11,13),m=iso.slice(14,16);if(!U.imp)return iso.slice(11,16);return (h%12||12)+(m!=='00'?':'+m:'')+(h<12?' AM':' PM')}
function wd(dateStr,style){try{return new Intl.DateTimeFormat(LOC,{weekday:style,timeZone:'UTC'}).format(new Date(dateStr+'T12:00:00Z'))}catch(e){return dateStr}}
function dayRef(dateStr,i){return i===0?t('today'):i===1?t('tomorrow'):t('onDay',{d:wd(dateStr,'long')})}
function dayLabel(dateStr,i){return cap(i===0?t('today'):i===1?t('tomorrow'):wd(dateStr,'long'))}
function dayShort(dateStr,i){return cap(i===0?t('today'):i===1?t('tomorrow'):wd(dateStr,'short'))}
function dmy(s){const [y,m,d]=s.split('-');return U.imp?`${+m}/${+d}`:`${+d}.${+m}`}

// ===== מודלים =====
const MODELS=[
  {id:'ecmwf_ifs025',name:'ECMWF',org:'ECMWF · EU',flag:'🇪🇺',color:'#4f9cf9'},
  {id:'gfs_seamless',name:'GFS',org:'NOAA · USA',flag:'🇺🇸',color:'#f59e0b'},
  {id:'icon_seamless',name:'ICON',org:'DWD · Germany',flag:'🇩🇪',color:'#22c55e'},
  {id:'ukmo_seamless',name:'UKMO',org:'Met Office · UK',flag:'🇬🇧',color:'#ec4899'},
  {id:'meteofrance_seamless',name:'Météo-France',short:'Météo-Fr',org:'Météo-France · France',flag:'🇫🇷',color:'#a78bfa'}
];
const WCK={0:['☀️','clear'],1:['🌤️','mostlyClear'],2:['⛅','partly'],3:['☁️','cloudy'],45:['🌫️','fog'],48:['🌫️','fog'],
51:['🌦️','drizzle'],53:['🌦️','drizzle'],55:['🌦️','drizzle'],56:['🌧️','freezing'],57:['🌧️','freezing'],
61:['🌧️','lightRain'],63:['🌧️','rain'],65:['🌧️','heavyRain'],66:['🌧️','freezing'],67:['🌧️','freezing'],
71:['🌨️','snow'],73:['🌨️','snow'],75:['❄️','snow'],77:['🌨️','snow'],80:['🌦️','showers'],81:['🌧️','showers'],82:['⛈️','heavyRain'],
85:['🌨️','snow'],86:['🌨️','snow'],95:['⛈️','thunder'],96:['⛈️','hail'],99:['⛈️','hail']};
const wc=c=>{const w=WCK[c]||['🌡️','unknown'];return [w[0],t('c_'+w[1])]};

let state={place:null,data:null,tab:'temp',obs:null,cached:false};

async function fetchForecast(p){
  const ids=MODELS.map(m=>m.id).join(',');
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${q2(p.lat)}&longitude=${q2(p.lon)}`+
   `&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,cape`+
   `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,weather_code,sunrise,sunset`+
   `&models=${ids}&timezone=auto&forecast_days=7`;
  const r=await fetch(u);
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}

// מדידה מתחנה (דרך api.php בהוסטינגר).
const OBS_API='https://maromcyber.com/weather/api.php'; // אם הקובץ לא קיים, האפליקציה ממשיכה בלי מדידות.
async function fetchObs(p){
  if(!/^https?:/.test(location.protocol))return null;
  try{
    const ac=new AbortController();const tm=setTimeout(()=>ac.abort(),7000);
    const r=await fetch(`${OBS_API}?lat=${q2(p.lat)}&lon=${q2(p.lon)}`,{signal:ac.signal});clearTimeout(tm);
    if(!r.ok)return null;const j=await r.json();
    if(!j||!j.ok)return null;
    // Candidates (new server) or the single nearest station (older server). Each one gets its age in minutes.
    const now=Date.now()/1000;
    const cands=(Array.isArray(j.cands)?j.cands:[j]).filter(c=>c&&typeof c.temp_c==='number').map(c=>({...c,age:Math.max(0,Math.round((now-c.time)/60)),_age:Math.round((now-c.time)/60)}))
      .filter(c=>c.dist_km<=25&&c._age<=120&&c._age>=-10);
    if(!cands.length)return null;
    return {cands,user_coast_km:typeof j.user_coast_km==='number'?j.user_coast_km:null};
  }catch(e){return null}
}

function pick(obj,key,id){return obj[`${key}_${id}`]||null}

function process(d,ids){
  const H=d.hourly,D=d.daily;
  const models=MODELS.filter(m=>(!ids||ids.includes(m.id))&&(()=>{const a=pick(H,'temperature_2m',m.id);return a&&a.some(v=>v!==null)})());
  const nowLocal=new Date(Date.now()+d.utc_offset_seconds*1000).toISOString().slice(0,13);
  let ni=H.time.findIndex(x=>x.slice(0,13)===nowLocal); if(ni<0)ni=0;
  const days=D.time.map((tm,i)=>{
    const per=models.map(m=>({m,
      max:pick(D,'temperature_2m_max',m.id)?.[i],min:pick(D,'temperature_2m_min',m.id)?.[i],
      rain:pick(D,'precipitation_sum',m.id)?.[i],gust:pick(D,'wind_gusts_10m_max',m.id)?.[i],
      code:pick(D,'weather_code',m.id)?.[i],
      cape:(()=>{const c=pick(H,'cape',m.id);if(!c)return null;const s=c.slice(i*24,i*24+24).filter(v=>v!==null);return s.length?Math.max(...s):null})()
    })).filter(x=>x.max!=null);
    const n=per.length;
    const maxs=per.map(x=>x.max),mins=per.map(x=>x.min);
    const dc=dayCounts(per);
    const codes=per.map(x=>x.code).filter(c=>c!=null).sort((a,b)=>a-b);
    return {idx:i,date:tm,per,n,max:n?avg(maxs):null,min:n?avg(mins):null,...dc,
      spread:n?Math.max(...maxs)-Math.min(...maxs):0,
      code:codes.length?codes[Math.floor(codes.length/2)]:0};
  });
  return {models,ni,days,H,D};
}

function conf(d){
  if(!d.n)return 0;
  const p=d.nRain?d.rainN/d.nRain:0;
  let c=100-Math.min(40,d.spread*7)-(1-Math.abs(2*p-1))*35-(d.idx||0)*3;
  if(d.n<3)c-=10;
  return Math.max(30,Math.min(97,Math.round(c)));
}
function agree(day){const c=conf(day);return [c>=80?'hi':c>=60?'md':'lo',t('conf',{n:c})]}

function hourStats(P,i,key,thr){
  const v=P.models.map(m=>(pick(P.H,key,m.id)||[])[i]).filter(x=>x!=null);
  return {n:v.length,k:v.filter(x=>x>=thr).length,mean:v.length?avg(v):null};
}
function dph(P,i){return dayRef(P.H.time[i].slice(0,10),Math.floor(i/24))}

function rainLine(P){
  const T=P.H.time,end=Math.min(P.ni+72,T.length);
  const rs=i=>hourStats(P,i,'precipitation',0.2);
  let st=-1;
  for(let i=P.ni;i<end;i++){if(majority(rs(i))){st=i;break}}
  if(st<0){
    for(let i=P.ni;i<end;i++){const s=rs(i);if(s.k>=1)return ['🌦️',t('mostNo'),t('onlyK',{k:s.k,n:s.n,d:dph(P,i),t:fmtH(T[i])})]}
    return ['☀️',t('noRain3'),t('noneModel')];
  }
  let en=st,gap=0,kmax=0,nn=0;
  for(let i=st;i<T.length;i++){const s=rs(i);
    if(majority(s)){en=i;gap=0;if(s.k>kmax){kmax=s.k;nn=s.n}}else if(++gap>2)break}
  let sum=0;for(let i=st;i<=en;i++)sum+=rs(i).mean||0;
  const e=T[en+1];
  const endTxt=!e?t('endRange'):Math.floor((en+1)/24)===Math.floor(st/24)?fmtH(e):`${fmtH(e)} (${dph(P,en+1)})`;
  const title=st===P.ni?t('rainNow',{e:endTxt}):t('rainAt',{d:dph(P,st),a:fmtH(T[st]),b:endTxt});
  return ['🌧️',title,t('rainMeta',{k:kmax,n:nn,s:fR(sum)})];
}

function practical(P){
  const T=P.H.time,out=[];
  const rs=i=>hourStats(P,i,'precipitation',0.2);
  const tm=i=>hourStats(P,i,'temperature_2m',-999).mean;
  const wn=i=>hourStats(P,i,'wind_speed_10m',-999).mean;
  const hr=i=>+T[i].slice(11,13);
  const base=hr(P.ni)<15?0:24,lab=base?t('tomorrow'):t('today');
  let maj=0,minr=0,wmax=0;
  for(let i=Math.max(P.ni,base+8);i<Math.min(base+17,T.length);i++){const s=rs(i);if(majority(s))maj++;else if(s.k>=1)minr++;wmax=Math.max(wmax,wn(i)||0)}
  out.push(['🧺',t('laundry'),...(maj?['lo',t('no'),t('laundryNo',{d:lab})]:
    minr?['md',t('maybe'),t('laundryMaybe',{d:lab})]:
    ['hi',t('yes'),t('laundryYes',{d:lab})+(wmax>=35?t('windyAdd'):'')])]);
  let best=-1,bs=1e9;
  for(let i=P.ni;i<Math.min(P.ni+24,T.length);i++){
    if(hr(i)<6||hr(i)>21)continue;const s=rs(i);if(majority(s))continue;
    const x=tm(i),w=wn(i)||0;if(x==null)continue;
    const sc=Math.abs(x-16)+w/4+(s.k?5:0);if(sc<bs){bs=sc;best=i}}
  out.push(['🏃',t('run'),...(best<0?['lo',t('no'),t('runNo')]:
    ['hi',t('yes'),t('runYes',{d:dph(P,best),t:fmtH(T[best]),v:fT(tm(best)),w:fW(wn(best)||0)})])]);
  let sum=0,mh=0;
  for(let i=P.ni;i<Math.min(P.ni+48,T.length);i++){sum+=hourStats(P,i,'precipitation',0).mean||0;if(majority(rs(i)))mh++}
  out.push(['🌱',t('garden'),...(sum>=5&&mh?['lo',t('no'),t('gardenNo',{v:fR(sum)})]:
    sum>=1?['md',t('little'),t('gardenLittle',{v:fR(sum)})]:
    ['hi',t('yes'),t('gardenYes')])]);
  return out;
}

function render(){
  const {data,place,obs}=state;
  let P=process(data,activeIds());
  const PA=process(data);
  if(!P.models.length)P=PA;
  const {models,ni,days,H}=P;
  const one=models.length===1,skillTop=state.skill&&state.skill.list[0].id;
  sky(P);
  if(!models.length){$('#app').innerHTML=`<div class="err">${t('noData')}</div>`;return}
  const nowPer=models.map(m=>({m,t:pick(H,'temperature_2m',m.id)[ni],c:pick(H,'weather_code',m.id)?.[ni],w:pick(H,'wind_speed_10m',m.id)?.[ni]})).filter(x=>x.t!=null);
  if(!nowPer.length){$('#app').innerHTML=`<div class="err">${t('noData')}</div>`;return} // no model has a value for this hour
  const cs=consensus(nowPer.map(x=>x.t)); // outliers are filtered only while at least 2 models remain; otherwise median of all + a disagreement note
  nowPer.forEach((x,i)=>x.out=cs.out[i]);
  const nowIn=nowPer.filter(x=>!x.out),outs=nowPer.filter(x=>x.out);
  const nowT=cs.med,nowMin=cs.min,nowMax=cs.max;
  const nowCodes=nowPer.map(x=>x.c??0).sort((a,b)=>a-b);
  const nowCode=nowCodes[Math.floor(nowCodes.length/2)]||0;
  const nowC=wc(nowCode);
  const nowW=avg(nowPer.map(x=>x.w??0));
  const today=days[0];
  const ag=agree(today);
  const rl=rainLine(P),qa=practical(P);
  const hrNow=+H.time[ni].slice(11,13);
  // Estimate for this place: the models' median corrected by how far off the models are at nearby stations right now (calc.js obsEstimate).
  const est=obs?obsEstimate(nowT,obs.cands,obs.user_coast_km,typeof data.elevation==='number'?data.elevation:null):null;
  const estSrc=est?[...new Set(obs.cands.filter(c=>Number.isFinite(c.model_c)).map(c=>c.source))]:[];
  const nightNote=!est&&(hrNow<=8||hrNow>=19)&&nowW<12&&nowCode<=2;

  const al=[];
  PA.days.slice(0,4).forEach((d,i)=>{
    const dr=dayRef(d.date,i);
    if(d.nThunder&&d.thunderN>=needFor(d.nThunder))al.push(['red','⛈️',t('thunder',{d:dr}),t('thunderMeta',{k:d.thunderN,n:d.nThunder})]);
    else if(d.thunderN>=1)al.push(['orange','⛈️',t('thunderEarly',{d:dr}),t('thunderEarlyMeta',{k:d.thunderN,n:d.nThunder})]);
    if(d.nRain&&d.heavyN>=needFor(d.nRain))al.push(['red','🌊',t('heavy',{d:dr}),t('heavyMeta',{k:d.heavyN,v:fR(20)})]);
    if(d.nWind&&d.windN>=needFor(d.nWind))al.push(['orange','💨',t('windA',{d:dr}),t('windMeta',{k:d.windN,v:fW(60),m:fW(d.gustMax)})]);
  });
  const nextRain=PA.days.findIndex(d=>d.nRain&&d.rainN>=needFor(d.nRain));
  if(!al.length)al.push(['green','✅',t('calm'),nextRain<0?t('calmNone'):t('calmRain',{d:dayRef(PA.days[nextRain].date,nextRain)})]);

  const bigT=est?est.value:nowT;
  const srcName=x=>x==='IMS'?t('imsName'):'NOAA Aviation Weather Center (METAR)';
  const html=`
  ${state.cached?`<div class="err" style="margin-bottom:14px">${t('cached')}</div>`:''}
  <section class="card">
    <div class="hero">
      <div>
        <div class="place">📍 ${esc(place.name)}</div>
        ${est?`<div class="updated" style="color:#6ee7a0">✅ ${t('estLine')}</div>
          <div class="updated">${t('srcLine',{s:estSrc.map(srcName).join(', ')})}</div>
          ${estSrc.includes('IMS')?`<div class="updated" style="font-size:11px">${t('imsDisc')}</div>`:''}
          <div class="updated">${t('modelsSay',{v:fT(nowT)})}</div>`
        :one?`<div class="updated">${t(models[0].id===skillTop?'oneModel':'oneModelPick',{m:models[0].name,t:fmtH(H.time[ni])})}</div>`
        :`<div class="updated">${t('medianOf',{n:nowIn.length,t:fmtH(H.time[ni])})}${outs.length?' · '+t('excluded',{m:outs.map(x=>x.m.name).join(', ')}):''}${cs.disagree?' · '+t('highDisagree'):''}</div>`}
        <div class="cond">${nowC[0]} ${nowC[1]} · ${t('wind')} ${fW(nowW)}</div>
        <div class="rangeline">${t('todayRange',{a:fT(today.min),b:fT(today.max)})}${one?'':` · <span class="pill ${ag[0]}" title="${esc(t('confHint'))}">${ag[1]}</span>`}</div>
      </div>
      <div class="bigt">${Math.round(cT(bigT))}<sup>°</sup></div>
    </div>
    <div class="now-models">
      ${nowPer.map(x=>`<div class="nm"${x.out?' style="opacity:.55;border-style:dashed"':''}><span class="dot" style="background:${x.m.color}"></span>${x.m.id===skillTop?'⭐ ':''}${x.m.name} <b dir="ltr">${fT1(x.t)}</b>${x.out?' ⚠️':''}</div>`).join('')}
      <button class="nm addm" id="addModel">${t('addModel')}</button>
    </div>
    ${one?'':`<div class="rangeline">${t('spreadNow',{v:fDiff(nowMax-nowMin)})}${outs.length?' '+t('spreadEx',{v:fDiff(cs.inMax-cs.inMin)}):''}</div>`}
    <div class="rangeline" style="font-size:11.5px"><a href="https://open-meteo.com/" target="_blank" rel="noopener" style="color:#9cc3ff" dir="ltr">Weather data by Open-Meteo.com</a></div>
    ${nightNote?`<div class="rangeline" style="color:#fcd34d">${t('nightNote',{v:U.imp?t('range24',{a:4,b:7}):t('range24',{a:2,b:4})})}</div>`:''}
  </section>

  <section class="card" id="skillCard">${state.skill===undefined?`<h2>${t('skillTitle')}</h2><p class="sub">${t('loading')}</p>`:skillHTML(state.skill)}</section>

  <section class="card">
    <div class="rainline"><div class="e">${rl[0]}</div><div><b>${rl[1]}</b><span>${rl[2]}</span></div></div>
  </section>

  <section class="card alerts">
    <h2>${t('alertsTitle')}</h2>
    <p class="sub">${t('alertsSub')} ${t('alertsAll',{n:PA.models.length})}</p>
    <button class="btn stbtn" id="stormBtn">${t('stBtn')}</button>
    ${al.map(a=>`<div class="al ${a[0]}"><div style="font-size:22px">${a[1]}</div><div><b>${a[2]}</b><span>${a[3]}</span></div></div>`).join('')}
  </section>

  <section class="card">
    <h2>${t('qaTitle')}</h2>
    <p class="sub">${t('qaSub')}</p>
    ${qa.map(q=>`<div class="qa"><div class="e">${q[0]}</div><div><b>${q[1]} <span class="pill ${q[2]}">${q[3]}</span></b><span class="t">${q[4]}</span></div></div>`).join('')}
  </section>

  <section class="card">
    <h2>${t('daysTitle')}</h2>
    <p class="sub">${t('daysSub')}</p>
    <div class="days">
      ${days.map((d,i)=>{const a=agree(d);const c=wc(d.code);const pct=d.nRain?Math.round(d.rainN/d.nRain*100):0;return `
      <div class="day" data-i="${i}">
        <div><div class="dn">${dayLabel(d.date,i)}</div><div class="dd">${dmy(d.date)}</div></div>
        <div class="ico">${c[0]}</div>
        <div class="sum">${c[1]}${one?'':` · <span class="pill ${a[0]}" style="padding:1px 7px" title="${esc(t('confHint'))}">${a[1]}</span>`}<br>
          <span class="m">${one?(d.rainMax>=0.1?t('rainAmt',{v:fR(d.rainMax)}):t('noRainD')):(d.nRain?t('rainOf',{k:d.rainN,n:d.nRain}):'·')+(d.rainN?' · '+t('upTo',{v:fR(d.rainMax)}):'')}</span>
          <div class="bar"><i style="width:${pct}%"></i></div></div>
        <div class="tt" dir="ltr"><b>${fT(d.max)}</b> <span>${fT(d.min)}</span></div>
        <div class="detail"><div class="tbl-wrap"><table>
          <tr><th class="l">${t('model')}</th><th>${t('max')}</th><th>${t('min')}</th><th>${t('rainH')} (${rU()})</th><th>${t('gustH')} (${wU()})</th><th>${t('condH')}</th></tr>
          ${d.per.map(x=>`<tr><td class="l"><span class="dot" style="background:${x.m.color}"></span> ${x.m.name}</td><td>${fT1(x.max)}</td><td>${fT1(x.min)}</td><td>${x.rain==null?'·':nR(x.rain)}</td><td>${x.gust==null?'·':Math.round(cW(x.gust))}</td><td>${wc(x.code??0)[0]}</td></tr>`).join('')}
          ${one?'':`<tr class="cons"><td class="l">${t('mean')}</td><td>${fT1(d.max)}</td><td>${fT1(d.min)}</td><td>${d.nRain?nR(d.rainAvg):'·'}</td><td>${d.nWind?Math.round(cW(avg(d.per.filter(x=>x.gust!=null).map(x=>x.gust)))):'·'}</td><td>${c[0]}</td></tr>`}
        </table></div></div>
      </div>`}).join('')}
    </div>
  </section>

  <section class="card">
    <h2>${t('chartTitle')}</h2>
    <p class="sub">${t('chartSub')}</p>
    <div class="tabs" id="tabs">
      <button class="tab ${state.tab==='temp'?'on':''}" data-t="temp">${t('tabTemp')}</button>
      <button class="tab ${state.tab==='rain'?'on':''}" data-t="rain">${t('tabRain')}</button>
      <button class="tab ${state.tab==='gust'?'on':''}" data-t="gust">${t('tabGust')}</button>
    </div>
    <div id="chart">${chart(P)}</div>
    <div class="legend">${models.map(m=>`<span${m.id===skillTop?' style="color:#fff;font-weight:700"':''}><i class="dot" style="background:${m.color}"></i>${m.id===skillTop?'⭐ ':''}${m.name}</span>`).join('')}${one?'':`<span><i class="dot" style="background:#fff"></i>${t('mean')}</span>`}</div>
  </section>

  <section class="card">
    <h2>${t('hourlyTitle')}</h2>
    <p class="sub">${t('hourlySub',{w:state.tab==='temp'?t('wTemp',{u:tUnit()}):state.tab==='rain'?t('wRain',{u:rU()}):t('wGust',{u:wU()})})}</p>
    <div class="tbl-wrap" style="max-height:420px;overflow:auto">${hourly(P)}</div>
  </section>

  <section class="card">
    <h2>${t('modelsTitle')}</h2>
    <p class="sub">${t('modelsSub')}</p>
    <button class="btn" id="addModel2" style="margin-bottom:10px">${t('mTitle')}</button>
    <div class="models-info">${PA.models.map(m=>`<div class="mi"><b><span class="dot" style="background:${m.color}"></span>${m.flag} ${m.name}</b><span>${m.org}</span></div>`).join('')}</div>
  </section>`;
  $('#app').innerHTML=html;
  document.querySelectorAll('.day').forEach(el=>el.addEventListener('click',()=>el.classList.toggle('open')));
  document.querySelectorAll('.tab').forEach(el=>el.addEventListener('click',()=>{state.tab=el.dataset.t;render()}));
  $('#addModel').onclick=$('#addModel2').onclick=openModels;
  $('#stormBtn').onclick=()=>openStorm(PA);
}

function seriesRaw(P,m){const k=state.tab==='temp'?'temperature_2m':state.tab==='rain'?'precipitation':'wind_gusts_10m';return pick(P.H,k,m.id)||[]}
const conv=v=>v==null?null:state.tab==='temp'?cT(v):state.tab==='rain'?cR(v):cW(v);

function chart(P){
  const W=720,Hh=240,pl=34,pr=8,pt=12,pb=28;
  const N=P.H.time.length;
  const all=P.models.map(m=>seriesRaw(P,m).map(conv));
  const mean=P.H.time.map((_,i)=>{const v=all.map(a=>a[i]).filter(x=>x!=null);return v.length?avg(v):null});
  const vals=all.flat().filter(v=>v!=null);
  let lo=Math.min(...vals),hi=Math.max(...vals);
  if(state.tab!=='temp'){lo=0;hi=Math.max(hi,state.tab==='rain'?cR(2):cW(30))}
  else{lo=Math.floor(lo-1);hi=Math.ceil(hi+1)}
  const x=i=>pl+(W-pl-pr)*i/(N-1);
  const y=v=>pt+(Hh-pt-pb)*(1-(v-lo)/(hi-lo||1));
  let g='';
  for(let s=0;s<=4;s++){const v=lo+(hi-lo)*s/4;g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="#22305a" stroke-width="1"/><text x="${pl-5}" y="${y(v)+4}" fill="#8e9cc4" font-size="10" text-anchor="end">${state.tab==='rain'?(U.imp?Math.round(v*100)/100:r1(v)):Math.round(v)}</text>`}
  P.H.time.forEach((tm,i)=>{if(tm.endsWith('T00:00'))g+=`<line x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${Hh-pb}" stroke="#2c3c6c" stroke-dasharray="2 3"/>`;
    if(tm.endsWith('T12:00'))g+=`<text x="${x(i)}" y="${Hh-8}" fill="#8e9cc4" font-size="11" text-anchor="middle">${esc(dayShort(tm.slice(0,10),Math.floor(i/24)))}</text>`});
  g+=`<line x1="${x(P.ni)}" x2="${x(P.ni)}" y1="${pt}" y2="${Hh-pb}" stroke="#4f9cf9" stroke-width="1.5"/><text x="${x(P.ni)}" y="${pt+9}" fill="#4f9cf9" font-size="10" text-anchor="middle">${t('now')}</text>`;
  const path=a=>{let d='',on=false;a.forEach((v,i)=>{if(v==null){on=false;return}d+=(on?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1);on=true});return d};
  if(state.tab==='rain'){const bw=(W-pl-pr)/N;mean.forEach((v,i)=>{if(v&&v>cR(0.05))g+=`<rect x="${x(i)-bw/2}" y="${y(v)}" width="${bw}" height="${y(0)-y(v)}" fill="#3b82f655"/>`})}
  const bst=bestId(),hl=bst&&P.models.length>1&&P.models.some(m=>m.id===bst);
  P.models.forEach((m,k)=>{if(m.id!==bst||!hl)g+=`<path d="${path(all[k])}" fill="none" stroke="${m.color}" stroke-width="${hl?1.3:1.6}" opacity="${hl?.55:.85}"/>`});
  if(hl){const k=P.models.findIndex(m=>m.id===bst);g+=`<path d="${path(all[k])}" fill="none" stroke="${P.models[k].color}" stroke-width="3.2"/>`}
  if(P.models.length>1)g+=`<path d="${path(mean)}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 4"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" style="direction:ltr">${g}</svg>`;
}

function hourly(P){
  const rows=[];
  for(let i=P.ni;i<Math.min(P.ni+48,P.H.time.length);i++){
    const tm=P.H.time[i];
    const raw=P.models.map(m=>seriesRaw(P,m)[i]);
    const ok=raw.filter(a=>a!=null);const mean=ok.length?avg(ok):null;
    const fmt=a=>a==null?'·':state.tab==='temp'?fT1(a):state.tab==='rain'?(a<0.05?'0':nR(a)):Math.round(cW(a));
    const hot=a=>{if(a==null)return '';if(state.tab==='rain'&&a>=1)return 'style="color:#93c5fd;font-weight:700"';if(state.tab==='gust'&&a>=50)return 'style="color:#fcd34d;font-weight:700"';return ''};
    const lbl=tm.endsWith('T00:00')?`<b>${esc(dayShort(tm.slice(0,10),Math.floor(i/24)))}</b> ${fmtH(tm)}`:fmtH(tm);
    rows.push(`<tr><td class="l">${lbl}</td>${raw.map(a=>`<td ${hot(a)}>${fmt(a)}</td>`).join('')}${P.models.length>1?`<td class="cons">${fmt(mean)}</td>`:''}</tr>`);
  }
  return `<table${P.models.length<=3?' style="min-width:0"':''}><tr><th class="l">${t('hourH')}</th>${P.models.map(m=>`<th${m.id===bestId()?' style="color:#fff"':''}><span class="dot" style="background:${m.color}"></span> ${m.id===bestId()&&P.models.length>1?'⭐ ':''}${m.name}</th>`).join('')}${P.models.length>1?`<th>${t('mean')}</th>`:''}</tr>${rows.join('')}</table>`;
}

// ===== איזה מודל הכי קרוב לקונצנזוס: בדיקה על 7 הימים האחרונים במקום הזה =====
// כל מודל נבדק לפי התחזית שנתן יום מראש (previous_day1) מול החציון של כל המודלים.
// ההשוואה היא לחציון של כל המודלים לאותה שעה אחרי מעשה, בשעות שכבר עברו. זו לא מדידה בפועל.
async function fetchSkill(p){
  const key='mm_skill_'+p.lat.toFixed(1)+'_'+p.lon.toFixed(1);
  const c=load(key);
  if(c&&Date.now()-c.at<6*3600e3)return c.r;
  const ids=MODELS.map(m=>m.id).join(',');
  const u=`https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${q2(p.lat)}&longitude=${q2(p.lon)}`+
    `&hourly=temperature_2m,temperature_2m_previous_day1&models=${ids}&past_days=7&forecast_days=1&timezone=auto`;
  try{
    const r=await fetch(u);if(!r.ok)return null;
    const res=skillCompute(await r.json());
    if(res)store(key,{at:Date.now(),r:res});
    return res;
  }catch(e){return null}
}
function skillCompute(d){
  const H=d&&d.hourly;if(!H||!H.time)return null;
  const nowLocal=new Date(Date.now()+(d.utc_offset_seconds||0)*1000).toISOString().slice(0,13);
  const ms=MODELS.map(m=>({m,a:pick(H,'temperature_2m',m.id),f:pick(H,'temperature_2m_previous_day1',m.id),e:[]}))
    .filter(x=>x.a&&x.f);
  if(ms.length<3)return null;
  for(let i=0;i<H.time.length;i++){
    if(H.time[i].slice(0,13)>=nowLocal)break;
    const act=ms.map(x=>x.a[i]).filter(v=>v!=null);
    if(act.length<3)continue;
    const truth=med(act);
    ms.forEach(x=>{const f=x.f[i];if(f!=null)x.e.push(f-truth)});
  }
  const out=ms.filter(x=>x.e.length>=48).map(x=>({id:x.m.id,mae:avg(x.e.map(Math.abs)),bias:avg(x.e),n:x.e.length}))
    .sort((a,b)=>a.mae-b.mae);
  return out.length>=3?{list:out,days:Math.round(Math.max(...out.map(x=>x.n))/24)}:null;
}
function skillHTML(s){
  if(!s)return `<h2>${t('skillTitle')}</h2><p class="sub">${t('skillNA')}</p>`;
  const top=MODELS.find(m=>m.id===s.list[0].id);
  const worst=s.list[s.list.length-1].mae||1;
  return `<h2>${t('skillTitle')}</h2>
    <p class="sub">${t('skillSub',{d:s.days})}</p>
    <div class="al green"><div style="font-size:22px">⭐</div><div><b>${t('skillBest',{m:top.name})}</b><span>${t('skillErr',{v:fDiff(s.list[0].mae)})}</span></div></div>
    ${s.list.map((x,i)=>{const m=MODELS.find(y=>y.id===x.id);const b=Math.abs(x.bias)>=0.5?(x.bias>0?t('skillWarm',{v:fDiff(x.bias)}):t('skillCold',{v:fDiff(-x.bias)})):'';
      return `<div class="qa"><div class="e">${i+1}</div><div><b><span class="dot" style="background:${m.color}"></span> ${m.name} <span dir="ltr">±${fDiff(x.mae)}</span></b>
      <div class="bar"><i style="width:${Math.max(8,Math.round((1-x.mae/(worst*1.15))*100))}%;background:${m.color}"></i></div>
      ${b?`<span class="t">${b}</span>`:''}</div></div>`}).join('')}
    <p class="sub" style="margin-top:8px;font-size:11.5px">${t('skillNote')}</p>`;
}
async function loadSkill(p){
  const el=$('#skillCard');if(!el)return;
  const s=await fetchSkill(p);
  state.skill=s;
  if(state.place===p&&state.data)render();
}

// ===== מיקום =====
const norm=s=>(s||'').replace(/[֑-ׇ'"׳״\-\s()]/g,'').toLowerCase();
const km=(a,b,c,d)=>{const R=6371,r=x=>x*Math.PI/180;const h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
// On-device place naming: no request containing the user's position is sent to any naming service.
let GEO=null,geoP=null;
function loadGeo(){
  if(GEO)return Promise.resolve(GEO);
  if(!geoP)geoP=fetch('geo/cities15000.json').then(r=>r.ok?r.json():null).then(j=>{GEO=Array.isArray(j)?j:null;if(!GEO)geoP=null;return GEO}).catch(()=>{geoP=null;return null});
  return geoP;
}
async function reverseName(lat,lon){
  const near=LANG==='he'&&nearestIn(CITIES,lat,lon).d<=4;
  const geo=near?null:await loadGeo(); // offline or missing file: falls back to the Hebrew list or "My location"
  return resolveName({lang:LANG,cities:CITIES,geo,lat,lon,t});
}
function getPos(timeout=12000){
  return new Promise((res,rej)=>{
    if(!navigator.geolocation)return rej(new Error('nogeo'));
    navigator.geolocation.getCurrentPosition(p=>res(p.coords),e=>rej(e),{enableHighAccuracy:false,timeout,maximumAge:600000});
  });
}
function setLocUI(p){$('#locName').textContent=p?p.name:t('pickTitle');$('#locTag').hidden=!(p&&p.auto)}
function showBanner(html){const b=$('#banner');b.innerHTML=html;b.hidden=false}
function hideBanner(){$('#banner').hidden=true}

async function go(p){
  state.place=p;state.obs=null;state.cached=false;state.skill=undefined;store('mm_place',p);setLocUI(p);
  $('#app').innerHTML=`<div class="loading"><div class="spin"></div>${t('loading')}</div>`;
  const obsP=fetchObs(p);
  try{
    state.data=await fetchForecast(p);
    store('mm_last',{lat:p.lat,lon:p.lon,data:state.data});
  }catch(e){
    const last=load('mm_last');
    if(last&&km(last.lat,last.lon,p.lat,p.lon)<2){state.data=last.data;state.cached=true}
    else{$('#app').innerHTML=`<div class="err"><b>${t('loadErr')}</b><br>${t('checkNet')}</div>`;return}
  }
  render();
  alertsSync();
  loadSkill(p);
  const o=await obsP;
  if(o&&state.place===p){state.obs=o;render()}
}

// ===== חלון בחירת מיקום: בחירה מרשימה ואישור =====
let results=[],selected=null,active=-1,tmr,qid=0;
function openPicker(){
  $('#ov').classList.add('show');selected=null;$('#confirm').classList.remove('show');
  $('#q').value='';renderList(defaultList(),'');setTimeout(()=>$('#q').focus(),50);
}
function closePicker(){$('#ov').classList.remove('show')}
function defaultList(){
  const recent=(load('mm_recent')||[]).slice(0,5).map(r=>({...r,recent:true}));
  const pop=LANG==='he'?['פרדס חנה-כרכור','תל אביב-יפו','ירושלים','חיפה','באר שבע','אילת'].map(n=>{const c=CITIES.find(x=>x[0]===n);return {name:c[0],lat:c[1],lon:c[2],sub:c[3]+', ישראל'}}):[];
  const seen=new Set();return [...recent,...pop].filter(x=>{const k=norm(x.name)+Math.round(x.lat*10);if(seen.has(k))return false;seen.add(k);return true});
}
function renderList(items,q){
  results=items;active=-1;
  const Lst=$('#list');
  if(!items.length){Lst.innerHTML=`<div class="hint">${q?t('noResults'):t('typeCity')}</div>`;return}
  Lst.innerHTML=(q?'':`<div class="hint" style="text-align:start;padding:8px 14px">${t('recentPop')}</div>`)+
    items.map((x,i)=>`<button class="opt" data-i="${i}"><span>${x.recent?'🕘':'📍'}</span><span>${esc(x.name)}<small>${esc(x.sub||'')}</small></span><span class="ck">✓</span></button>`).join('');
}
function localMatches(q){
  if(LANG!=='he')return [];
  const n=norm(q);if(!n)return [];
  const s=CITIES.filter(c=>norm(c[0]).startsWith(n)),inc=CITIES.filter(c=>!norm(c[0]).startsWith(n)&&norm(c[0]).includes(n));
  return [...s,...inc].slice(0,8).map(c=>({name:c[0],lat:c[1],lon:c[2],sub:c[3]+', ישראל'}));
}
async function search(q){
  const my=++qid;
  const loc=localMatches(q);
  renderList(loc,q);
  if(q.trim().length<2)return;
  try{
    const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=${LANG}&format=json`);
    const j=await r.json();if(my!==qid)return;
    const api=(j.results||[]).map(x=>({name:x.name,lat:x.latitude,lon:x.longitude,sub:[x.admin1,x.country].filter(Boolean).join(', ')}));
    const all=[...loc];
    api.forEach(a=>{if(!all.some(b=>norm(b.name)===norm(a.name)&&km(a.lat,a.lon,b.lat,b.lon)<5))all.push(a)});
    renderList(all.slice(0,12),q);
  }catch(e){}
}
function choose(i){
  selected=results[i];if(!selected)return;
  document.querySelectorAll('.opt').forEach(o=>o.classList.toggle('sel',+o.dataset.i===i));
  $('#confirmTxt').innerHTML=`${t('switchTo',{p:esc(selected.name)})}<br><small style="color:var(--mut)">${esc(selected.sub||'')}</small>`;
  $('#confirm').classList.add('show');$('#ok').focus();
}
function confirmSel(){
  if(!selected)return;
  const p={name:selected.name,lat:+selected.lat,lon:+selected.lon,sub:selected.sub,auto:false};
  const rec=(load('mm_recent')||[]).filter(r=>!(norm(r.name)===norm(p.name)&&km(r.lat,r.lon,p.lat,p.lon)<5));
  rec.unshift({name:p.name,lat:p.lat,lon:p.lon,sub:p.sub});store('mm_recent',rec.slice(0,5));
  closePicker();hideBanner();go(p);
}
function geoErrText(e){return e&&e.code===1?t('permDenied'):t('geoFail')}


// ===== התראות על מזג אוויר חריג (Web Push) =====
const SUB_API='https://maromcyber.com/weather/subscribe.php';
const pushOK=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window)&&location.protocol==='https:';
function b64uToU8(s){s=s.replace(/-/g,'+').replace(/_/g,'/');s+='='.repeat((4-s.length%4)%4);const r=atob(s);return Uint8Array.from(r,c=>c.charCodeAt(0))}
function alertsMsg(txt,err){const m=$('#alertsMsg');if(!m)return;m.textContent=txt||'';m.classList.toggle('err',!!err)}
async function postSub(body){const r=await fetch(SUB_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json()}
async function currentSub(){if(!pushOK())return null;const reg=await navigator.serviceWorker.ready;return reg.pushManager.getSubscription()}
async function sendSub(sub){
  const p=state.place;if(!p||!sub)return false;
  let tz='UTC';try{tz=(state.data&&state.data.timezone)||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){}
  const j=await postSub({action:'subscribe',subscription:sub.toJSON(),lat:q2(p.lat),lon:q2(p.lon),name:p.name,lang:LANG,imperial:U.imp,tz});
  if(j&&j.ok){store('mm_alerts_sync',{sig:syncSig(p),at:Date.now()});return true}
  return false;
}
const syncSig=p=>[q2(p.lat),q2(p.lon),p.name,LANG,U.imp?1:0].join('|');
async function alertsEnable(){
  if(!pushOK()){alertsMsg(t('alertsUnsupported'),1);return false}
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){alertsMsg(t('alertsDenied'),1);return false}
  try{
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){const k=await (await fetch(SUB_API+'?key=1')).json();sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToU8(k.key)})}
    if(!(await sendSub(sub)))throw new Error('server');
    if(load('mm_unsub_pending')===sub.endpoint)store('mm_unsub_pending',null); // re-enabled on the same subscription: nothing to delete
    store('mm_alerts',true);return true;
  }catch(e){alertsMsg(t('alertsErr'),1);return false}
}
// Turning alerts off must really delete the server copy. If the server cannot be reached, the endpoint is kept in
// mm_unsub_pending and the deletion is retried on every app start. The browser subscription is removed only after the server confirmed.
async function serverUnsub(endpoint){
  try{const j=await postSub({action:'unsubscribe',endpoint});return !!(j&&j.ok)}catch(e){return false}
}
async function alertsDisable(){
  store('mm_alerts',false);store('mm_alerts_sync',null);
  let done=true;
  try{
    const sub=await currentSub();
    if(sub){
      if(await serverUnsub(sub.endpoint)){store('mm_unsub_pending',null);await sub.unsubscribe()}
      else{store('mm_unsub_pending',sub.endpoint);done=false}
    }
  }catch(e){}
  return done;
}
async function alertsPending(){ // on startup: finish a deletion that failed earlier
  const ep=load('mm_unsub_pending');if(!ep||!pushOK())return;
  try{
    const sub=await currentSub();
    if(load('mm_alerts')&&sub&&sub.endpoint===ep){store('mm_unsub_pending',null);return}
    if(!(await serverUnsub(ep)))return;
    store('mm_unsub_pending',null);
    if(sub&&sub.endpoint===ep&&!load('mm_alerts'))await sub.unsubscribe();
  }catch(e){}
}
async function alertsSync(force){ // update location, language and units on the server when they changed, and at most once every 7 days otherwise (keeps the subscription from expiring)
  if(!load('mm_alerts'))return;
  const p=state.place;if(!p)return;
  const last=load('mm_alerts_sync');
  if(!force&&last&&last.sig===syncSig(p)&&Date.now()-last.at<7*864e5)return;
  try{const sub=await currentSub();if(sub)await sendSub(sub)}catch(e){}
}
async function sendTest(fresh){
  const b=$('#alertsTest');b.disabled=true;alertsMsg(t('aWorking'));
  try{
    let sub=await currentSub();
    if(!sub){if(!(await alertsEnable()))return;sub=await currentSub()}   // subscription was lost (e.g. after an app update): renew it
    let j=await postSub({action:'test',endpoint:sub.endpoint}).catch(()=>null);
    if(j&&j.error==='not_found'){await sendSub(sub);j=await postSub({action:'test',endpoint:sub.endpoint}).catch(()=>null)}
    if(j&&(j.status===404||j.status===410)){ // the push service dropped this subscription (common after an app reinstall/update): make a fresh one
      await postSub({action:'unsubscribe',endpoint:sub.endpoint}).catch(()=>{});
      try{await sub.unsubscribe()}catch(e){}
      if(!(await alertsEnable()))return;
      sub=await currentSub();j=sub?await postSub({action:'test',endpoint:sub.endpoint,retry:1}).catch(()=>null):null;
    }
    if(j&&j.ok)alertsMsg(t(fresh?'aOnSent':'aSent',{p:state.place?state.place.name:''}));
    else if(j&&j.error==='too_soon')alertsMsg(t('aTooSoon'),1);
    else alertsMsg(t('aFail')+(j&&j.status?` (${j.status})`:''),1);
  }catch(e){alertsMsg(t('aFail'),1)}
  finally{b.disabled=false}
}
async function alertsHeal(){ // on startup: if alerts are on but the phone lost its subscription, renew it quietly
  if(!load('mm_alerts')||!pushOK())return;
  try{if(await currentSub())return;
    if(Notification.permission==='granted'){await alertsEnable()}else{store('mm_alerts',false)}}catch(e){}
}
function alertsUI(){
  const on=!!load('mm_alerts');const tg=$('#alertsTgl');if(!tg)return;
  tg.checked=on;$('#alertsTest').hidden=!on;
  if(on&&state.place)alertsMsg(t('alertsOn',{p:state.place.name}));else if(!pushOK())alertsMsg(t('alertsUnsupported'),1);else alertsMsg('');
}

// ===== הגדרות =====
function openSettings(){
  const pl=load('mm_lang')||'auto',pu=load('mm_units')||'auto';
  $('#selLang').innerHTML=`<option value="auto">${t('langAuto')}</option>`+L.map(l=>`<option value="${l}">${LANG_NAMES[l]}</option>`).join('');
  $('#selUnits').innerHTML=`<option value="auto">${t('unitsAuto')}</option><option value="metric">${t('metric')}</option><option value="imperial">${t('imperial')}</option>`;
  $('#selLang').value=pl;$('#selUnits').value=pu;
  $('#aboutBox').innerHTML=aboutHTML();
  $('#ovS').classList.add('show');alertsUI();
}
function closeSettings(){$('#ovS').classList.remove('show')}

function applyStatic(){
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  document.querySelectorAll('[data-tp]').forEach(el=>el.placeholder=t(el.dataset.tp));
  document.querySelectorAll('[data-ta]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.ta)));
  $('#credit').innerHTML=`<div class="made">👤 ${t('builtBy')}</div>
    <div style="margin-top:10px">${t('dataCredit',{l:'<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>'}).replace('CC BY 4.0','<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>')}</div>
    <div>${t('modNote')}</div>
    <div>${t('geoCredit').replace('CC BY 4.0','<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>')}</div>
    <div>${t('obsCredit')}</div><div>${t('imsDisc')}</div><div>${t('disclaimer')}</div><div><a class="pp" href="privacy.html">${t('privacy')}</a></div>`;
}

function rerenderAll(){
  applyPrefs();applyStatic();
  if(state.place)setLocUI(state.place);
  if(state.data)render();
}

function wire(){
  wireV2();
  $('#locBtn').addEventListener('click',openPicker);
  $('#close').addEventListener('click',closePicker);
  $('#ov').addEventListener('click',e=>{if(e.target.id==='ov')closePicker()});
  $('#q').addEventListener('input',e=>{
    selected=null;$('#confirm').classList.remove('show');
    clearTimeout(tmr);const v=e.target.value.trim();
    if(!v){renderList(defaultList(),'');return}
    tmr=setTimeout(()=>search(v),250);
  });
  $('#q').addEventListener('keydown',e=>{
    const opts=[...document.querySelectorAll('.opt')];
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!opts.length)return;
      active=(active+(e.key==='ArrowDown'?1:-1)+opts.length)%opts.length;
      opts.forEach((o,i)=>o.classList.toggle('act',i===active));opts[active].scrollIntoView({block:'nearest'})}
    if(e.key==='Enter'){e.preventDefault();if(selected)return confirmSel();if(opts.length)choose(active>=0?+opts[active].dataset.i:+opts[0].dataset.i)}
    if(e.key==='Escape')closePicker();
  });
  $('#list').addEventListener('click',e=>{const b=e.target.closest('.opt');if(b)choose(+b.dataset.i)});
  $('#ok').addEventListener('click',confirmSel);
  $('#back').addEventListener('click',()=>{selected=null;$('#confirm').classList.remove('show');document.querySelectorAll('.opt').forEach(o=>o.classList.remove('sel'));$('#q').focus()});
  $('#geo').addEventListener('click',async()=>{
    const b=$('#geo');b.disabled=true;b.textContent=t('detecting');
    try{
      const c=await getPos();const name=await reverseName(c.latitude,c.longitude);
      selected={name,lat:+c.latitude.toFixed(2),lon:+c.longitude.toFixed(2),sub:t('detectedSub')};
      results=[selected];renderList(results,'x');choose(0);
    }catch(e){$('#list').innerHTML=`<div class="hint">${geoErrText(e)}</div>`}
    finally{b.disabled=false;b.textContent=t('detectBtn')}
  });
  $('#gear').addEventListener('click',openSettings);
  $('#closeS').addEventListener('click',closeSettings);
  $('#ovS').addEventListener('click',e=>{if(e.target.id==='ovS')closeSettings()});
  $('#selLang').addEventListener('change',e=>{store('mm_lang',e.target.value);rerenderAll();openSettings();alertsSync()});
  $('#selUnits').addEventListener('change',e=>{store('mm_units',e.target.value);rerenderAll();openSettings();alertsSync()});
  $('#alertsTgl').addEventListener('change',async e=>{
    const tg=e.target;tg.disabled=true;
    if(tg.checked){
      alertsMsg(t('aWorking'));
      const ok=await alertsEnable();tg.checked=ok;
      if(ok){$('#alertsTest').hidden=false;await sendTest(true)}
    }else{const ok=await alertsDisable();alertsMsg(t(ok?'aOff':'aOffPending'))}
    tg.disabled=false;
  });
  $('#alertsTest').addEventListener('click',()=>sendTest(false));
  $('#doneS').addEventListener('click',closeSettings);
}

// ===== הפעלה =====
async function init(){
  applyPrefs();applyStatic();wire();setTimeout(()=>alertsPending().then(alertsHeal),3000);
  const saved=load('mm_place');
  if(saved){
    go(saved);
    try{
      const st=navigator.permissions&&await navigator.permissions.query({name:'geolocation'});
      if(st&&st.state==='granted'){
        const c=await getPos(8000);
        if(km(c.latitude,c.longitude,saved.lat,saved.lon)>8){
          const name=await reverseName(c.latitude,c.longitude);
          showBanner(`<div class="txt">${t('movedQ',{p:esc(name)})}</div><button class="btn" id="bNo">${t('stay')}</button><button class="btn pri" id="bYes">${t('switchYes')}</button>`);
          $('#bYes').onclick=()=>{hideBanner();go({name,lat:+c.latitude.toFixed(2),lon:+c.longitude.toFixed(2),auto:true})};
          $('#bNo').onclick=hideBanner;
        }
      }
    }catch(e){}
    return;
  }
  $('#locName').textContent=t('locating');
  $('#app').innerHTML=`<div class="loading"><div class="spin"></div>${t('locating')}</div>`;
  try{
    const c=await getPos();
    const name=await reverseName(c.latitude,c.longitude);
    go({name,lat:+c.latitude.toFixed(2),lon:+c.longitude.toFixed(2),auto:true});
    showBanner(`<div class="txt">${t('detectedQ',{p:esc(name)})}</div><button class="btn" id="bChg">${t('otherPlace')}</button><button class="btn pri" id="bOk">${t('yesBtn')}</button>`);
    $('#bOk').onclick=hideBanner;$('#bChg').onclick=()=>{hideBanner();openPicker()};
  }catch(e){
    setLocUI(null);
    $('#app').innerHTML=`<div class="card" style="text-align:center"><div style="font-size:34px">📍</div><b>${t('cantLocate')}</b><p class="sub" style="margin:6px 0 12px">${e&&e.code===1?t('permShort'):t('geoNA')} ${t('pickFromList')}</p><button class="btn pri" id="pick">${t('pickTitle')}</button></div>`;
    $('#pick').onclick=openPicker;
  }
}
if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('sw.js').catch(()=>{})}
init();

