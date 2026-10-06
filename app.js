/* =====================================================================
   データソース（Googleスプレッドシートの公開CSV）
   ・旅のしおり : 旅行日 / 旅行タイトル / 何日目 / 出発時刻 / 訪問先名 / メモ
   ・ヒストリー : 日付 / 内容
   ===================================================================== */
const URL_SHIORI  = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRo5stnTOsjo7t3y-IsCX96ryADJWD0Es6eqRRyYlS99QgWqtLGRMGMCywYysxk47Q-q3nUqW0lea9A/pub?gid=0&single=true&output=csv";
const URL_HISTORY = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRo5stnTOsjo7t3y-IsCX96ryADJWD0Es6eqRRyYlS99QgWqtLGRMGMCywYysxk47Q-q3nUqW0lea9A/pub?gid=566552673&single=true&output=csv";
const URL_CLEANING = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRo5stnTOsjo7t3y-IsCX96ryADJWD0Es6eqRRyYlS99QgWqtLGRMGMCywYysxk47Q-q3nUqW0lea9A/pub?gid=649917247&single=true&output=csv";
const URL_KAJI = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRo5stnTOsjo7t3y-IsCX96ryADJWD0Es6eqRRyYlS99QgWqtLGRMGMCywYysxk47Q-q3nUqW0lea9A/pub?gid=918542610&single=true&output=csv";

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
/* ヘッダーなしの行列としてCSVを取得（掃除当番のサマリー表のように結合セルを含む表用） */
function fetchCSVRaw(url){
  return new Promise((resolve,reject)=>{
    if(typeof Papa==="undefined"){ reject(new Error("PapaParse 未読み込み")); return; }
    Papa.parse(url, { download:true, header:false, skipEmptyLines:false, complete:resolve, error:reject });
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
const NAV_OF={ shiori:"shiori", history:"history", cleaning:"cleaning", kaji:"kaji", keiken:"keiken" };
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
    document.getElementById("trip-year-sel").innerHTML='<option>読み込み失敗</option>';
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

/* ---------- 掃除当番（サマリー部分のみ） ---------- */
async function loadCleaning(){
  const box=document.getElementById("clean-grid");
  let rows;
  try{ const r=await fetchCSVRaw(URL_CLEANING); rows=r.data; }
  catch(e){
    box.innerHTML='<div class="loading">読み込みに失敗しました。ネットワーク環境をご確認ください。</div>';
    return;
  }
  // サマリー表の行構成: 0=場所 1=担当者 2=頻度 3=実施回数 4=実施忘れ回数 5=最終実施日
  // 各行とも列0〜3はラベル用（結合セル）で、実データは列4以降に場所ごとに並ぶ
  const DATA_START_COL=4;
  const get=(r,c)=>(rows[r] && rows[r][c]!=null) ? String(rows[r][c]).trim() : "";

  const cols=[];
  for(let c=DATA_START_COL; get(0,c); c++) cols.push(c);

  if(!cols.length){ box.innerHTML='<div class="loading">データがありません</div>'; return; }

  const items=cols.map(c=>({
    name:get(0,c), person:get(1,c), freq:get(2,c),
    done:get(3,c), missed:get(4,c), last:get(5,c)
  }));

  box.innerHTML=items.map(it=>{
    const doneN=Number(it.done)||0, missedN=Number(it.missed)||0;
    return `
    <div class="clean-card">
      <div class="clean-card-title">${escHtml(it.name)}</div>
      <div class="clean-card-row"><span>担当</span><strong>${escHtml(it.person||"－")}</strong></div>
      <div class="clean-card-row"><span>頻度</span><strong>${escHtml(it.freq||"－")}</strong></div>
      <div class="clean-card-row"><span>実施済み</span><strong class="badge${doneN===0?" zero":""}">${doneN}回</strong></div>
      <div class="clean-card-row"><span>実施忘れ</span><strong class="badge${missedN===0?" zero":""}">${missedN}回</strong></div>
      <div class="clean-card-row"><span>最終実施</span><strong>${escHtml(it.last||"未実施")}</strong></div>
    </div>`;
  }).join("");
}

/* ---------- 家事当番（買い物・料理・ゴミ出し・洗濯・家計簿） ---------- */
async function loadKaji(){
  const box=document.getElementById("kaji-grid");
  let rows;
  try{ const r=await fetchCSV(URL_KAJI); rows=cleanRows(r.data); }
  catch(e){
    box.innerHTML='<div class="loading">読み込みに失敗しました。ネットワーク環境をご確認ください。</div>';
    return;
  }
  if(!rows.length){ box.innerHTML='<div class="loading">データがありません</div>'; return; }

  // No・日付以外の列＝家事の種類。列の並び順はCSVの見出し順をそのまま使う
  const chores=Object.keys(rows[0]).filter(k=>k!=="No" && k!=="日付");
  // "両方"のように複数人を表す語は、集計時に該当する全員へカウントする
  const MULTI_WORDS=["両方","全員"];
  const people=new Set();
  rows.forEach(r=>chores.forEach(c=>{
    const v=F(r,c);
    if(v && !MULTI_WORDS.includes(v)) people.add(v);
  }));

  const cards=chores.map(chore=>{
    const personCount={}, personLast={};
    people.forEach(p=>{ personCount[p]=0; personLast[p]=""; });
    rows.forEach(r=>{
      const v=F(r,chore);
      if(!v) return;
      const dateRaw=F(r,"日付");
      const d=pd(dateRaw);
      const targets = MULTI_WORDS.includes(v) ? Array.from(people) : [v];
      targets.forEach(p=>{
        personCount[p]=(personCount[p]||0)+1;
        const pd2=pd(personLast[p]);
        if(d && (!pd2 || d>pd2)) personLast[p]=dateRaw;
      });
    });
    return { chore, personCount, personLast };
  });

  box.innerHTML=cards.map(c=>{
    const personRows=Object.keys(c.personCount).map(p=>{
      const cnt=c.personCount[p];
      const last=c.personLast[p];
      return `<div class="kaji-person">
        <span class="kaji-person-name">${escHtml(p)}</span>
        <span class="kaji-count-badge${cnt===0?" zero":""}">${cnt}回</span>
        <span class="kaji-last${last?"":" none"}">${escHtml(last||"未実施")}</span>
      </div>`;
    }).join("");
    return `<div class="kaji-card">
      <div class="kaji-card-title">${escHtml(c.chore)}</div>
      ${personRows}
    </div>`;
  }).join("");
}

/* ---------- 経県値マップ（全国・市区町村単位） ----------
   スプレッドシート列 : 団体コード / 都道府県名 / 市区町村名 / レベル / 日付 / メモ
   ・団体コード … 総務省「全国地方公共団体コード」の6桁（例 232017）。5桁でも可
   ・レベル     … 3：宿泊 / 2：訪問 / 1：通過（空欄＝未踏）。数字だけ・言葉だけでも可
   ・政令市の行（例: 名古屋市 231002）は、個別の記入がない配下の全区にまとめて反映
   地図データ : GEO_DIR に「{都道府県名}.geojson」「{都道府県名}_border.geojson」（国土数値情報 N03）
   ------------------------------------------------------------------------ */
const URL_KEIKEN = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRo5stnTOsjo7t3y-IsCX96ryADJWD0Es6eqRRyYlS99QgWqtLGRMGMCywYysxk47Q-q3nUqW0lea9A/pub?gid=612468389&single=true&output=csv";        // ← 経県値シートの公開CSV URL（他のURLと同じ「ウェブに公開→CSV」で取得）
const GEO_DIR = "geojson/";           // GeoJSON の置き場所。index.html と同じフォルダなら ""、geojson フォルダなら "geojson/"
const KK_PREF_DEFAULT = "兵庫県";   // 最初に表示する都道府県

/* 都道府県名と市区町村数（政令市は区単位。総務省 R6.1.1） */
const KK_PREFS=[["北海道",194],["青森県",40],["岩手県",33],["宮城県",39],["秋田県",25],["山形県",35],["福島県",59],["茨城県",44],["栃木県",25],["群馬県",35],["埼玉県",72],["千葉県",59],["東京都",62],["神奈川県",58],["新潟県",37],["富山県",15],["石川県",19],["福井県",17],["山梨県",27],["長野県",77],["岐阜県",42],["静岡県",39],["愛知県",69],["三重県",29],["滋賀県",19],["京都府",36],["大阪府",72],["兵庫県",49],["奈良県",39],["和歌山県",30],["鳥取県",19],["島根県",19],["岡山県",30],["広島県",30],["山口県",19],["徳島県",24],["香川県",17],["愛媛県",20],["高知県",34],["福岡県",72],["佐賀県",20],["長崎県",21],["熊本県",49],["大分県",18],["宮崎県",26],["鹿児島県",43],["沖縄県",41]];
const KK_REGIONS=[["北海道・東北",0,7],["関東",7,14],["中部",14,23],["近畿",23,30],["中国",30,35],["四国",35,39],["九州・沖縄",39,47]];
const KK_PREF_IDX={}; KK_PREFS.forEach((p,i)=>KK_PREF_IDX[p[0]]=i);
const kkPrefCode=pref=>String(KK_PREF_IDX[pref]+1).padStart(2,"0");
/* 政令市（5桁）→ 配下の区（5桁） */
const KK_WARDS=(o=>{ const m={}; Object.keys(o).forEach(k=>m[k]=o[k].split(" ")); return m; })({"01100":"01101 01102 01103 01104 01105 01106 01107 01108 01109 01110","04100":"04101 04102 04103 04104 04105","11100":"11101 11102 11103 11104 11105 11106 11107 11108 11109 11110","12100":"12101 12102 12103 12104 12105 12106","14100":"14101 14102 14103 14104 14105 14106 14107 14108 14109 14110 14111 14112 14113 14114 14115 14116 14117 14118","14130":"14131 14132 14133 14134 14135 14136 14137","14150":"14151 14152 14153","15100":"15101 15102 15103 15104 15105 15106 15107 15108","22100":"22101 22102 22103","22130":"22138 22139 22140","23100":"23101 23102 23103 23104 23105 23106 23107 23108 23109 23110 23111 23112 23113 23114 23115 23116","26100":"26101 26102 26103 26104 26105 26106 26107 26108 26109 26110 26111","27100":"27102 27103 27104 27106 27107 27108 27109 27111 27113 27114 27115 27116 27117 27118 27119 27120 27121 27122 27123 27124 27125 27126 27127 27128","27140":"27141 27142 27143 27144 27145 27146 27147","28100":"28101 28102 28105 28106 28107 28108 28109 28110 28111","33100":"33101 33102 33103 33104","34100":"34101 34102 34103 34104 34105 34106 34107 34108","40100":"40101 40103 40105 40106 40107 40108 40109","40130":"40131 40132 40133 40134 40135 40136 40137","43100":"43101 43102 43103 43104 43105"});

/* レベル（3段階）。遠くからでも見分けやすいよう色の種類を変え、暖かい色ほど深く関わった場所 */
const KK_LEVELS=[
  {lv:3, label:"宿泊", note:"1泊以上した",               color:"#d9453f", words:["宿泊","泊","住んだ","居住","住"]},
  {lv:2, label:"訪問", note:"観光や用事で歩き回った",     color:"#f2b632", words:["訪問","訪れ","観光","遊んだ","降り立った","降りた"]},
  {lv:1, label:"通過", note:"電車や車で通っただけ",       color:"#8ec5e8", words:["通過","乗り換え"]},
  {lv:0, label:"未踏", note:"行ったことがない",           color:"#ffffff", words:["未踏","なし"]}
];
KK_LEVELS.forEach(l=>l.tag=`${l.lv}：${l.label}`);
const KK_MAX=KK_LEVELS[0].lv;
const KK_BY_LV={}; KK_LEVELS.forEach(l=>KK_BY_LV[l.lv]=l);
const KK={ rows:[], note:"", pref:null, feats:[], byCode:{}, rec:{}, selected:null, filter:null,
           home:null, limit:null, minW:1, view:null, anim:0, geoCache:{}, token:0 };

const kkZen2Han=s=>String(s||"").replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
function kkNormName(s){ return String(s||"").replace(/[\s\u3000]/g,""); }
function kkParseLevel(v){
  const s=kkNormName(v);
  if(!s) return 0;
  const n=kkZen2Han(s);
  const m=n.match(/^(\d+)/);   // 「3」「3：泊まった」など先頭の数字を優先
  if(m) return Math.max(0, Math.min(KK_MAX, Number(m[1])));
  const hit=KK_LEVELS.find(l=>l.words.some(w=>s.includes(w)));
  return hit?hit.lv:0;
}
function kkCheckDigitOK(c6){
  const s=[6,5,4,3,2].reduce((a,w,i)=>a+Number(c6[i])*w,0);
  return Number(c6[5])===(11-s%11)%10;
}
/* シートの1行 → { code(5桁), pref, name, lv, memo, date } */
function kkNormRow(o){
  const raw=kkZen2Han(F(o,"団体コード")).replace(/\D/g,"");
  let pref=kkNormName(F(o,"都道府県名"));
  const name=kkNormName(F(o,"市区町村名"));
  if(KK_PREF_IDX[pref]==null) pref="";
  // 6桁は先頭5桁。5桁は「本来の5桁」か「先頭の0が消えた6桁（01〜09の道県）」のどちらか
  const cands = raw.length===6 ? [raw.slice(0,5)]
              : raw.length===5 ? (kkCheckDigitOK("0"+raw) ? [("0"+raw).slice(0,5), raw] : [raw, ("0"+raw).slice(0,5)])
              : [];
  let code="";
  if(pref){ code=cands.find(c=>c.startsWith(kkPrefCode(pref)))||""; }
  else if(cands.length){
    code=cands.find(c=>KK_PREFS[Number(c.slice(0,2))-1])||"";
    if(code) pref=KK_PREFS[Number(code.slice(0,2))-1][0];
  }
  if(!code && !name) return null;
  return { code, pref, name, lv:kkParseLevel(F(o,"レベル")||F(o,"状態")), memo:F(o,"メモ"), date:F(o,"日付") };
}

/* ある都道府県の記録を市区町村コードごとにまとめる。feats があれば名前だけの行も地図の形に結びつける */
function kkPrefRecords(pref, feats){
  const byCode={}, byName={}, parents=[];
  const nameIdx={}; (feats||[]).forEach(f=>{ if(f.real){ nameIdx[kkNormName(f.name)]=f.code; if(!f.ward) nameIdx[kkNormName(f.city)]=f.code; } });
  const put=(map,key,r)=>{
    const cur=map[key];
    if(!cur || r.lv>cur.lv) map[key]={lv:r.lv, memo:r.memo, date:r.date};
    else if(r.lv===cur.lv){ if(!cur.memo && r.memo) cur.memo=r.memo; if(!cur.date && r.date) cur.date=r.date; }
  };
  KK.rows.forEach(r=>{
    if(r.pref!==pref && !(r.pref==="" && feats)) return;
    if(r.code && KK_WARDS[r.code]){ parents.push(r); return; }
    if(r.code){ put(byCode, r.code, r); return; }
    if(feats){ const c=nameIdx[r.name]; if(c) put(byCode, c, r); }
    else put(byName, r.name, r);
  });
  // 政令市の行は、個別の記入がない区だけに反映（政令市の行が複数あれば高いほう）
  const fromParent={};
  parents.forEach(r=>KK_WARDS[r.code].forEach(w=>{ if(!byCode[w]) put(fromParent, w, r); }));
  Object.assign(byCode, fromParent);
  return { byCode, byName };
}

function fetchJSON(url){ return fetch(encodeURI(url)).then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }); }
function kkLoadGeo(pref){
  if(!KK.geoCache[pref]){
    KK.geoCache[pref]=Promise.all([
      fetchJSON(`${GEO_DIR}${pref}.geojson`),
      fetchJSON(`${GEO_DIR}${pref}_border.geojson`).catch(()=>null)
    ]).catch(e=>{ delete KK.geoCache[pref]; throw e; });
  }
  return KK.geoCache[pref];
}

async function loadKeiken(){
  // 都道府県セレクト
  const sel=document.getElementById("kk-pref-sel");
  sel.innerHTML=KK_REGIONS.map(([rg,a,b])=>`<optgroup label="${rg}">${
    KK_PREFS.slice(a,b).map(([p])=>`<option value="${p}">${p}</option>`).join("")}</optgroup>`).join("");
  sel.onchange=()=>kkShowPref(sel.value);
  document.querySelectorAll(".kk-ctrl button").forEach(b=>b.addEventListener("click", ()=>{
    if(!KK.home || !document.getElementById("kk-svg")) return;
    const z=b.dataset.z;
    if(z==="in") kkZoomBy(1.6); else if(z==="out") kkZoomBy(1/1.6); else kkZoomTo(KK.home.slice());
  }));

  if(!URL_KEIKEN){
    KK.note="スプレッドシートがまだつながっていません。app.js の URL_KEIKEN に経県値シートの公開CSVのURLを入れると、地図に色が付きます。";
  }else{
    try{
      // 1行目に説明書きがあっても大丈夫なよう、「団体コード」がある行を見出しとして探す
      const r=await fetchCSVRaw(URL_KEIKEN);
      const data=r.data||[];
      const hi=data.findIndex(row=>(row||[]).some(c=>String(c).replace(/^\uFEFF/,"").trim()==="団体コード"));
      if(hi<0) throw new Error("見出し行（団体コード）が見つかりません");
      const head=data[hi].map(c=>String(c).replace(/^\uFEFF/,"").trim());
      KK.rows=data.slice(hi+1).map(row=>{ const o={}; head.forEach((k,i)=>{ if(k) o[k]=(row||[])[i]; }); return o; })
                  .map(kkNormRow).filter(Boolean);
    }
    catch(e){ KK.note="経県値シートを読み込めませんでした。シートが「ウェブに公開」されているか、URLが正しいかを確認してください。"; }
  }
  kkRenderNation();
  kkShowPref(KK_PREF_IDX[KK_PREF_DEFAULT]!=null ? KK_PREF_DEFAULT : "東京都");
}

/* ---- 全国のまとめ（都道府県ごとの最高レベル＝本家の経県値） ---- */
function kkRenderNation(){
  let nationScore=0, prefVisited=0, muniVisited=0, muniTotal=0;
  const tiles=KK_PREFS.map(([pref,total])=>{
    const {byCode,byName}=kkPrefRecords(pref, null);
    const vals=Object.values(byCode).concat(Object.values(byName));
    const max=vals.reduce((m,v)=>Math.max(m,v.lv),0);
    const visited=Math.min(total, vals.filter(v=>v.lv>0).length);
    nationScore+=max; if(max>0) prefVisited++; muniVisited+=visited; muniTotal+=total;
    return { pref, total, max, visited };
  });
  document.getElementById("kk-nation-stats").innerHTML=`
    <div class="stat-chip">全国の経県値 <strong>${nationScore}</strong> / ${KK_PREFS.length*KK_MAX}点</div>
    <div class="stat-chip">足を運んだ都道府県 <strong>${prefVisited}</strong> / ${KK_PREFS.length}</div>
    <div class="stat-chip">市区町村 <strong>${muniVisited}</strong> / ${muniTotal}</div>`;
  const byPref={}; tiles.forEach(t=>byPref[t.pref]=t);
  document.getElementById("kk-nation").innerHTML=KK_REGIONS.map(([rg,a,b])=>`
    <div class="kk-region">
      <div class="kk-region-name">${rg}</div>
      <div class="kk-tiles">${KK_PREFS.slice(a,b).map(([p])=>{ const t=byPref[p];
        return `<button type="button" class="kk-tile${p===KK.pref?" active":""}" data-pref="${p}" aria-label="${p}：${KK_BY_LV[t.max].tag}、${t.visited}/${t.total}市区町村">
          <span class="kk-sw" style="background:${KK_BY_LV[t.max].color}"></span><span class="kk-tile-name">${p}</span><span class="kk-tile-n">${t.visited}/${t.total}</span>
        </button>`; }).join("")}</div>
    </div>`).join("");
  document.querySelectorAll(".kk-tile").forEach(b=>b.onclick=()=>{
    kkShowPref(b.dataset.pref);
    const a=document.getElementById("kk-pref-anchor"), nav=document.querySelector("nav");
    window.scrollTo({ top:Math.max(0, window.scrollY+a.getBoundingClientRect().top-(nav?nav.offsetHeight:0)-8), behavior:prefersReduced()?"auto":"smooth" });
  });
  const noteEl=document.getElementById("kk-note");
  noteEl.hidden=!KK.note; noteEl.textContent=KK.note||"";
}

/* ---- 都道府県を切り替え ---- */
async function kkShowPref(pref){
  const token=++KK.token;
  KK.pref=pref; KK.selected=null; KK.filter=null;
  document.getElementById("kk-pref-sel").value=pref;
  document.querySelectorAll(".kk-tile").forEach(t=>t.classList.toggle("active", t.dataset.pref===pref));
  document.getElementById("kk-info").innerHTML='<p class="kk-info-empty">地図の市区町村をタップすると、ここに記録が表示されます。</p>';
  const mapEl=document.getElementById("kk-map");
  mapEl.innerHTML='<div class="loading">読み込み中…</div>';
  let geo, border;
  try{ [geo, border]=await kkLoadGeo(pref); }
  catch(e){
    if(token!==KK.token) return;
    KK.feats=[]; KK.byCode={}; KK.rec={};
    mapEl.innerHTML=`<div class="loading">${escHtml(pref)}の地図データがありません。<br>「${escHtml(GEO_DIR+pref)}.geojson」を置き、Webサーバー経由（GitHub Pages など）で開いてください。</div>`;
    ["kk-stats","kk-legend","kk-list"].forEach(id=>document.getElementById(id).innerHTML="");
    return;
  }
  if(token!==KK.token) return;
  kkBuildMap(geo, border);
  KK.rec=kkPrefRecords(pref, KK.feats).byCode;
  kkRenderPref();
}

/* ---- GeoJSON → SVG ---- */
function kkEachCoord(geom, fn){
  const walk=a=>{ if(typeof a[0]==="number") fn(a); else a.forEach(walk); };
  walk(geom.coordinates);
}
/* N03 の版による属性の違いを吸収（政令市の区が N03_005 か N03_003+N03_004 か） */
function kkFeatInfo(p){
  const code=String(p.N03_007||"").replace(/\D/g,"").padStart(5,"0");
  let city=p.N03_004||"", ward=p.N03_005||"";
  if(!ward && p.N03_003 && /市$/.test(p.N03_003) && /区$/.test(city)){ ward=city; city=p.N03_003; }
  const real=!!city && city!=="所属未定地" && !/000$/.test(code);
  return { code, city, ward, name:city+ward, real };
}
function kkBuildMap(geo, border){
  const src=(geo.features||[]).filter(f=>f.geometry);
  // 古い N03 は島ごとに別フィーチャーなので、コード単位にまとめる
  const groups={}, order=[];
  src.forEach((f,i)=>{
    const inf=kkFeatInfo(f.properties||{});
    const key=inf.real ? inf.code : "void"+i;
    if(!groups[key]){ groups[key]={...inf, geoms:[]}; order.push(key); }
    groups[key].geoms.push(f.geometry);
  });
  const feats=order.map(k=>groups[k]);

  // 中心から極端に離れた島（小笠原など）は「主な範囲」から外す
  const lats=[]; src.forEach(f=>kkEachCoord(f.geometry,([,y])=>lats.push(y)));
  lats.sort((a,b)=>a-b);
  const kx=Math.cos((lats[Math.floor(lats.length/2)]||35)*Math.PI/180);
  feats.forEach(f=>{
    const b=[Infinity,Infinity,-Infinity,-Infinity];
    f.geoms.forEach(g=>kkEachCoord(g,([x,y])=>{ x*=kx; y=-y; if(x<b[0])b[0]=x; if(y<b[1])b[1]=y; if(x>b[2])b[2]=x; if(y>b[3])b[3]=y; }));
    f.rb=b; f.cx=(b[0]+b[2])/2; f.cy=(b[1]+b[3])/2;
  });
  const med=a=>{ const s=a.slice().sort((x,y)=>x-y); return s[Math.floor(s.length/2)]||0; };
  const reals=feats.filter(f=>f.real && isFinite(f.cx));
  const mx=med(reals.map(f=>f.cx)), my=med(reals.map(f=>f.cy));
  reals.forEach(f=>f.dist=Math.hypot(f.cx-mx, f.cy-my));
  const md=Math.max(med(reals.map(f=>f.dist)), 0.05);
  const union=list=>list.reduce((b,f)=>[Math.min(b[0],f.rb[0]),Math.min(b[1],f.rb[1]),Math.max(b[2],f.rb[2]),Math.max(b[3],f.rb[3])],[Infinity,Infinity,-Infinity,-Infinity]);
  const fullR=union(feats.filter(f=>isFinite(f.cx)));
  let mainR=union(reals.filter(f=>f.dist<=md*4));
  const area=b=>(b[2]-b[0])*(b[3]-b[1]);
  const trimmed = area(fullR) > area(mainR)*1.6;
  if(!trimmed) mainR=fullR;

  // 主な範囲の幅を 1000 とする座標系
  const S=1000/Math.max(mainR[2]-mainR[0], 1e-6);
  const P=([lon,lat])=>[ +((lon*kx-mainR[0])*S).toFixed(2), +((-lat-mainR[1])*S).toFixed(2) ];
  const toBox=r=>[(r[0]-mainR[0])*S, (r[1]-mainR[1])*S, (r[2]-mainR[0])*S, (r[3]-mainR[1])*S];
  const lineStr=(pts,close)=>pts.map((c,i)=>{ const [x,y]=P(c); return (i?"L":"M")+x+","+y; }).join("")+(close?"Z":"");
  const ringStr=r=>r.map((p,i)=>(i?"L":"M")+p[0]+","+p[1]).join("")+"Z";
  feats.forEach(f=>{
    // 投影済みのポリゴン [[ring...]...]
    const polys=[];
    f.geoms.forEach(g=>{
      const ps = g.type==="Polygon" ? [g.coordinates] : g.type==="MultiPolygon" ? g.coordinates : [];
      ps.forEach(rings=>polys.push(rings.map(r=>r.map(P))));
    });
    f.d=polys.map(rings=>rings.map(ringStr).join("")).join("");
    f.box=toBox(f.rb);
    // 名前の位置：いちばん大きい島の「内側でいちばん広く空いている点」（形がいびつでも区域内に収まる）
    if(f.real && polys.length){
      const big=polys.reduce((a,b)=>Math.abs(kkRingArea(b[0]))>Math.abs(kkRingArea(a[0]))?b:a);
      const [lx,ly,lr]=kkPolylabel(big);
      f.lx=lx; f.ly=ly; f.lr=lr; f.label=f.ward||f.city;
    }
    delete f.geoms;
  });
  KK.feats=feats;
  KK.byCode={}; feats.forEach(f=>{ if(f.real) KK.byCode[f.code]=f; });

  // 表示範囲：最初は「主な範囲」。縮小は離島まで全部入るところまで、拡大は 16 倍まで
  const pad=(b,m)=>[b[0]-m, b[1]-m, (b[2]-b[0])+m*2, (b[3]-b[1])+m*2];
  const mainBox=pad(toBox(mainR), 14);
  const fb=toBox(fullR);
  KK.home=mainBox;
  KK.limit=kkFitAspect(pad(fb, Math.max(fb[2]-fb[0], fb[3]-fb[1])*0.06), mainBox);
  KK.minW=mainBox[2]/16;
  KK.view=mainBox.slice();

  let borderD="";
  if(border && border.features){
    border.features.forEach(f=>{
      const g=f.geometry; if(!g) return;
      const lines = g.type==="LineString" ? [g.coordinates] : g.type==="MultiLineString" ? g.coordinates
                  : g.type==="Polygon" ? g.coordinates : g.type==="MultiPolygon" ? g.coordinates.flat() : [];
      borderD+=lines.map(l=>lineStr(l,false)).join("");
    });
  }
  const paths=feats.map(f=> f.real
    ? `<path class="kk-muni" data-code="${f.code}" d="${f.d}" tabindex="0" role="button" aria-label="${escHtml(f.name)}"></path>`
    : `<path class="kk-muni kk-void" d="${f.d}" aria-hidden="true"></path>`).join("");
  document.getElementById("kk-map").innerHTML=
    `<svg id="kk-svg" viewBox="${KK.view.join(" ")}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${escHtml(KK.pref)}の市区町村 経県値マップ">
      <g id="kk-munis">${paths}</g>
      ${borderD?`<path class="kk-border" d="${borderD}"></path>`:""}
      <g id="kk-labels" class="kk-labels" aria-hidden="true">${feats.filter(f=>f.label).map(f=>
        `<text x="${f.lx.toFixed(1)}" y="${f.ly.toFixed(1)}" data-code="${f.code}">${escHtml(f.label)}</text>`).join("")}</g>
    </svg>`;
  kkBindMap();
  kkUpdateLabels();
  if(window.ResizeObserver){
    if(KK.ro) KK.ro.disconnect();
    KK.ro=new ResizeObserver(()=>kkUpdateLabels());
    KK.ro.observe(document.getElementById("kk-svg"));
  }
}

function kkBindMap(){
  const svg=document.getElementById("kk-svg");
  const tip=document.getElementById("kk-tip");
  const wrap=document.getElementById("kk-mapwrap");
  const codeOf=t=>t && t.classList && t.classList.contains("kk-muni") ? t.dataset.code : null;
  svg.addEventListener("click", e=>{ if(KK.dragged){ KK.dragged=false; return; } const c=codeOf(e.target); if(c) kkSelect(c); });
  kkBindPanZoom(svg);
  svg.addEventListener("keydown", e=>{
    if(e.key!=="Enter" && e.key!==" ") return;
    const c=codeOf(e.target); if(c){ e.preventDefault(); kkSelect(c); }
  });
  svg.addEventListener("pointermove", e=>{
    const c=codeOf(e.target);
    if(e.pointerType!=="mouse" || !c){ tip.hidden=true; return; }
    const f=KK.byCode[c], l=KK_BY_LV[kkLv(c)];
    tip.innerHTML=`<span class="kk-sw" style="background:${l.color}"></span>${escHtml(f.name)}<em>${l.tag}</em>`;
    const r=wrap.getBoundingClientRect();
    tip.hidden=false;
    tip.style.left=Math.max(6, Math.min(e.clientX-r.left+14, r.width-tip.offsetWidth-6))+"px";
    tip.style.top=(e.clientY-r.top+16)+"px";
  });
  svg.addEventListener("pointerleave", ()=>{ tip.hidden=true; });
}


/* ---- 市区町村名ラベル ---- */
const KK_LABEL_PX=11;   // 画面上の文字の大きさ（px）。拡大縮小しても一定
function kkRingArea(r){ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]); return a/2; }
function kkSegDist2(px,py,a,b){
  let x=a[0], y=a[1], dx=b[0]-x, dy=b[1]-y;
  if(dx||dy){ const t=((px-x)*dx+(py-y)*dy)/(dx*dx+dy*dy); if(t>1){ x=b[0]; y=b[1]; } else if(t>0){ x+=dx*t; y+=dy*t; } }
  dx=px-x; dy=py-y; return dx*dx+dy*dy;
}
/* 点からポリゴン境界までの距離（内側なら正、外側なら負） */
function kkPointDist(x,y,poly){
  let inside=false, min=Infinity;
  poly.forEach(r=>{
    for(let i=0,j=r.length-1;i<r.length;j=i++){
      const a=r[i], b=r[j];
      if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
      min=Math.min(min, kkSegDist2(x,y,a,b));
    }
  });
  return (inside?1:-1)*Math.sqrt(min);
}
/* polylabel（到達不能極）：ポリゴン内でもっとも境界から遠い点 → [x, y, 半径] */
function kkPolylabel(poly){
  const outer=poly[0];
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  outer.forEach(([x,y])=>{ if(x<x0)x0=x; if(y<y0)y0=y; if(x>x1)x1=x; if(y>y1)y1=y; });
  const w=x1-x0, h=y1-y0, size=Math.min(w,h);
  if(!size) return [x0,y0,0];
  const precision=Math.max(size/40, 0.3);
  const cell=(x,y,hh)=>{ const d=kkPointDist(x,y,poly); return {x,y,h:hh,d,max:d+hh*Math.SQRT2}; };
  const q=[];
  for(let x=x0;x<x1;x+=size) for(let y=y0;y<y1;y+=size) q.push(cell(x+size/2,y+size/2,size/2));
  let best=cell(x0+w/2, y0+h/2, 0);
  // 重心も候補に
  let cx=0,cy=0,ca=0;
  for(let i=0,j=outer.length-1;i<outer.length;j=i++){ const a=outer[i],b=outer[j],f=a[0]*b[1]-b[0]*a[1]; cx+=(a[0]+b[0])*f; cy+=(a[1]+b[1])*f; ca+=f*3; }
  if(ca){ const c=cell(cx/ca, cy/ca, 0); if(c.d>best.d) best=c; }
  let guard=0;
  while(q.length && guard++<4000){
    let mi=0; for(let i=1;i<q.length;i++) if(q[i].max>q[mi].max) mi=i;
    const c=q.splice(mi,1)[0];
    if(c.d>best.d) best=c;
    if(c.max-best.d<=precision) continue;
    const hh=c.h/2;
    q.push(cell(c.x-hh,c.y-hh,hh), cell(c.x+hh,c.y-hh,hh), cell(c.x-hh,c.y+hh,hh), cell(c.x+hh,c.y+hh,hh));
  }
  return [best.x, best.y, Math.max(best.d,0)];
}
/* 今の拡大率で、区域に収まる名前だけを表示する */
function kkUpdateLabels(){
  const svg=document.getElementById("kk-svg"), g=document.getElementById("kk-labels");
  if(!svg || !g || !KK.view) return;
  const r=svg.getBoundingClientRect();
  if(!r.width) return;                                  // ページ非表示中
  const ppu=Math.min(r.width/KK.view[2], r.height/KK.view[3]);   // 1単位あたりの画面px
  const fs=KK_LABEL_PX/ppu;
  g.setAttribute("font-size", fs.toFixed(3));
  g.setAttribute("stroke-width", (fs*0.3).toFixed(3));
  g.querySelectorAll("text").forEach(t=>{
    const f=KK.byCode[t.dataset.code]; if(!f) return;
    const diam=f.lr*2*ppu, textW=f.label.length*KK_LABEL_PX;
    t.classList.toggle("off", !(diam>=KK_LABEL_PX*1.3 && diam>=textW*0.7));
  });
}

/* 拡大しても地図の縦横比（＝表示の高さ）が変わらないよう、全体表示と同じ比率に広げる */
function kkFitAspect(b, ref){
  const ar=ref[2]/ref[3];
  let [x,y,w,h]=b;
  if(w/h<ar){ const nw=h*ar; x-=(nw-w)/2; w=nw; } else { const nh=w/ar; y-=(nh-h)/2; h=nh; }
  return [x,y,w,h];
}

/* ---- 拡大・縮小・移動 ----
   PC：ホイールで拡大縮小、ドラッグで移動、ダブルクリックで拡大
   スマホ：2本指で拡大縮小、1本指で移動
   ボタン：＋ / − / 元に戻す */
function kkClampView(v){
  let [x,y,w,h]=v;
  const ar=KK.home[2]/KK.home[3];
  w=Math.max(KK.minW, Math.min(KK.limit[2], w)); h=w/ar;
  // 表示の中心が地図の範囲から出ないように
  const L=KK.limit, cx=Math.max(L[0], Math.min(L[0]+L[2], x+v[2]/2)), cy=Math.max(L[1], Math.min(L[1]+L[3], y+v[3]/2));
  return [cx-w/2, cy-h/2, w, h];
}
function kkSetView(v){
  const svg=document.getElementById("kk-svg"); if(!svg) return;
  KK.view=v;
  svg.setAttribute("viewBox", v.map(n=>n.toFixed(2)).join(" "));
  kkUpdateLabels();
}
/* 画面上の点 → 地図の座標 */
function kkClientToMap(svg, cx, cy){
  const r=svg.getBoundingClientRect(), v=KK.view;
  const s=Math.min(r.width/v[2], r.height/v[3]);
  const ox=(r.width-v[2]*s)/2, oy=(r.height-v[3]*s)/2;
  return [v[0]+(cx-r.left-ox)/s, v[1]+(cy-r.top-oy)/s, s];
}
/* (ux,uy) を動かさずに factor 倍に拡大 */
function kkZoomAt(ux, uy, factor, base){
  const v=base||KK.view;
  const nw=v[2]/factor, k=nw/v[2];
  return kkClampView([ux-(ux-v[0])*k, uy-(uy-v[1])*k, nw, v[3]*k]);
}
function kkZoomBy(factor){
  const v=KK.view;
  kkZoomTo(kkZoomAt(v[0]+v[2]/2, v[1]+v[3]/2, factor));
}
function kkBindPanZoom(svg){
  const pts=new Map();
  let start=null;     // ジェスチャー開始時の状態
  const snapshot=()=>{
    const list=[...pts.values()];
    const c = list.length>1 ? [(list[0].x+list[1].x)/2, (list[0].y+list[1].y)/2] : [list[0].x, list[0].y];
    const d = list.length>1 ? Math.hypot(list[0].x-list[1].x, list[0].y-list[1].y) : 0;
    start={ view:KK.view.slice(), c, d, n:list.length, moved:false };
  };
  svg.addEventListener("pointerdown", e=>{
    if(e.button>0) return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    cancelAnimationFrame(KK.anim);
    snapshot();
  });
  svg.addEventListener("pointermove", e=>{
    if(!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const list=[...pts.values()];
    const c = list.length>1 ? [(list[0].x+list[1].x)/2, (list[0].y+list[1].y)/2] : [list[0].x, list[0].y];
    if(!start.moved && Math.hypot(c[0]-start.c[0], c[1]-start.c[1])<5 && list.length<2) return;
    if(!start.moved){ start.moved=true; try{ svg.setPointerCapture(e.pointerId); }catch(_){} svg.classList.add("dragging"); document.getElementById("kk-tip").hidden=true; }
    const r=svg.getBoundingClientRect(), v0=start.view;
    const s=Math.min(r.width/v0[2], r.height/v0[3]);
    // 移動（開始時の表示から、指の移動ぶんずらす）
    let v=[v0[0]-(c[0]-start.c[0])/s, v0[1]-(c[1]-start.c[1])/s, v0[2], v0[3]];
    // 2本指なら拡大縮小
    if(list.length>1 && start.d>0){
      const d=Math.hypot(list[0].x-list[1].x, list[0].y-list[1].y);
      const ox=(r.width-v0[2]*s)/2, oy=(r.height-v0[3]*s)/2;
      const ux=v[0]+(c[0]-r.left-ox)/s, uy=v[1]+(c[1]-r.top-oy)/s;
      v=kkZoomAt(ux, uy, d/start.d, v);
    }
    kkSetView(kkClampView(v));
  });
  const end=e=>{
    if(!pts.has(e.pointerId)) return;
    if(start && start.moved) KK.dragged=true;
    pts.delete(e.pointerId);
    svg.classList.remove("dragging");
    if(pts.size){ snapshot(); start.moved=true; } else start=null;
    setTimeout(()=>{ KK.dragged=false; }, 0);
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("wheel", e=>{
    e.preventDefault();
    const [ux,uy]=kkClientToMap(svg, e.clientX, e.clientY);
    const factor=Math.exp(-e.deltaY*(e.deltaMode===1?0.05:0.0022));
    cancelAnimationFrame(KK.anim);
    kkSetView(kkZoomAt(ux, uy, factor));
  }, { passive:false });
  svg.addEventListener("dblclick", e=>{
    e.preventDefault();
    const [ux,uy]=kkClientToMap(svg, e.clientX, e.clientY);
    kkZoomTo(kkZoomAt(ux, uy, 2));
  });
}
/* 一覧から選んだとき：名前が見えないほど小さければ、その市区町村まで寄る */
function kkFocus(code){
  const f=KK.byCode[code]; if(!f) return;
  const t=document.querySelector(`#kk-labels text[data-code="${code}"]`);
  const b=f.box, cx=(b[0]+b[2])/2, cy=(b[1]+b[3])/2;
  const v=KK.view;
  const inView = cx>v[0] && cx<v[0]+v[2] && cy>v[1] && cy<v[1]+v[3];
  if(t && !t.classList.contains("off") && inView) return;
  const w=Math.max((b[2]-b[0])*3.2, (b[3]-b[1])*3.2*KK.home[2]/KK.home[3]);
  const nw=Math.min(v[2], w);
  kkZoomTo(kkClampView([cx-nw/2, cy-nw*KK.home[3]/KK.home[2]/2, nw, nw*KK.home[3]/KK.home[2]]));
}
function kkZoomTo(target){
  const svg=document.getElementById("kk-svg"); if(!svg) return;
  const from=KK.view.slice();
  const set=v=>kkSetView(v);
  cancelAnimationFrame(KK.anim);
  if(prefersReduced()){ set(target.slice()); return; }
  const t0=performance.now(), dur=420;
  const step=now=>{
    const t=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-t,3);
    set(from.map((v,i)=>v+(target[i]-v)*e));
    if(t<1) KK.anim=requestAnimationFrame(step);
  };
  KK.anim=requestAnimationFrame(step);
}

/* ---- 都道府県ごとの描画 ---- */
function kkLv(code){ return (KK.rec[code]||{}).lv||0; }

function kkRenderPref(){
  const real=KK.feats.filter(f=>f.real);
  const total=real.length;
  const count={}; KK_LEVELS.forEach(l=>count[l.lv]=0);
  let score=0;
  real.forEach(f=>{ const lv=kkLv(f.code); count[lv]++; score+=lv; });
  const visited=total-count[0];

  document.querySelectorAll("#kk-svg .kk-muni[data-code]").forEach(p=>{
    const c=p.dataset.code, l=KK_BY_LV[kkLv(c)];
    p.style.fill=l.color;
    p.setAttribute("aria-label", `${KK.byCode[c].name}、${l.tag}`);
    p.classList.toggle("dim", KK.filter!=null && kkLv(c)!==KK.filter);
  });

  document.getElementById("kk-stats").innerHTML=`
    <div class="stat-chip">${escHtml(KK.pref)}の経県値 <strong>${score}</strong> / ${total*KK_MAX}点</div>
    <div class="stat-chip">足を運んだ <strong>${visited}</strong> / ${total} 市区町村</div>
    <div class="stat-chip">制覇率 <strong>${total?Math.round(visited/total*100):0}%</strong></div>`;

  document.getElementById("kk-legend").innerHTML=KK_LEVELS.slice().reverse().map(l=>`
    <button type="button" class="kk-leg${KK.filter===l.lv?" active":""}" data-lv="${l.lv}" aria-pressed="${KK.filter===l.lv}" title="${l.note}">
      <span class="kk-sw" style="background:${l.color}"></span>${l.tag}<span class="kk-leg-n">${count[l.lv]}</span>
    </button>`).join("");
  document.querySelectorAll(".kk-leg").forEach(b=>b.onclick=()=>{
    const lv=Number(b.dataset.lv);
    KK.filter = KK.filter===lv ? null : lv;
    kkRenderPref();
  });

  // 一覧（レベルの高い順。未踏は折りたたみ）
  const chip=f=>`<button type="button" class="kk-chip" data-code="${f.code}">${escHtml(f.name)}</button>`;
  document.getElementById("kk-list").innerHTML=KK_LEVELS.map(l=>{
    const fs=real.filter(f=>kkLv(f.code)===l.lv).sort((a,b)=>a.code<b.code?-1:1);
    if(!fs.length) return "";
    const head=`<span class="kk-sw" style="background:${l.color}"></span>${l.tag}<span class="kk-leg-n">${fs.length}</span>`;
    const body=`<div class="kk-chips">${fs.map(chip).join("")}</div>`;
    return l.lv===0
      ? `<details class="kk-group"><summary class="kk-group-head">${head}</summary>${body}</details>`
      : `<div class="kk-group"><div class="kk-group-head">${head}</div>${body}</div>`;
  }).join("");
  document.querySelectorAll(".kk-chip").forEach(b=>b.onclick=()=>{
    const c=b.dataset.code;
    kkFocus(c);
    kkSelect(c);
    const m=document.getElementById("kk-mapwrap"), nav=document.querySelector("nav");
    window.scrollTo({ top:Math.max(0, window.scrollY+m.getBoundingClientRect().top-(nav?nav.offsetHeight:0)-8), behavior:prefersReduced()?"auto":"smooth" });
  });

  if(KK.selected) kkSelect(KK.selected);
}

function kkSelect(code){
  const f=KK.byCode[code]; if(!f) return;
  KK.selected=code;
  const g=document.getElementById("kk-munis");
  g.querySelectorAll(".kk-muni.sel").forEach(p=>p.classList.remove("sel"));
  const p=g.querySelector(`.kk-muni[data-code="${code}"]`);
  if(p){ p.classList.add("sel"); g.appendChild(p); p.focus({preventScroll:true}); }
  const r=KK.rec[code]||{}, l=KK_BY_LV[r.lv||0];
  document.getElementById("kk-info").innerHTML=`
    <div class="kk-info-head">
      <span class="kk-info-name">${escHtml(f.name)}</span>
      <span class="kk-badge" style="--c:${l.color}">${l.tag}</span>
    </div>
    ${r.date?`<div class="kk-info-date">${escHtml(r.date)}</div>`:""}
    ${r.memo?`<div class="kk-info-memo">${escHtml(r.memo)}</div>`:""}`;
}

/* ---------- 初期化 ---------- */
loadShiori();
loadHistory();
loadCleaning();
loadKaji();
loadKeiken();
(function initRouting(){
  const st=parseHash();
  history.replaceState({page:st.page}, "", location.hash||"#shiori");
  applyPage(st.page);
})();