const KEY="inzakifx_trades_v1";
let trades=JSON.parse(localStorage.getItem(KEY)||"[]");

const $=id=>document.getElementById(id);
const money=n=>(n<0?"-$":"$")+Math.abs(n).toFixed(2);
function save(){localStorage.setItem(KEY,JSON.stringify(trades));render();}
function rr(t){return t.risk>0 ? t.pl/t.risk : 0;}

function render(){
  const q=$("search").value.toLowerCase();
  const shown=trades.filter(t=>(t.symbol+" "+t.strategy).toLowerCase().includes(q));
  const wins=trades.filter(t=>t.pl>0), losses=trades.filter(t=>t.pl<0);
  const total=trades.reduce((s,t)=>s+t.pl,0);
  const grossWin=wins.reduce((s,t)=>s+t.pl,0);
  const grossLoss=Math.abs(losses.reduce((s,t)=>s+t.pl,0));
  $("totalTrades").textContent=trades.length;
  $("winRate").textContent=(trades.length?(wins.length/trades.length*100):0).toFixed(1)+"%";
  $("netPL").textContent=money(total);
  $("netPL").className=total>=0?"positive":"negative";
  $("profitFactor").textContent=(grossLoss?grossWin/grossLoss:0).toFixed(2);
  let equity=0,peak=0,maxDD=0;
  [...trades].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(t=>{equity+=t.pl;peak=Math.max(peak,equity);maxDD=Math.min(maxDD,equity-peak)});
  $("maxDD").textContent=money(maxDD);
  $("maxDD").className=maxDD<0?"negative":"positive";
  $("equityStart").textContent=money(0);

  $("tradeTable").innerHTML=shown.map(t=>`<tr>
    <td>${new Date(t.date).toLocaleString("id-ID",{dateStyle:"short",timeStyle:"short"})}</td>
    <td><b>${esc(t.symbol)}</b></td><td><span class="pill ${t.side==="BUY"?"buy":"sell"}">${t.side}</span></td>
    <td>${t.entry}</td><td>${t.exit}</td><td>${money(t.risk)}</td><td>${rr(t).toFixed(2)}R</td>
    <td class="${t.pl>=0?"positive":"negative"}">${money(t.pl)}</td><td>${esc(t.strategy||"-")}</td>
    <td><button class="del" onclick="removeTrade('${t.id}')">Hapus</button></td>
  </tr>`).join("");
  $("empty").style.display=shown.length?"none":"block";
  renderPerformance(wins,losses,total);
  drawChart();
}
function renderPerformance(wins,losses,total){
  const avgWin=wins.length?wins.reduce((s,t)=>s+t.pl,0)/wins.length:0;
  const avgLoss=losses.length?losses.reduce((s,t)=>s+t.pl,0)/losses.length:0;
  const best=trades.length?Math.max(...trades.map(t=>t.pl)):0;
  const worst=trades.length?Math.min(...trades.map(t=>t.pl)):0;
  $("performance").innerHTML=[
    ["Average Win",money(avgWin)],["Average Loss",money(avgLoss)],
    ["Best Trade",money(best)],["Worst Trade",money(worst)],
    ["Winning Trades",wins.length],["Losing Trades",losses.length]
  ].map(x=>`<div class="metric"><span>${x[0]}</span><b class="${String(x[1]).startsWith('-')?'negative':''}">${x[1]}</b></div>`).join("");
}
function drawChart(){
  const c=$("equityChart"),ctx=c.getContext("2d"),dpr=devicePixelRatio||1;
  const w=c.clientWidth,h=c.clientHeight;c.width=w*dpr;c.height=h*dpr;ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h);
  const data=[0];let e=0;
  [...trades].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(t=>{e+=t.pl;data.push(e)});
  const min=Math.min(...data),max=Math.max(...data),range=max-min||1;
  ctx.strokeStyle="#27313d";ctx.lineWidth=1;
  for(let i=1;i<4;i++){let y=i*h/4;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  if(data.length<2)return;
  ctx.beginPath();
  data.forEach((v,i)=>{const x=i*(w-10)/(data.length-1)+5,y=8+(max-v)/range*(h-20);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.strokeStyle="#57d6a2";ctx.lineWidth=2;ctx.stroke();
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function removeTrade(id){if(confirm("Hapus trade ini?")){trades=trades.filter(t=>t.id!==id);save();}}
window.removeTrade=removeTrade;

function openModal(){
  $("modal").classList.remove("hidden");
  const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  $("date").value=d.toISOString().slice(0,16);
}
function closeModal(){$("modal").classList.add("hidden");$("tradeForm").reset();}
$("addTradeTop").onclick=openModal;
$("closeModal").onclick=closeModal;
$("cancelBtn").onclick=closeModal;
$("search").oninput=render;

$("tradeForm").onsubmit=e=>{
  e.preventDefault();
  trades.push({
    id:crypto.randomUUID(),
    date:$("date").value,symbol:$("symbol").value.toUpperCase(),side:$("side").value,
    entry:+$("entry").value,exit:+$("exit").value,risk:+$("risk").value,pl:+$("pl").value,
    strategy:$("strategy").value,timeframe:$("timeframe").value,session:$("session").value,
    notes:$("notes").value
  });
  save();closeModal();
};
$("clearBtn").onclick=()=>{if(trades.length&&confirm("Hapus SEMUA data trade?")){trades=[];save();}};
$("exportBtn").onclick=()=>{
  if(!trades.length){alert("Belum ada data.");return}
  const headers=["date","symbol","side","entry","exit","risk","pl","strategy","timeframe","session","notes"];
  const csv=[headers.join(","),...trades.map(t=>headers.map(h=>`"${String(t[h]??"").replaceAll('"','""')}"`).join(","))].join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="inzakifx-trading-journal.csv";a.click();
};
window.addEventListener("resize",drawChart);
render();