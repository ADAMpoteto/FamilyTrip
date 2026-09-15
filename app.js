/* =====================================================================
   データソース（Googleスプレッドシートの公開CSV）
   ・旅のしおり : 旅行日 / 旅行タイトル / 何日目 / 出発時刻 / 訪問先名 / メモ
   ・ヒストリー : 日付 / 内容
   ===================================================================== */
const URL_SHIORI  = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRo5stnTOsjo7t3y-IsCX96ryADJWD0Es6eqRRyYlS99QgWqtLGRMGMCywYysxk47Q-q3nUqW0lea9A/pub?gid=0&single=true&output=csv";
const URL_HISTORY = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRo5stnTOsjo7t3y-IsCX96ryADJWD0Es6eqRRyYlS99QgWqtLGRMGMCywYysxk47Q-q3nUqW0lea9A/pub?gid=566552673&single=true&output=csv";

/* ---------- ユーティリティ ---------- */
const WD=["日","月","火","水","木","金","土"];
function pd(s){ if(!s) return null; const m=String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m?new Date(+m[1], +m[2]-1, +m[3]):null; }
function addDays(dt,n){ const d=new Date(dt.getTime()); d.setDate(d.getDate()+n); return d; }
function fmtMD(dt){ return `${dt.getMonth()+1}/${dt.getDate()}(${WD[dt.getDay()]})`; }
function daysUntil(dt){ const t=new Date(); t.setHours(0,0,0,0); return Math.round((dt-t)/86400000); }
function mapLink(q){ return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q||"")}`; }
function prefersReduced(){ return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
function escHtml(s){ return String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function F(o,k){ return (o && o[k]!=null) ? String(o[k]).trim() : ""; }
function cleanRows(rows){
  return (rows||[]).map(o=>{ const n={}; Object.keys(o).forEach(k=>{ n[k.replace(/^\uFEFF/,"").trim()]=o[k]; }); return n; });
}
function fetchCSV(url){
  return new Promise((resolve,reject)=>{
    if(typeof Papa==="undefined"){ reject(new Error("PapaParse 未読み込み")); return; }
    Papa.parse(url, { download:true, header:true, skipEmptyLines:"greedy", complete:resolve, error:reject });
  });
}
function countdownHtml(dt){
  if(!dt) return "";
  const du=daysUntil(dt);
  if(du>0) return `出発まで <strong>${du}</strong> 日`;
  if(du===0) return "<strong>本日出発！</strong>";
  return `<strong>${Math.abs(du)}</strong> 日前の予定でした`;
}

/* ---------- ルーティング（戻る/進む・直リンク対応） ---------- */
const NAV_OF={ shiori:"shiori", history:"history" };
function applyPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const el=document.getElementById(page); if(!el) return;
  el.classList.add("active");
  const nav=NAV_OF[page]||page;
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.nav===nav));
  window.scrollTo(0,0);
}
function goto(page, push){
  if(push===undefined) push=true;
  applyPage(page);
  if(push){ const h="#"+page; if(location.hash!==h) history.pushState({page}, "", h); }
}
function parseHash(){ const h=(location.hash||"").replace(/^#/,""); return {page:h||"shiori"}; }
window.addEventListener("popstate", e=>{ const st=e.state||parseHash(); applyPage(st.page||"shiori"); });
window.addEventListener("scroll", ()=>{ document.querySelector("nav").classList.toggle("scrolled", window.scrollY>4); }, {passive:true});

/* ---------- 旅のしおり ---------- */
let TRIPS=[], currentTripKey=null, currentDay=0;

function buildTrips(rows){
  const map={};
  rows.forEach(o=>{
    const dateRaw=F(o,"旅行日");
    const title=F(o,"旅行タイトル");
    if(!dateRaw && !title) return;            // 空行はスキップ
    const key=dateRaw+"\u0001"+title;
    if(!map[key]) map[key]={ key, dateRaw, title, dateObj:pd(dateRaw), days:{} };
    const dnum=Number(F(o,"何日目"))||1;
    (map[key].days[dnum]=map[key].days[dnum]||[]).push({
      dep:F(o,"出発時刻"), name:F(o,"訪問先名"), note:F(o,"メモ")
    });
  });
  const list=Object.values(map);
  list.forEach(t=>{
    t.dayList=Object.keys(t.days).map(Number).sort((a,b)=>a-b).map(n=>({ day:n, items:t.days[n] }));
    t.stops=t.dayList.reduce((s,d)=>s+d.items.length, 0);
  });
  list.sort((a,b)=>{
    if(!a.dateObj && !b.dateObj) return 0;
    if(!a.dateObj) return 1;
    if(!b.dateObj) return -1;
    return a.dateObj-b.dateObj;
  });
  return list;
}
function pickDefaultTrip(list){
  const t=new Date(); t.setHours(0,0,0,0);
  let idx=list.findIndex(x=>x.dateObj && x.dateObj>=t);   // 直近の未来の旅行
  if(idx<0) idx=list.length-1;                             // 全て過去なら最後
  return idx<0?0:idx;
}

/* 年 → その年の予定、の2段階セレクトでプルダウンの肥大化を防ぐ */
let YEAR_GROUPS={}, YEAR_ORDER=[];
function yearLabelOf(t){ return t.dateObj ? `${t.dateObj.getFullYear()}年` : "日付未定"; }
function buildYearGroups(list){
  YEAR_GROUPS={}; YEAR_ORDER=[];
  list.forEach((t,i)=>{
    const label=yearLabelOf(t);
    if(!YEAR_GROUPS[label]){ YEAR_GROUPS[label]=[]; YEAR_ORDER.push(label); }
    YEAR_GROUPS[label].push(i);
  });
}
function populateYearSelect(defaultLabel){
  const ySel=document.getElementById("trip-year-sel");
  ySel.innerHTML=YEAR_ORDER.map(label=>`<option value="${escHtml(label)}">${escHtml(label)}</option>`).join("");
  ySel.value=defaultLabel;
}
function populateTripSelect(yearLabel, defaultGlobalIdx){
  const tSel=document.getElementById("trip-sel");
  const idxs=YEAR_GROUPS[yearLabel]||[];
  tSel.innerHTML=idxs.map(i=>{
    const t=TRIPS[i];
    return `<option value="${i}">${escHtml((t.dateRaw?t.dateRaw+" ":"")+(t.title||"（無題の旅）"))}</option>`;
  }).join("");
  if(defaultGlobalIdx!=null) tSel.value=String(defaultGlobalIdx);
}

async function loadShiori(){
  let rows;
  try{ const r=await fetchCSV(URL_SHIORI); rows=cleanRows(r.data); }
  catch(e){
    document.getElementById("sch-body").innerHTML='<div class="loading">読み込みに失敗しました。ネットワーク環境をご確認ください。</div>';
    document.getElementById("trip-sel").innerHTML='<option>読み込み失敗</option>';
    return;
  }
  TRIPS=buildTrips(rows);
  const ySel=document.getElementById("trip-year-sel");
  const tSel=document.getElementById("trip-sel");
  if(!TRIPS.length){
    ySel.innerHTML='<option>データがありません</option>';
    tSel.innerHTML='<option>データがありません</option>';
    document.getElementById("sh-hero").innerHTML="";
    document.getElementById("sh-stats").innerHTML="";
    document.getElementById("sch-tabs").innerHTML="";
    document.getElementById("sch-body").innerHTML='<div class="loading">スケジュールがありません</div>';
    return;
  }
  buildYearGroups(TRIPS);
  const di=pickDefaultTrip(TRIPS);
  const defaultLabel=yearLabelOf(TRIPS[di]);
  populateYearSelect(defaultLabel);
  populateTripSelect(defaultLabel, di);
  renderShiori(di);

  ySel.onchange=()=>{
    const label=ySel.value;
    const firstIdx=(YEAR_GROUPS[label]||[])[0];
    populateTripSelect(label, firstIdx);
    if(firstIdx!=null) renderShiori(firstIdx);
  };
  tSel.onchange=()=>renderShiori(Number(tSel.value));
}

function renderShiori(idx){
  const t=TRIPS[idx]; if(!t) return;
  if(t.key!==currentTripKey){ currentTripKey=t.key; currentDay=0; }

  const cd=countdownHtml(t.dateObj);
  document.getElementById("sh-hero").innerHTML=`
    <div class="hero-eyebrow">旅のしおり</div>
    <div class="hero-title">${escHtml(t.title||"（無題の旅）")}</div>
    <div class="hero-meta">${t.dateRaw?`<span class="hero-chip">${escHtml(t.dateRaw)}</span>`:""}${cd?`<span class="hero-chip accent">${cd}</span>`:""}</div>`;

  document.getElementById("sh-stats").innerHTML=`
    <div class="stat-chip">日程 <strong>${t.dayList.length} 日間</strong></div>
    <div class="stat-chip">訪問予定 <strong>${t.stops} 件</strong></div>`;

  renderSchedule(t);
}

function schItemHtml(s){
  const time=escHtml(s.dep||"");
  const place=s.name?`<div class="sch-place"><a class="maplink" href="${mapLink(s.name)}" target="_blank">地図で見る ↗</a></div>`:"";
  const note=s.note?`<div class="sch-note">${escHtml(s.note)}</div>`:"";
  return `<div class="sch-item">
      <div class="sch-time">${time}</div>
      <div class="sch-body">
        <div class="sch-head"><span class="sch-title">${escHtml(s.name||"（未設定）")}</span></div>
        ${place}${note}
      </div>
    </div>`;
}
function renderSchedule(t){
  const days=t.dayList;
  if(currentDay>days.length-1) currentDay=0;
  document.getElementById("sch-tabs").innerHTML=days.map((d,i)=>{
    const sub=t.dateObj?`<span class="tab-sub">${fmtMD(addDays(t.dateObj, d.day-1))}</span>`:"";
    return `<button class="day-tab${i===currentDay?" active":""}" onclick="selectDay(${i})">${d.day}日目${sub}</button>`;
  }).join("");
  const d=days[currentDay];
  document.getElementById("sch-body").innerHTML=d?`<div class="sch-list">${d.items.map(schItemHtml).join("")}</div>`:'<div class="loading">予定がありません</div>';
}
function selectDay(i){
  currentDay=i;
  const t=TRIPS.find(x=>x.key===currentTripKey);
  if(t) renderSchedule(t);
  const a=document.getElementById("sch-anchor");
  if(a){ const nav=document.querySelector("nav"); const y=window.scrollY+a.getBoundingClientRect().top-(nav?nav.offsetHeight:0)-8; window.scrollTo({top:Math.max(0,y), behavior:prefersReduced()?"auto":"smooth"}); }
}

/* ---------- ヒストリー ---------- */
async function loadHistory(){
  let rows;
  try{ const r=await fetchCSV(URL_HISTORY); rows=cleanRows(r.data); }
  catch(e){
    document.getElementById("hist-list").innerHTML='<div class="loading">読み込みに失敗しました。ネットワーク環境をご確認ください。</div>';
    return;
  }
  const items=rows.map(o=>({ dateRaw:F(o,"日付"), dateObj:pd(F(o,"日付")), content:F(o,"内容") }))
                  .filter(x=>x.dateRaw || x.content);

  // 古い順（昇順）にソート
  items.sort((a,b)=>{
    if(!a.dateObj && !b.dateObj) return 0;
    if(!a.dateObj) return 1;
    if(!b.dateObj) return -1;
    return a.dateObj-b.dateObj;                 // 古い順
  });

  const body=document.getElementById("hist-list");
  if(!items.length){ body.innerHTML='<div class="loading">まだ記録がありません</div>'; return; }

  body.innerHTML='<div class="hist-timeline">'+items.map(it=>`
    <div class="hist-item">
      <div class="hist-date">${escHtml(it.dateRaw||"")}</div>
      <div class="hist-content">${escHtml(it.content||"")}</div>
    </div>`).join("")+'</div>';
}

/* ---------- 初期化 ---------- */
loadShiori();
loadHistory();
(function initRouting(){
  const st=parseHash();
  history.replaceState({page:st.page}, "", location.hash||"#shiori");
  applyPage(st.page);
})();
