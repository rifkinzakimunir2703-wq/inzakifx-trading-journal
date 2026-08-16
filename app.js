const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let currentUser = null, trades = [], authMode = "login";

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
};
function num(id){const v=parseFloat($(id).value); return Number.isFinite(v)?v:0;}

async function loadTrades(){
  const {data,error}=await sb.from("trades").select("*").eq("user_id",currentUser.id).order("trade_date",{ascending:true});
  if(error){console.error(error);return;}
  trades=data||[]; render();
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
