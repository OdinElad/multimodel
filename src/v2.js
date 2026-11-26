// ===== v2 (Tahazit): model choice, weekly storm outlook, dynamic sky, update banner =====
const APP_VER='2.0.6';
const APP_BUILD='__BUILD__'; // replaced by build.py with the build date (UTC)
// Android app version, passed by the launcher as ?apk=... (kept for this session, then removed from the address bar).
const APK_VER=(()=>{try{const q=new URLSearchParams(location.search),v=q.get('apk');
  if(v&&/^[\w.\- ()]{1,40}$/.test(v)){sessionStorage.setItem('mm_apk',v);q.delete('apk');
    history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);return v}
  return sessionStorage.getItem('mm_apk')}catch(e){return null}})();
function aboutHTML(){
  return `<b>${t('about')}</b>
    <div>${t('appName')} · ${t('verWeb')} <span dir="ltr">${APP_VER}</span> · ${t('buildDate')} <span dir="ltr">${APP_BUILD}</span></div>
    ${APK_VER?`<div>${t('verApk')} <span dir="ltr">${esc(APK_VER)}</span></div>`:''}
    <div>${t('builtBy')}</div>
    <div><a class="pp" href="https://github.com/OdinElad/multimodel" target="_blank" rel="noopener">${t('srcCode')}</a> · <a class="pp" href="privacy.html">${t('privacy')}</a></div>`;
}

// --- Which models are shown. Default: all of them. The model closest to the consensus is only marked, not preferred. ---
const MSEL='mm_models';
function activeIds(){
  const u=load(MSEL);
  if(Array.isArray(u)){const v=u.filter(id=>MODELS.some(m=>m.id===id));if(v.length)return v}
  return MODELS.map(m=>m.id);
}
const bestId=()=>state.skill&&state.skill.list&&state.skill.list[0]?state.skill.list[0].id:null;
function openModels(){
  const s=state.skill,act=activeIds();
  const ranked=s?s.list.map(x=>x.id):[];
  const order=ranked.concat(MODELS.map(m=>m.id).filter(id=>!ranked.includes(id)));
  const best=s?s.list[0].mae:null;
  $('#mSub').textContent=s?t('mSub',{d:s.days}):t('mSubNA');
  $('#mList').innerHTML=order.map((id,i)=>{
    const m=MODELS.find(x=>x.id===id),sk=s&&s.list.find(x=>x.id===id);
    const tag=sk&&i===0?`<span class="pill hi">${t('mBest')}</span>`:
      sk&&(i===1||sk.mae<=best*1.25)?`<span class="pill md">${t('mRec')}</span>`:'';
    return `<label class="mrow"><input type="checkbox" data-id="${id}" ${act.includes(id)?'checked':''}>
      <span class="dot" style="background:${m.color}"></span>
      <span class="mn"><b>${m.flag} ${m.name}</b><small>${m.org}${sk?` · <span dir="ltr">±${fDiff(sk.mae)}</span>`:''}</small></span>${tag}</label>`;
  }).join('');
  $('#ovM').classList.add('show');
}
function closeModels(){$('#ovM').classList.remove('show')}
function modelsChanged(e){
  const boxes=[...document.querySelectorAll('#mList input')];
  const ids=boxes.filter(b=>b.checked).map(b=>b.dataset.id);
  if(!ids.length){e.target.checked=true;return}
  store(MSEL,ids);if(state.data)render();
}

// --- Weekly storm outlook across all models ---
let stP=null,stMode='all',stSel=null;
function openStorm(PA){stP=PA;stSel=null;drawStorm();$('#ovW').classList.add('show')}
function closeStorm(){$('#ovW').classList.remove('show')}
function hz(x){
  if(!x)return null;const r=x.rain??0;
  return {th:(x.code>=95)||(x.cape!=null&&x.cape>=1000&&r>=1),heavy:r>=20,wind:(x.gust??0)>=60,rain:r>=1};
}
function stCell(x){
  const h=hz(x);if(!h)return ['na','·'];
  if(stMode==='all'){
    if(h.th)return ['th','⛈️'];if(h.heavy)return ['hv','🌊'];if(h.wind)return ['wd','💨'];if(h.rain)return ['rn','🌧️'];return ['ok',''];
  }
  if(stMode==='thunder'){const c=x.cape??0;return [h.th?'th':c>=500?'rn':'ok',x.code>=95?'⚡':c>=100?Math.round(c/100)*100:'']}
  if(stMode==='rain'){const r=x.rain??0;return [r>=20?'hv':r>=1?'rn':'ok',r>=0.1?nR(r):'']}
  const g=x.gust??0;return [g>=60?'wd':g>=40?'rn':'ok',Math.round(cW(g))];
}
function stHit(x){const h=hz(x);if(!h)return false;
  return stMode==='all'?(h.th||h.heavy||h.wind):stMode==='thunder'?h.th:stMode==='rain'?h.rain:h.wind}
function drawStorm(){
  const P=stP;if(!P)return;
  const days=P.days,ms=P.models;
  const get=(d,m)=>d.per.find(p=>p.m.id===m.id);
  const unit=stMode==='rain'?` (${rU()})`:stMode==='wind'?` (${wU()})`:stMode==='thunder'?' (CAPE)':'';
  let h=`<div class="tabs st-tabs">${['all','thunder','rain','wind'].map(k=>`<button class="tab ${stMode===k?'on':''}" data-st="${k}">${t({all:'stAll',thunder:'stThunder',rain:'stRain',wind:'stWind'}[k])}</button>`).join('')}</div>`;
  h+=`<div class="tbl-wrap"><table class="stg"><tr><th class="l">${unit}</th>${days.map((d,i)=>`<th>${esc(dayShort(d.date,i))}<br><small>${dmy(d.date)}</small></th>`).join('')}</tr>`;
  ms.forEach(m=>{
    h+=`<tr><td class="l"><span class="dot" style="background:${m.color}"></span> ${m.short||m.name}</td>${days.map((d,di)=>{
      const x=get(d,m),c=stCell(x),sel=stSel&&stSel[0]===m.id&&stSel[1]===di;
      return `<td class="sc ${c[0]}${sel?' sel':''}" data-m="${m.id}" data-d="${di}">${c[1]}</td>`}).join('')}</tr>`;
  });
  h+=`<tr class="cons"><td class="l">${t('stAgree')}</td>${days.map(d=>{const k=ms.filter(m=>stHit(get(d,m))).length;
    const n=stMode==='rain'?d.nRain:stMode==='wind'?d.nWind:stMode==='thunder'?d.nThunder:d.n; // models that have a value for this hazard
    const need=needFor(n);return `<td class="${k>=need?'agr-hi':k?'agr-md':''}">${n?k+'/'+n:'·'}</td>`}).join('')}</tr></table></div>`;
  let det='';
  if(stSel){const m=MODELS.find(x=>x.id===stSel[0]),d=days[stSel[1]],x=d&&get(d,m);
    det=x?t('stDet',{m:m.name,d:dayLabel(d.date,stSel[1]),x:fT1(x.max),n:fT1(x.min),r:fR(x.rain??0),g:fW(x.gust??0),c:x.cape!=null?Math.round(x.cape):'·'})+` ${wc(x.code??0).join(' ')}`:t('stNoData')}
  h+=`<div class="stdet"${det?'':' hidden'}>${det}</div>`;
  h+=`<div class="legend st-leg"><span><i class="sw th"></i>${t('stThunder')}</span><span><i class="sw hv"></i>${t('stHeavy')}</span><span><i class="sw wd"></i>${t('stWind')}</span><span><i class="sw rn"></i>${t('stRain')}</span><span><i class="sw ok"></i>${t('stCalm')}</span></div>`;
  $('#stBody').innerHTML=h;
  document.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{stMode=b.dataset.st;drawStorm()});
  document.querySelectorAll('.stg .sc').forEach(c=>c.onclick=()=>{stSel=[c.dataset.m,+c.dataset.d];drawStorm()});
}

// --- Dynamic sky: changes with the time of day and the weather ---
const reduceMotion=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function sky(P){
  const el=$('#sky');if(!el||!P||!P.models.length)return;
  const H=P.H,ni=P.ni,D=P.D||{};
  const codes=P.models.map(m=>pick(H,'weather_code',m.id)?.[ni]).filter(c=>c!=null).sort((a,b)=>a-b);
  const code=codes.length?codes[Math.floor(codes.length/2)]:0;
  const off=(state.data&&state.data.utc_offset_seconds)||0;
  const now=new Date(Date.now()+off*1000).toISOString().slice(0,16);
  const di=Math.max(0,(D.time||[]).indexOf(now.slice(0,10)));
  let sr=null,ss=null;
  for(const m of MODELS){const a=pick(D,'sunrise',m.id),b=pick(D,'sunset',m.id);if(a&&a[di]&&b&&b[di]){sr=a[di];ss=b[di];break}}
  const mins=s=>+s.slice(11,13)*60+ +s.slice(14,16);
  const n=mins(now),r=sr?mins(sr):6*60,s=ss?mins(ss):18*60;
  const phase=n<r-40||n>s+40?'night':Math.abs(n-r)<=40?'dawn':Math.abs(n-s)<=40?'dusk':'day';
  const wx=code>=95?'storm':(code>=71&&code<=77)||code===85||code===86?'snow':(code>=51&&code<=67)||(code>=80&&code<=82)?'rain':
    code===45||code===48?'fog':code===3?'cloudy':code>=1?'partly':'clear';
  el.className=`sky ${phase} wx-${wx}`;
  if(!el.dataset.ready){
    el.dataset.ready=1;
    let st='';for(let i=0;i<90;i++)st+=`${(Math.random()*100).toFixed(1)}vw ${(Math.random()*70).toFixed(1)}vh 0 ${Math.random()<.15?1:0}px #fff${Math.random()<.5?'c':'8'},`;
    el.querySelector('.stars').style.boxShadow=st.slice(0,-1);
  }
  particles(wx==='rain'?'rain':wx==='storm'?'storm':wx==='snow'?'snow':null);
}
let pRAF=0,pKind=null;
function particles(kind){
  const cv=$('#wxc');if(!cv)return;
  if(reduceMotion())kind=null;
  if(kind===pKind)return;pKind=kind;cancelAnimationFrame(pRAF);
  const ctx=cv.getContext('2d');
  const fit=()=>{cv.width=innerWidth;cv.height=innerHeight};fit();onresize=fit;
  ctx.clearRect(0,0,cv.width,cv.height);
  if(!kind)return;
  const N=kind==='storm'?170:kind==='rain'?90:70;
  const ps=Array.from({length:N},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,v:kind==='snow'?0.6+Math.random()*1.2:9+Math.random()*7,l:10+Math.random()*12,w:Math.random()*6}));
  const step=()=>{
    pRAF=requestAnimationFrame(step);
    if(document.hidden)return;
    ctx.clearRect(0,0,cv.width,cv.height);
    if(kind==='snow'){ctx.fillStyle='rgba(255,255,255,.85)';
      for(const p of ps){p.y+=p.v;p.w+=.02;p.x+=Math.sin(p.w)*.6;if(p.y>cv.height){p.y=-5;p.x=Math.random()*cv.width}
        ctx.beginPath();ctx.arc(p.x,p.y,1.6+p.v*.6,0,6.283);ctx.fill()}}
    else{ctx.strokeStyle='rgba(174,214,255,.45)';ctx.lineWidth=1.2;ctx.beginPath();
      for(const p of ps){p.y+=p.v;p.x-=p.v*.18;if(p.y>cv.height){p.y=-p.l;p.x=Math.random()*(cv.width+100)}
        ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+p.l*.18,p.y-p.l)}ctx.stroke()}
  };
  step();
}

// --- "New version" banner, checked when the app comes back to the foreground ---
let updAt=0;
async function checkUpdate(){
  if(!/^https?:/.test(location.protocol)||Date.now()-updAt<10*60e3||$('#upd'))return;updAt=Date.now();
  try{const r=await fetch('index.html?v='+Date.now(),{cache:'no-store'});if(!r.ok)return;const x=await r.text();
    const m=x.match(/APP_VER='([^']+)'/);if(m&&m[1]!==APP_VER)showUpd()}catch(e){}
}
function showUpd(){
  const d=document.createElement('div');d.id='upd';d.className='upd';
  d.innerHTML=`<span>${t('updReady')}</span><button class="btn pri">${t('updBtn')}</button>`;
  d.querySelector('button').onclick=()=>location.reload();document.body.appendChild(d);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate()});

function wireV2(){
  $('#closeM').onclick=closeModels;$('#ovM').addEventListener('click',e=>{if(e.target.id==='ovM')closeModels()});
  $('#mList').addEventListener('change',modelsChanged);
  $('#mReset').onclick=()=>{const b=bestId();store(MSEL,b?[b]:null);closeModels();if(state.data)render()};
  $('#mAll').onclick=()=>{store(MSEL,null);closeModels();if(state.data)render()};
  $('#closeW').onclick=closeStorm;$('#ovW').addEventListener('click',e=>{if(e.target.id==='ovW')closeStorm()});
}
