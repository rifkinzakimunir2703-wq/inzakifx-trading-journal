const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let currentUser = null, trades = [], authMode = "login", accounts = [], payouts = [];
let publicMode = false, publicOwnerId = null;
let prop = {account:5000,targetPct:6,maxDDPct:4,dailyLossPct:2,consistencyPct:20,buffer:100};
let editingAccountId = null;
let calendarCursor = new Date();
function setValueClass(id, value, mode="normal"){
  const el=$(id); if(!el)return;
  el.classList.remove("positive","negative","neutralValue");
  if(mode==="winrate") el.classList.add(Number(value)>=50?"positive":"negative");
  else if(Number(value)>0) el.classList.add("positive");
  else if(Number(value)<0) el.classList.add("negative");
  else el.classList.add("neutralValue");
}

const $ = id => document.getElementById(id);
const money = n => `${n < 0 ? "-" : ""}$${Math.abs(Number(n)||0).toFixed(2)}`;

function show(id, yes=true){ $(id).classList.toggle("hidden", !yes); }

async function init(){
  if(!SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")){
    $("authMsg").textContent = "Masukkan Supabase Publishable Key di config.js terlebih dahulu.";
    return;
  }
  const {data:{session}} = await sb.auth.getSession();
  if(session) await enterApp(session.user);
  else await enterPublic();
  sb.auth.onAuthStateChange(async (_event, session) => {
    if(session) await enterApp(session.user); else await enterPublic();
  });
}

function ownerId(){ return currentUser ? currentUser.id : publicOwnerId; }

async function enterPublic(){
  currentUser = null; publicMode = true; accounts=[]; payouts=[]; trades=[];
  const {data,error}=await sb.from("portal_public_owner").select("owner_id").eq("id",true).maybeSingle();
  publicOwnerId=data?.owner_id||null;
  show("authView", false); show("appView", true); show("logoutBtn", false);
  const loginBtn=$("adminLoginBtn"); if(loginBtn) loginBtn.style.display="block";
  setPublicNav(true);
  if(publicOwnerId){
    await loadTrades();
    await loadAccounts();
    await loadPayouts();
  } else {
    render(); renderPerformance(); renderCalendar();
  }
  openPage("journalPage");
  setPublicNav(false);
}

async function enterApp(user){
  currentUser = user; publicMode = false; publicOwnerId = null;
  show("authView", false); show("appView", true); show("logoutBtn", true);
  const loginBtn=$("adminLoginBtn"); if(loginBtn) loginBtn.style.display="none";
  await loadTrades();
  await loadProp();
  await loadAccounts(); await loadPayouts();
  setPublicNav(true);
  openPage("globalPage");
}

function exitApp(){
  currentUser = null; publicOwnerId = null; publicMode = false; trades=[]; accounts=[]; payouts=[];
  show("authView", false); show("appView", true); show("logoutBtn", false);
}

function setPublicNav(isAdmin){
  const allowed=["performancePage","journalPage","calendarPage"];
  document.querySelectorAll(".navBtn").forEach(btn=>{
    const page=btn.dataset.page; btn.classList.toggle("hidden",!isAdmin && !allowed.includes(page));
  });
  ["addTradeBtn","modeBtn","exportBtn","addAccountBtn","addPayoutBtn"].forEach(id=>{const el=$(id);if(el)el.classList.toggle("hidden",!isAdmin);});
  document.querySelectorAll(".accountActions").forEach(el=>el.classList.toggle("hidden",!isAdmin));
  if(!isAdmin){
    ["globalPage","accountsPage","payoutsPage"].forEach(id=>{const el=$(id);if(el)el.classList.add("hidden");});
  }
}

window.showAdminLogin=function(){
  show("authView",true); show("appView",false);
  const btn=$("adminLoginBtn"); if(btn)btn.style.display="none";
  if($("email"))$("email").focus();
};

$("loginTab").onclick = () => setAuthMode("login");
function setAuthMode(mode){
  authMode=mode;
  $("loginTab").classList.toggle("active", mode==="login");
  const rt=$("registerTab"); if(rt) rt.classList.add("hidden");
  document.querySelectorAll(".registerOnly").forEach(e=>e.classList.add("hidden"));
  $("authSubmit").textContent="Login";
  $("authMsg").textContent="";
}

$("authForm").onsubmit = async e => {
  e.preventDefault(); $("authMsg").textContent="Memproses...";
  const email=$("email").value.trim(), password=$("password").value;
  const result=await sb.auth.signInWithPassword({email,password});
  if(result.error) $("authMsg").textContent=result.error.message;
};

$("logoutBtn").onclick=()=>sb.auth.signOut();
$("addTradeBtn").onclick=()=>{if(!currentUser)return alert("Silakan login sebagai admin.");show("modal",true);};
$("closeModal").onclick=()=>show("modal",false);

$("tradeForm").onsubmit=async e=>{
  e.preventDefault(); if(!currentUser){$("tradeMsg").textContent="Silakan login sebagai admin.";return;} $("tradeMsg").textContent="Menyimpan...";
  const row={
    user_id:currentUser.id,
    account_id:$("tAccount") ? $("tAccount").value || null : null,
    trade_date:new Date().toISOString(),
    symbol:$("tSymbol").value.trim().toUpperCase(),
    side:$("tSide").value,
    entry:num("tEntry"), exit:num("tExit"), risk:num("tRisk"), pl:num("tPL"),
    strategy:$("tStrategy").value.trim(), timeframe:$("tTF").value.trim(),
    session:$("tSession").value.trim(), notes:$("tNotes").value.trim()
  };
  const {error}=await sb.from("trades").insert(row);
  if(error){$("tradeMsg").textContent=error.message;return;}
  $("tradeForm").reset(); $("tradeMsg").textContent="Trade tersimpan.";
  setTimeout(()=>show("modal",false),500); await loadTrades();
  await loadProp();
  await loadAccounts(); await loadPayouts();
};
function num(id){const v=parseFloat($(id).value); return Number.isFinite(v)?v:0;}


async function loadProp(){
  const {data,error}=await sb.from("profiles").select("prop_settings").eq("id",currentUser.id).maybeSingle();
  if(!error && data && data.prop_settings) prop={...prop,...data.prop_settings};
  setPropInputs(); renderProp();
}
function setPropInputs(){
  const map={propAccount:"account",propTargetPct:"targetPct",propMaxDDPct:"maxDDPct",propDailyLossPct:"dailyLossPct",propConsistencyPct:"consistencyPct",propBuffer:"buffer"};
  Object.entries(map).forEach(([id,k])=>{if($(id)) $(id).value=prop[k];});
}
async function saveProp(){
  if(!currentUser){ alert("Silakan login sebagai admin untuk mengubah data."); return; }
  const n=id=>parseFloat($(id).value)||0;
  prop={account:n("propAccount"),targetPct:n("propTargetPct"),maxDDPct:n("propMaxDDPct"),dailyLossPct:n("propDailyLossPct"),consistencyPct:n("propConsistencyPct"),buffer:n("propBuffer")};
  const {error}=await sb.from("profiles").update({prop_settings:prop}).eq("id",currentUser.id);
  if(error){alert("Gagal menyimpan pengaturan: "+error.message);return;}
  renderProp(); alert("Pengaturan Prop Firm tersimpan.");
}
function renderProp(){
  if(!$("propTarget")) return;
  const net=trades.reduce((a,t)=>a+Number(t.pl||0),0);
  const target=prop.account*prop.targetPct/100, ddLimit=prop.account*prop.maxDDPct/100, dailyLimit=prop.account*prop.dailyLossPct/100;
  const days={}; trades.forEach(t=>{const d=new Date(t.trade_date).toISOString().slice(0,10);days[d]=(days[d]||0)+Number(t.pl||0)});
  const vals=Object.values(days), best=Math.max(0,...vals);
  const consistency=net>0?best/net*100:0;
  const progress=target>0?Math.max(0,Math.min(100,net/target*100)):0;
  $("propTarget").textContent=money(target); $("propProgress").textContent=progress.toFixed(1)+"%";
  $("propDDLimit").textContent=money(ddLimit); $("propDailyLimit").textContent=money(dailyLimit);
  $("propBestDay").textContent=money(best); $("propConsistency").textContent=consistency.toFixed(1)+"%";
  let warn="";
  if(net<=-ddLimit) warn="⛔ Max drawdown terlampaui.";
  else if(vals.some(v=>v<=-dailyLimit)) warn="⛔ Daily loss limit terlampaui.";
  else if(consistency>prop.consistencyPct) warn="⚠️ Consistency di atas batas. Sebarkan profit ke beberapa hari.";
  else if(net>=target) warn="✅ Target profit tercapai.";
  else warn="🟢 Masih dalam batas. Sisa target: "+money(Math.max(0,target-net));
  $("propWarning").textContent=warn;
}
$("modeBtn").onclick=()=>{show("propPanel", $("propPanel").classList.contains("hidden")); renderProp();};
$("savePropBtn").onclick=saveProp;



let performanceChart;
function perfMoney(v){return money(v);}
function setupPerfFilters(){
  const fill=(id,vals)=>{const s=$(id); if(!s)return; const old=s.value; s.innerHTML='<option value="">Semua</option>'+[...new Set(vals.filter(Boolean))].sort().map(v=>`<option>${esc(v)}</option>`).join("");s.value=old;};
  const opts=accounts.map(a=>({v:a.id,t:`${a.firm} — ${a.account_name}`}));
  const a=$("perfAccount"); if(a){const old=a.value;a.innerHTML='<option value="">Semua Akun</option>'+opts.map(x=>`<option value="${x.v}">${esc(x.t)}</option>`).join("");a.value=old;}
  fill("perfStrategy",trades.map(t=>t.strategy));fill("perfTF",trades.map(t=>t.timeframe));fill("perfSession",trades.map(t=>t.session));
}
function getPerfTrades(){
  const aid=$("perfAccount")?.value||"", st=$("perfStrategy")?.value||"", tf=$("perfTF")?.value||"", se=$("perfSession")?.value||"", from=$("perfFrom")?.value||"", to=$("perfTo")?.value||"";
  return trades.filter(t=>{
    const d=new Date(t.trade_date).toISOString().slice(0,10);
    return (!aid||t.account_id===aid)&&(!st||t.strategy===st)&&(!tf||t.timeframe===tf)&&(!se||t.session===se)&&(!from||d>=from)&&(!to||d<=to);
  }).sort((a,b)=>new Date(a.trade_date)-new Date(b.trade_date));
}
function groupPerf(ts,key){
  const g={};ts.forEach(t=>{const k=t[key]||"Unknown";if(!g[k])g[k]={n:0,w:0,l:0,pl:0};const p=Number(t.pl||0);g[k].n++;g[k].pl+=p;if(p>0)g[k].w++;if(p<0)g[k].l++;});
  return Object.entries(g).map(([name,x])=>({...x,name,wr:x.n?x.w/x.n*100:0})).sort((a,b)=>b.pl-a.pl);
}
function renderPerfTable(id,rows){
  const el=$(id);if(!el)return;
  el.innerHTML=rows.map(x=>`<div class="trade"><div><b>${esc(x.name)}</b><span>${x.wr.toFixed(1)}% WR</span></div><small>${x.n} trades · ${x.w}W / ${x.l}L · <b class="${x.pl>=0?"positive":"negative"}">${money(x.pl)}</b></small></div>`).join("")||'<p class="muted">Belum ada data.</p>';
}
function renderPerformance(){
  setupPerfFilters();
  const ts=getPerfTrades(), vals=ts.map(t=>Number(t.pl||0)), wins=vals.filter(x=>x>0), losses=vals.filter(x=>x<0);
  const net=vals.reduce((a,b)=>a+b,0), grossW=wins.reduce((a,b)=>a+b,0), grossL=Math.abs(losses.reduce((a,b)=>a+b,0));
  const wr=ts.length?wins.length/ts.length*100:0, pf=grossL?grossW/grossL:0, avgW=wins.length?grossW/wins.length:0, avgL=losses.length?grossL/losses.length:0, exp=ts.length?net/ts.length:0;
  let eq=0,peak=0,maxDD=0;ts.forEach(t=>{eq+=Number(t.pl||0);peak=Math.max(peak,eq);maxDD=Math.max(maxDD,peak-eq)});
  const days={};ts.forEach(t=>{const d=new Date(t.trade_date).toISOString().slice(0,10);days[d]=(days[d]||0)+Number(t.pl||0)});
  const dayVals=Object.values(days), best=dayVals.length?Math.max(...dayVals):0,worst=dayVals.length?Math.min(...dayVals):0;
  [["pTotal",ts.length],["pWinRate",wr.toFixed(1)+"%"],["pNet",money(net)],["pPF",pf.toFixed(2)],["pAvgWin",money(avgW)],["pAvgLoss",money(-avgL)],["pExpectancy",money(exp)],["pMaxDD",money(-maxDD)],["pBestDay",money(best)],["pWorstDay",money(worst)],["pWins",wins.length],["pLosses",losses.length],["perfEquity",money(eq)]].forEach(([id,v])=>{if($(id))$(id).textContent=v;});
  renderPerfTable("perfAccounts",groupPerf(ts,"account_id").map(x=>{const a=accounts.find(a=>a.id===x.name);x.name=a?`${a.firm} — ${a.account_name}`:x.name;return x;}));
  renderPerfTable("perfStrategies",groupPerf(ts,"strategy"));renderPerfTable("perfTimeframes",groupPerf(ts,"timeframe"));renderPerfTable("perfSessions",groupPerf(ts,"session"));
  const pd=Object.entries(days).sort((a,b)=>b[0].localeCompare(a[0]));
  $("perfDays").innerHTML=pd.map(([d,p])=>`<div class="trade"><div><b>${d}</b><b class="${p>=0?"positive":"negative"}">${money(p)}</b></div></div>`).join("")||'<p class="muted">Belum ada data.</p>';
  drawPerformanceChart(ts);
}
function drawPerformanceChart(ts){
  const c=$("performanceChart");if(!c)return;const ctx=c.getContext("2d");const w=c.width=c.clientWidth*2,h=c.height=280*2;ctx.clearRect(0,0,w,h);if(!ts.length)return;
  let eq=0;const pts=[0];ts.forEach(t=>{eq+=Number(t.pl||0);pts.push(eq)});let min=Math.min(...pts),max=Math.max(...pts);if(min===max){min-=1;max+=1;}
  ctx.beginPath();ctx.strokeStyle="#58a6ff";ctx.lineWidth=5;pts.forEach((v,i)=>{const x=i/(pts.length-1)*w,y=h-(v-min)/(max-min)*h;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();
}
["perfAccount","perfStrategy","perfTF","perfSession","perfFrom","perfTo"].forEach(id=>{if($(id))$(id).addEventListener("change",renderPerformance);});
if($("perfReset"))$("perfReset").onclick=()=>{["perfAccount","perfStrategy","perfTF","perfSession","perfFrom","perfTo"].forEach(id=>{if($(id))$(id).value=""});renderPerformance();};

async function loadAccounts(){
  const {data,error}=await sb.from("prop_accounts").select("*").eq("user_id",ownerId()).order("created_at",{ascending:false});
  if(!error) accounts=data||[]; else console.error(error);
  renderAccounts(); renderGlobal(); fillPayoutAccounts(); fillTradeAccounts(); renderCalendar(); setupPerfFilters(); renderPerformance();
}
async function loadPayouts(){
  const {data,error}=await sb.from("payouts").select("*").eq("user_id",ownerId()).order("payout_date",{ascending:false});
  if(!error) payouts=data||[]; else console.error(error);
  renderPayouts(); renderGlobal();
}
function renderAccounts(){
  const box=$("accountList"); if(!box)return;
  box.innerHTML=accounts.map(a=>{
    const ats=trades.filter(t=>t.account_id===a.id);
    const pl=ats.reduce((s,t)=>s+Number(t.pl||0),0);
    const paid=payouts.filter(p=>p.account_id===a.id&&p.status==="Paid").reduce((s,p)=>s+Number(p.amount||0),0);
    const target=Number(a.account_size)*Number(a.target_pct)/100;
    const progress=target?Math.max(0,pl/target*100):0;
    const consistency=getAccountConsistency(a.id);
    const rule=Number(a.consistency_pct||0);
    const consistencyClass=ats.length?(!rule||consistency<=rule?"positive":"negative"):"neutralValue";
    const statusClass=(a.status||"").toLowerCase().replace(/\s+/g,"");
    return `<div class="panel accountCard">
      <div class="accountTop"><div><h2>${esc(a.firm)}</h2><small>${esc(a.account_name)}</small></div><span class="status ${statusClass}">${esc(a.status)}</span></div>
      <div class="accountMetrics">
        <div><small>Size</small><b>${money(a.account_size)}</b></div>
        <div><small>Fee</small><b class="negative">${money(-Number(a.purchase_fee||0))}</b></div>
        <div><small>Trading P/L</small><b class="${pl>=0?"positive":"negative"}">${money(pl)}</b></div>
        <div><small>Payout</small><b class="${paid>0?"positive":""}">${money(paid)}</b></div>
        <div><small>Consistency</small><b class="${consistencyClass}">${ats.length?consistency.toFixed(1)+"%":"—"}</b></div>
        <div><small>Rule</small><b>${rule?rule+"%":"—"}</b></div>
      </div>
      <div class="progress"><i style="width:${Math.min(100,Math.max(0,progress))}%"></i></div>
      <div class="accountRuleLine"><span>Target ${Number(a.target_pct)}%</span><span>Max DD ${Number(a.max_dd_pct)}%</span><span>Daily ${Number(a.daily_loss_pct)}%</span><span>Consistency ${rule}%</span></div>
      <div class="accountActions"><button class="secondary" onclick="editAccount('${a.id}')">✏️ Edit Account</button><button class="secondary" onclick="setAccountStatus('${a.id}')">Ubah Status</button><button class="danger" onclick="deleteAccount('${a.id}')">Hapus</button></div>
    </div>`;
  }).join("") || '<div class="panel emptyState"><strong>Belum ada akun Prop Firm</strong><p class="muted">Tambahkan akun pertama untuk mulai melacak biaya, trade, payout, dan consistency.</p><button onclick="document.getElementById(\'addAccountBtn\').click()">+ Tambah Akun</button></div>';
}
async function setAccountStatus(id){
  if(!currentUser){ alert("Silakan login sebagai admin untuk mengubah data."); return; }
  const a=accounts.find(x=>x.id===id); if(!a)return;
  const status=prompt("Status baru: Phase 1, Phase 2, Funded, Payout, Failed, Closed",a.status);
  if(!status)return;
  const {error}=await sb.from("prop_accounts").update({status}).eq("id",id).eq("user_id",ownerId());
  if(error)alert(error.message);else loadAccounts();
}
async function deleteAccount(id){
  if(!currentUser){ alert("Silakan login sebagai admin untuk mengubah data."); return; }
  if(!confirm("Hapus akun beserta data terkait?"))return;
  const {error}=await sb.from("prop_accounts").delete().eq("id",id).eq("user_id",ownerId());
  if(error)alert(error.message);else {await loadAccounts();await loadPayouts();}
}
function renderPayouts(){
  const box=$("payoutList");if(!box)return;
  box.innerHTML=payouts.map(p=>{const a=accounts.find(x=>x.id===p.account_id);return `<div class="trade"><div><b>${money(p.amount)}</b><span class="pill">${esc(p.status)}</span></div><small>${esc(a?.firm||"")} · ${esc(a?.account_name||"")} · ${p.payout_date}</small><small>${esc(p.note||"")}</small></div>`}).join("")||'<p class="muted">Belum ada payout.</p>';
}
function fillTradeAccounts(){const s=$("tAccount");if(!s)return;s.innerHTML='<option value="">Pilih akun prop firm</option>'+accounts.map(a=>`<option value="${a.id}">${esc(a.firm)} — ${esc(a.account_name)}</option>`).join("");}
function fillPayoutAccounts(){
  const s=$("pAccount");if(!s)return;s.innerHTML=accounts.map(a=>`<option value="${a.id}">${esc(a.firm)} — ${esc(a.account_name)}</option>`).join("");
}
function getAccountConsistency(accountId){
  const rows=trades.filter(t=>t.account_id===accountId);
  const daily={};
  rows.forEach(t=>{
    const d=new Date(t.trade_date).toISOString().slice(0,10);
    daily[d]=(daily[d]||0)+Number(t.pl||0);
  });
  const total=Object.values(daily).reduce((s,v)=>s+v,0);
  const positiveDays=Object.values(daily).filter(v=>v>0);
  const best=positiveDays.length?Math.max(...positiveDays):0;
  return total>0 ? (best/total)*100 : 0;
}
function renderGlobal(){
  const fees=accounts.reduce((s,a)=>s+Number(a.purchase_fee||0),0);
  const pays=payouts.filter(p=>p.status==="Paid").reduce((s,p)=>s+Number(p.amount||0),0);
  const vals=trades.map(t=>Number(t.pl||0));
  const pl=vals.reduce((s,v)=>s+v,0);
  const wins=vals.filter(v=>v>0), losses=vals.filter(v=>v<0);
  const grossW=wins.reduce((s,v)=>s+v,0), grossL=Math.abs(losses.reduce((s,v)=>s+v,0));
  const wr=vals.length?wins.length/vals.length*100:0, pf=grossL?grossW/grossL:0;
  const netCash=pays-fees, roi=fees?netCash/fees*100:0;
  const countStatus=s=>accounts.filter(a=>(a.status||"").toLowerCase().replace(/\s+/g," ")===s).length;
  [["gTradingPL",money(pl)],["gWinRate",wr.toFixed(1)+"%"],["gTradeCount",vals.length],["gProfitFactor",pf.toFixed(2)],
   ["gFees",money(-fees)],["gPayouts",money(pays)],["gNet",money(netCash)],["gCashROI",roi.toFixed(1)+"%"],
   ["gAccounts",accounts.length],["gPhase1",countStatus("phase 1")],["gPhase2",countStatus("phase 2")],["gFunded",countStatus("funded")]]
  .forEach(([id,v])=>{if($(id))$(id).textContent=v;});
  setValueClass("gTradingPL",pl); setValueClass("gNet",netCash); setValueClass("gFees",-fees); setValueClass("gPayouts",pays); setValueClass("gCashROI",roi);
  setValueClass("gWinRate",wr,"winrate"); setValueClass("gProfitFactor",pf);
  const todayKey=new Date().toISOString().slice(0,10);
  const daily={};
  trades.forEach(t=>{const d=new Date(t.trade_date).toISOString().slice(0,10);daily[d]=(daily[d]||0)+Number(t.pl||0)});
  const todayPL=daily[todayKey]||0, dayVals=Object.values(daily);
  const bestDay=dayVals.length?Math.max(...dayVals):0, worstDay=dayVals.length?Math.min(...dayVals):0;
  const riskCount=accounts.filter(a=>{
    const c=getAccountConsistency(a.id), r=Number(a.consistency_pct||0);
    return r>0 && c>r;
  }).length;
  [["gTodayPL",money(todayPL)],["gBestDay",money(bestDay)],["gWorstDay",money(worstDay)],["gRiskAccounts",riskCount]]
    .forEach(([id,v])=>{if($(id))$(id).textContent=v;});
  setValueClass("gTodayPL",todayPL);setValueClass("gBestDay",bestDay);setValueClass("gWorstDay",worstDay);
  const list=$("globalAccountList");
  if(list){
    list.innerHTML=accounts.map(a=>{
      const st=a.status||"Phase 1", plA=trades.filter(t=>t.account_id===a.id).reduce((s,t)=>s+Number(t.pl||0),0);
      const paid=payouts.filter(p=>p.account_id===a.id&&p.status==="Paid").reduce((s,p)=>s+Number(p.amount||0),0);
      const currentConsistency=getAccountConsistency(a.id);
      const rule=Number(a.consistency_pct||0);
      const consistencyClass=rule>0 ? (currentConsistency<=rule ? "positive" : "negative") : "muted";
      return `<div class="globalAccountRow"><div><b>${esc(a.firm)} — ${esc(a.account_name)}</b><span class="dashStatus">${esc(st)}</span></div><div class="accountOverviewStats"><small>P/L ${money(plA)} · Payout ${money(paid)}</small><span class="consistencyBadge ${consistencyClass}">Consistency ${currentConsistency.toFixed(1)}%${rule?` / Rule ${rule}%`:""}</span></div></div>`;
    }).join("")||'<p class="muted">Belum ada akun Prop Firm.</p>';
  }
  drawGlobalEquity();
}
function drawGlobalEquity(){
  const c=$("globalEquityChart"); if(!c)return;
  const ts=[...trades].sort((a,b)=>new Date(a.trade_date)-new Date(b.trade_date));
  const ctx=c.getContext("2d"), w=c.width=c.clientWidth*2, h=c.height=250*2;
  ctx.clearRect(0,0,w,h);
  if(!ts.length){if($("gEquityLabel"))$("gEquityLabel").textContent="$0.00";return;}
  let eq=0; const pts=[0]; ts.forEach(t=>{eq+=Number(t.pl||0);pts.push(eq)});
  if($("gEquityLabel"))$("gEquityLabel").textContent=money(eq);
  let min=Math.min(...pts,0), max=Math.max(...pts,0); if(min===max){min-=1;max+=1}
  const X=i=>i/(pts.length-1)*w, Y=v=>h-(v-min)/(max-min)*h;
  const zero=Y(0);
  // soft fill under curve
  const area=ctx.createLinearGradient(0,0,0,h);
  area.addColorStop(0,"rgba(63,185,80,.18)"); area.addColorStop(.55,"rgba(63,185,80,.04)"); area.addColorStop(1,"rgba(248,81,73,.08)");
  ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(X(i),Y(v)):ctx.moveTo(X(i),Y(v)));
  ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fillStyle=area;ctx.fill();
  // zero line
  ctx.beginPath();ctx.moveTo(0,zero);ctx.lineTo(w,zero);ctx.strokeStyle="rgba(139,148,158,.35)";ctx.lineWidth=2;ctx.stroke();
  // segment colors: green above/positive move, red below/negative move
  for(let i=1;i<pts.length;i++){
    ctx.beginPath();ctx.moveTo(X(i-1),Y(pts[i-1]));ctx.lineTo(X(i),Y(pts[i]));
    ctx.lineWidth=5;
    ctx.strokeStyle=pts[i]>=pts[i-1]?"#3fb950":"#f85149";
    ctx.lineCap="round";ctx.stroke();
  }
}
function renderCalendar(){
  const box=$("calendarGrid");if(!box)return;
  const now=new Date(calendarCursor), y=now.getFullYear(), m=now.getMonth();
  const first=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate();
  const monthTitle=now.toLocaleDateString("id-ID",{month:"long",year:"numeric"});
  if($("calTitle"))$("calTitle").textContent=monthTitle.charAt(0).toUpperCase()+monthTitle.slice(1);
  const names=["Min","Sen","Sel","Rab","Kam","Jum","Sab"];let h=names.map(n=>`<div class="calHead">${n}</div>`).join("");
  for(let i=0;i<first;i++)h+="<div class=\"calEmpty\"></div>";
  for(let d=1;d<=days;d++){
    const dt=new Date(y,m,d), key=dt.toISOString().slice(0,10);
    const dayPL=trades.filter(t=>new Date(t.trade_date).toISOString().slice(0,10)===key).reduce((s,t)=>s+Number(t.pl||0),0);
    const today=key===new Date().toISOString().slice(0,10);
    h+=`<button type="button" class="calDay ${dayPL>0?"calWin":dayPL<0?"calLoss":""} ${today?"calToday":""}" data-date="${key}">
      <b>${d}</b><small>${dayPL?money(dayPL):"—"}</small></button>`;
  }
  box.innerHTML=h;
}
if($("calPrev"))$("calPrev").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar();};
if($("calNext"))$("calNext").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar();};
if($("calToday"))$("calToday").onclick=()=>{calendarCursor=new Date();renderCalendar();};

function openPage(pageId){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.querySelectorAll(".navBtn").forEach(b=>b.classList.toggle("active", b.dataset.page===pageId));
  const page=$(pageId);
  if(page) page.classList.remove("hidden");
  if(pageId==="globalPage"){renderGlobal();renderAccounts();}
  if(pageId==="performancePage"){setupPerfFilters();renderPerformance();}
  if(pageId==="accountsPage"){renderAccounts();}
  if(pageId==="payoutsPage"){renderPayouts();fillPayoutAccounts();}
  if(pageId==="calendarPage"){renderCalendar();}
  if(pageId==="journalPage"){render();}
  window.scrollTo({top:0,behavior:"smooth"});
}
window.openPage=openPage;

document.addEventListener("click",function(e){
  const nav=e.target.closest(".navBtn");
  if(nav){e.preventDefault();openPage(nav.dataset.page);return;}
  const day=e.target.closest(".calDay");
  if(day){
    e.preventDefault();
    const date=day.dataset.date;
    if($("perfFrom"))$("perfFrom").value=date;
    if($("perfTo"))$("perfTo").value=date;
    openPage("performancePage");
    renderPerformance();
  }
});

$("addAccountBtn").onclick=()=>{if(!currentUser)return alert("Silakan login sebagai admin.");editingAccountId=null;$("accountForm").reset();$("accountModalTitle").textContent="Tambah Prop Firm Account";$("accountSubmitBtn").textContent="Simpan Akun";$("aStatus").value="Phase 1";$("aTarget").value=6;$("aMaxDD").value=4;$("aDaily").value=2;$("aConsistency").value=20;show("accountModal",true)};
$("closeAccountModal").onclick=()=>{editingAccountId=null;show("accountModal",false)};
$("addPayoutBtn").onclick=()=>{if(!currentUser)return alert("Silakan login sebagai admin.");fillPayoutAccounts();show("payoutModal",true)};$("closePayoutModal").onclick=()=>show("payoutModal",false);
async function editAccount(id){
  if(!currentUser){ alert("Silakan login sebagai admin untuk mengubah data."); return; }
  const a=accounts.find(x=>x.id===id);if(!a)return;
  editingAccountId=id;
  $("aFirm").value=a.firm||"";$("aName").value=a.account_name||"";$("aSize").value=a.account_size??0;$("aFee").value=a.purchase_fee??0;
  $("aStatus").value=a.status||"Phase 1";$("aTarget").value=a.target_pct??6;$("aMaxDD").value=a.max_dd_pct??4;$("aDaily").value=a.daily_loss_pct??2;$("aConsistency").value=a.consistency_pct??20;
  $("aStart").value=a.start_date||"";$("aNotes").value=a.notes||"";
  $("accountModalTitle").textContent="Edit Prop Firm Account";$("accountSubmitBtn").textContent="Update Account";$("accountMsg").textContent="";
  show("accountModal",true);
}
window.editAccount=editAccount;
$("accountForm").onsubmit=async e=>{
  e.preventDefault(); if(!currentUser){$("accountMsg").textContent="Silakan login sebagai admin.";return;}$("accountMsg").textContent="Menyimpan...";
  const n=id=>parseFloat($(id).value)||0;
  const row={firm:$("aFirm").value.trim(),account_name:$("aName").value.trim(),account_size:n("aSize"),purchase_fee:n("aFee"),status:$("aStatus").value,target_pct:n("aTarget"),max_dd_pct:n("aMaxDD"),daily_loss_pct:n("aDaily"),consistency_pct:n("aConsistency"),start_date:$("aStart").value||null,notes:$("aNotes").value.trim()};
  let result;
  if(editingAccountId) result=await sb.from("prop_accounts").update(row).eq("id",editingAccountId).eq("user_id",currentUser.id);
  else result=await sb.from("prop_accounts").insert({...row,user_id:currentUser.id});
  if(result.error){$("accountMsg").textContent=result.error.message;return}
  e.target.reset();editingAccountId=null;show("accountModal",false);await loadAccounts();
};
$("payoutForm").onsubmit=async e=>{e.preventDefault();if(!currentUser){$("payoutMsg").textContent="Silakan login sebagai admin.";return;}const row={user_id:currentUser.id,account_id:$("pAccount").value,amount:parseFloat($("pAmount").value)||0,payout_date:$("pDate").value,status:$("pStatus").value,note:$("pNote").value.trim()};const {error}=await sb.from("payouts").insert(row);if(error){$("payoutMsg").textContent=error.message;return}e.target.reset();show("payoutModal",false);await loadPayouts();};

async function loadTrades(){
  const {data,error}=await sb.from("trades").select("*").eq("user_id",ownerId()).order("trade_date",{ascending:true});
  if(error){console.error(error);return;}
  trades=data||[]; render(); renderProp(); renderGlobal(); renderCalendar(); setupPerfFilters(); renderPerformance();
}

function render(){
  const total=trades.length, wins=trades.filter(t=>Number(t.pl)>0), losses=trades.filter(t=>Number(t.pl)<0);
  const net=trades.reduce((a,t)=>a+Number(t.pl||0),0);
  const grossWin=wins.reduce((a,t)=>a+Number(t.pl),0), grossLoss=Math.abs(losses.reduce((a,t)=>a+Number(t.pl),0));
  const wr=total?(wins.length/total*100):0;
  $("totalTrades").textContent=total; $("winRate").textContent=wr.toFixed(1)+"%";
  $("netPL").textContent=money(net); $("profitFactor").textContent=grossLoss?(grossWin/grossLoss).toFixed(2):grossWin?"∞":"0.00";
  setValueClass("winRate",wr,"winrate"); setValueClass("netPL",net); setValueClass("profitFactor",grossLoss?grossWin/grossLoss:(grossWin?Infinity:0));
  const eq=[]; let e=0, peak=0, dd=0;
  trades.forEach(t=>{e+=Number(t.pl||0);peak=Math.max(peak,e);dd=Math.max(dd,peak-e);eq.push(e)});
  $("maxDD").textContent=money(-dd); $("equityLabel").textContent=money(e);
  setValueClass("maxDD",-dd); setValueClass("equityLabel",e);
  const days={}; trades.forEach(t=>{const d=new Date(t.trade_date).toISOString().slice(0,10);days[d]=(days[d]||0)+Number(t.pl||0)});
  const bestDay=Math.max(0,...Object.values(days)); $("bestDay").textContent=money(bestDay); setValueClass("bestDay",bestDay);
  const q=$("search").value.toLowerCase();
  const filtered=trades.filter(t=>(t.symbol+" "+(t.strategy||"")+" "+(t.session||"")).toLowerCase().includes(q));
  $("tradeList").innerHTML=filtered.slice().reverse().map(t=>`
    <div class="trade">
      <div><b>${esc(t.symbol)}</b> <span class="pill">${esc(t.side)}</span><small>${new Date(t.trade_date).toLocaleString()}</small></div>
      <div><b class="${Number(t.pl)>=0?"positive":"negative"}">${money(t.pl)}</b>
      <button class="danger" onclick="deleteTrade('${t.id}')">Hapus</button></div>
      <small>${esc(t.strategy||"")} ${esc(t.timeframe||"")} ${esc(t.session||"")}</small>
    </div>`).join("") || `<p class="muted">Belum ada trade.</p>`;
  draw(eq);
}
$("search").oninput=render;

async function deleteTrade(id){
  if(!currentUser){ alert("Silakan login sebagai admin untuk mengubah data."); return; }
  if(!confirm("Hapus trade ini?"))return;
  const {error}=await sb.from("trades").delete().eq("id",id).eq("user_id",ownerId());
  if(error) alert(error.message); else loadTrades();
}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

function draw(data){
  const c=$("equityChart"), dpr=devicePixelRatio||1, w=c.clientWidth||600,h=260;
  c.width=w*dpr;c.height=h*dpr;const x=c.getContext("2d");x.scale(dpr,dpr);x.clearRect(0,0,w,h);
  x.strokeStyle="#27313d";for(let i=1;i<4;i++){let y=i*h/4;x.beginPath();x.moveTo(0,y);x.lineTo(w,y);x.stroke();}
  if(!data.length)return;
  const min=Math.min(0,...data),max=Math.max(0,...data),range=max-min||1;
  x.beginPath();data.forEach((v,i)=>{let px=data.length===1?w/2:i/(data.length-1)*w,py=h-(v-min)/range*h*.8-10;i?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle="#27d39a";x.lineWidth=3;x.stroke();
}

$("exportBtn").onclick=()=>{
  const headers=["date","symbol","side","entry","exit","risk","pl","strategy","timeframe","session","notes"];
  const rows=trades.map(t=>headers.map(h=>`"${String(h==="date"?t.trade_date:t[h]??"").replaceAll('"','""')}"`).join(","));
  const blob=new Blob([[headers.join(","),...rows].join("\n")],{type:"text/csv"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="inzakifx-trades.csv";a.click();URL.revokeObjectURL(a.href);
};
init();

document.querySelectorAll(".navBtn").forEach(btn=>{
  btn.addEventListener("click",e=>{e.preventDefault();openPage(btn.dataset.page);});
});
window.addEventListener("resize",()=>{if(!$("appView")?.classList.contains("hidden")){drawGlobalEquity();drawPerformanceChart(getPerfTrades());}});
