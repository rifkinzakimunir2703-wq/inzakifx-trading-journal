const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let currentUser = null, trades = [], authMode = "login", accounts = [], payouts = [];
let prop = {account:5000,targetPct:6,maxDDPct:4,dailyLossPct:2,consistencyPct:20,buffer:100};

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
  sb.auth.onAuthStateChange(async (_event, session) => {
    if(session) await enterApp(session.user); else exitApp();
  });
}

async function enterApp(user){
  currentUser = user;
  show("authView", false); show("appView", true); show("logoutBtn", true);
  await loadTrades();
  await loadProp();
  await loadAccounts(); await loadPayouts();
}
function exitApp(){
  currentUser = null; trades=[]; show("authView", true); show("appView", false); show("logoutBtn", false);
}

$("loginTab").onclick = () => setAuthMode("login");
$("registerTab").onclick = () => setAuthMode("register");
function setAuthMode(mode){
  authMode=mode;
  $("loginTab").classList.toggle("active", mode==="login");
  $("registerTab").classList.toggle("active", mode==="register");
  document.querySelectorAll(".registerOnly").forEach(e=>e.classList.toggle("hidden",mode!=="register"));
  $("authSubmit").textContent=mode==="login"?"Login":"Register";
  $("authMsg").textContent="";
}

$("authForm").onsubmit = async e => {
  e.preventDefault(); $("authMsg").textContent="Memproses...";
  const email=$("email").value.trim(), password=$("password").value;
  let result;
  if(authMode==="login"){
    result=await sb.auth.signInWithPassword({email,password});
  }else{
    result=await sb.auth.signUp({email,password,options:{data:{display_name:$("displayName").value.trim()}}});
  }
  if(result.error) $("authMsg").textContent=result.error.message;
  else if(authMode==="register") $("authMsg").textContent="Registrasi berhasil. Jika email confirmation aktif, cek email lalu login.";
};

$("logoutBtn").onclick=()=>sb.auth.signOut();
$("addTradeBtn").onclick=()=>show("modal",true);
$("closeModal").onclick=()=>show("modal",false);

$("tradeForm").onsubmit=async e=>{
  e.preventDefault(); $("tradeMsg").textContent="Menyimpan...";
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
  ctx.beginPath();pts.forEach((v,i)=>{const x=i/(pts.length-1)*w,y=h-(v-min)/(max-min)*h;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();
}
["perfAccount","perfStrategy","perfTF","perfSession","perfFrom","perfTo"].forEach(id=>{if($(id))$(id).addEventListener("change",renderPerformance);});
if($("perfReset"))$("perfReset").onclick=()=>{["perfAccount","perfStrategy","perfTF","perfSession","perfFrom","perfTo"].forEach(id=>{if($(id))$(id).value=""});renderPerformance();};

async function loadAccounts(){
  const {data,error}=await sb.from("prop_accounts").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false});
  if(!error) accounts=data||[]; else console.error(error);
  renderAccounts(); renderGlobal(); fillPayoutAccounts(); fillTradeAccounts(); renderCalendar(); setupPerfFilters(); renderPerformance();
}
async function loadPayouts(){
  const {data,error}=await sb.from("payouts").select("*").eq("user_id",currentUser.id).order("payout_date",{ascending:false});
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
    const statusClass=(a.status||"").toLowerCase().replace(" ","");
    return `<div class="panel accountCard">
      <div class="accountTop"><div><h2>${esc(a.firm)}</h2><small>${esc(a.account_name)}</small></div><span class="status ${statusClass}">${esc(a.status)}</span></div>
      <div class="accountMetrics"><div><small>Size</small><b>${money(a.account_size)}</b></div><div><small>Fee</small><b>${money(a.purchase_fee)}</b></div><div><small>Trading P/L</small><b class="${pl>=0?"positive":"negative"}">${money(pl)}</b></div><div><small>Payout</small><b>${money(paid)}</b></div></div>
      <div class="progress"><i style="width:${Math.min(100,Math.max(0,progress))}%"></i></div>
      <small>Target ${Number(a.target_pct)}% · Max DD ${Number(a.max_dd_pct)}% · Daily ${Number(a.daily_loss_pct)}% · Consistency ${Number(a.consistency_pct)}%</small>
      <div class="accountActions"><button class="secondary" onclick="setAccountStatus('${a.id}')">Ubah Status</button><button class="danger" onclick="deleteAccount('${a.id}')">Hapus</button></div>
    </div>`;
  }).join("") || '<p class="muted">Belum ada akun prop firm.</p>';
}
async function setAccountStatus(id){
  const a=accounts.find(x=>x.id===id); if(!a)return;
  const status=prompt("Status baru: Phase 1, Phase 2, Funded, Payout, Failed, Closed",a.status);
  if(!status)return;
  const {error}=await sb.from("prop_accounts").update({status}).eq("id",id).eq("user_id",currentUser.id);
  if(error)alert(error.message);else loadAccounts();
}
async function deleteAccount(id){
  if(!confirm("Hapus akun beserta data terkait?"))return;
  const {error}=await sb.from("prop_accounts").delete().eq("id",id).eq("user_id",currentUser.id);
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
function renderGlobal(){
  const fees=accounts.reduce((s,a)=>s+Number(a.purchase_fee||0),0);
  const pays=payouts.filter(p=>p.status==="Paid").reduce((s,p)=>s+Number(p.amount||0),0);
  const pl=trades.reduce((s,t)=>s+Number(t.pl||0),0);
  $("gAccounts").textContent=accounts.length;$("gFees").textContent=money(fees);$("gPayouts").textContent=money(pays);$("gTradingPL").textContent=money(pl);$("gNet").textContent=money(pays+pl-fees);
  $("gFunded").textContent=accounts.filter(a=>a.status==="Funded"||a.status==="Payout").length;
  $("gEval").textContent=accounts.filter(a=>a.status==="Phase 1"||a.status==="Phase 2").length;
  $("gFailed").textContent=accounts.filter(a=>a.status==="Failed").length;
  const list=$("globalAccountList");if(list)list.innerHTML=accounts.map(a=>{const plA=trades.filter(t=>t.account_id===a.id).reduce((s,t)=>s+Number(t.pl||0),0);const fee=Number(a.purchase_fee||0);const pay=payouts.filter(p=>p.account_id===a.id&&p.status==="Paid").reduce((s,p)=>s+Number(p.amount||0),0);return `<div class="trade"><div><b>${esc(a.firm)} — ${esc(a.account_name)}</b><span class="status">${esc(a.status)}</span></div><small>Trading ${money(plA)} · Payout ${money(pay)} · Fee ${money(fee)} · Net ${money(pay+plA-fee)}</small></div>`}).join("")||'<p class="muted">Belum ada akun.</p>';
  const risk=$("riskMonitor"); if(risk)risk.innerHTML=accounts.map(a=>{const ts=trades.filter(t=>t.account_id===a.id);const plA=ts.reduce((s,t)=>s+Number(t.pl||0),0);const limit=Number(a.account_size)*Number(a.max_dd_pct)/100;const used=limit?Math.max(0,-plA)/limit*100:0;return `<div class="trade"><div><b>${esc(a.firm)} — ${esc(a.account_name)}</b><b>${used.toFixed(1)}% DD used</b></div><div class="progress"><i style="width:${Math.min(100,used)}%"></i></div></div>`}).join("")||'<p class="muted">Belum ada akun.</p>';
}
function renderCalendar(){
  const box=$("calendarGrid");if(!box)return;
  const now=new Date(), y=now.getFullYear(), m=now.getMonth(), first=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate();
  const names=["Min","Sen","Sel","Rab","Kam","Jum","Sab"];let h=names.map(n=>`<div class="calHead">${n}</div>`).join("");
  for(let i=0;i<first;i++)h+="<div></div>";
  for(let d=1;d<=days;d++){const key=new Date(y,m,d).toISOString().slice(0,10);const dayPL=trades.filter(t=>new Date(t.trade_date).toISOString().slice(0,10)===key).reduce((s,t)=>s+Number(t.pl||0),0);h+=`<button type="button" class="calDay ${dayPL>0?"calWin":dayPL<0?"calLoss":""}" data-date="${key}"><b>${d}</b><small>${dayPL?money(dayPL):"—"}</small></button>`}
  box.innerHTML=h;
}
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

$("addAccountBtn").onclick=()=>show("accountModal",true);$("closeAccountModal").onclick=()=>show("accountModal",false);
$("addPayoutBtn").onclick=()=>{fillPayoutAccounts();show("payoutModal",true)};$("closePayoutModal").onclick=()=>show("payoutModal",false);
$("accountForm").onsubmit=async e=>{e.preventDefault();const n=id=>parseFloat($(id).value)||0;const row={user_id:currentUser.id,firm:$("aFirm").value.trim(),account_name:$("aName").value.trim(),account_size:n("aSize"),purchase_fee:n("aFee"),status:$("aStatus").value,target_pct:n("aTarget"),max_dd_pct:n("aMaxDD"),daily_loss_pct:n("aDaily"),consistency_pct:n("aConsistency"),start_date:$("aStart").value||null,notes:$("aNotes").value.trim()};const {error}=await sb.from("prop_accounts").insert(row);if(error){$("accountMsg").textContent=error.message;return}e.target.reset();show("accountModal",false);await loadAccounts();};
$("payoutForm").onsubmit=async e=>{e.preventDefault();const row={user_id:currentUser.id,account_id:$("pAccount").value,amount:parseFloat($("pAmount").value)||0,payout_date:$("pDate").value,status:$("pStatus").value,note:$("pNote").value.trim()};const {error}=await sb.from("payouts").insert(row);if(error){$("payoutMsg").textContent=error.message;return}e.target.reset();show("payoutModal",false);await loadPayouts();};

async function loadTrades(){
  const {data,error}=await sb.from("trades").select("*").eq("user_id",currentUser.id).order("trade_date",{ascending:true});
  if(error){console.error(error);return;}
  trades=data||[]; render(); renderProp(); renderGlobal(); renderCalendar(); setupPerfFilters(); renderPerformance();
}

function render(){
  const total=trades.length, wins=trades.filter(t=>Number(t.pl)>0), losses=trades.filter(t=>Number(t.pl)<0);
  const net=trades.reduce((a,t)=>a+Number(t.pl||0),0);
  const grossWin=wins.reduce((a,t)=>a+Number(t.pl),0), grossLoss=Math.abs(losses.reduce((a,t)=>a+Number(t.pl),0));
  $("totalTrades").textContent=total; $("winRate").textContent=total?(wins.length/total*100).toFixed(1)+"%":"0%";
  $("netPL").textContent=money(net); $("profitFactor").textContent=grossLoss?(grossWin/grossLoss).toFixed(2):grossWin?"∞":"0.00";
  const eq=[]; let e=0, peak=0, dd=0;
  trades.forEach(t=>{e+=Number(t.pl||0);peak=Math.max(peak,e);dd=Math.max(dd,peak-e);eq.push(e)});
  $("maxDD").textContent=money(-dd); $("equityLabel").textContent=money(e);
  const days={}; trades.forEach(t=>{const d=new Date(t.trade_date).toISOString().slice(0,10);days[d]=(days[d]||0)+Number(t.pl||0)});
  $("bestDay").textContent=money(Math.max(0,...Object.values(days)));
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
  if(!confirm("Hapus trade ini?"))return;
  const {error}=await sb.from("trades").delete().eq("id",id).eq("user_id",currentUser.id);
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
