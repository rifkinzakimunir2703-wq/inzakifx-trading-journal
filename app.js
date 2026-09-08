(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const money = n => `${Number(n||0)<0?'-':''}$${Math.abs(Number(n)||0).toFixed(2)}`;
  const esc = v => String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  // Support BOTH styles of config.js: classic `const` globals and `window.*` globals.
  const getUrl = () => (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : (window.SUPABASE_URL || ''));
  const getPublishable = () => (typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined' ? SUPABASE_PUBLISHABLE_KEY : (window.SUPABASE_PUBLISHABLE_KEY || ''));
  const getAnon = () => (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : (window.SUPABASE_ANON_KEY || ''));
  const key = () => getPublishable() || getAnon() || '';
  const cfg = () => getUrl() && key() && window.supabase;
  async function makeClient(url, k){ return window.supabase.createClient(url, k); }
  async function connectSupabase(){
    if(window.supabase && Array.isArray(window.INZAKI_SUPABASE_CANDIDATES)){
      for(const c of window.INZAKI_SUPABASE_CANDIDATES){
        try{
          const client=await makeClient(c.url,c.publishable);
          const probe=await client.from('portal_public_owner').select('owner_id').eq('id',true).maybeSingle();
          if(!probe.error){ window.__INZAKI_SUPABASE__={url:c.url,key:c.publishable}; return client; }
          const probe2=await client.from('trades').select('id',{count:'exact',head:true});
          if(!probe2.error){ window.__INZAKI_SUPABASE__={url:c.url,key:c.publishable}; return client; }
        }catch(e){}
      }
    }
    if(cfg()){ window.__INZAKI_SUPABASE__={url:getUrl(),key:key()}; return window.supabase.createClient(getUrl(),key()); }
    return null;
  }
  let sb=null, user=null, ownerId=null, trades=[], accounts=[], payouts=[], eaTrades=[], eaSnapshots=[];
  let monthCursor=new Date(); let editingAccount=null; let eaTimer=null;

  function show(id,on=true){ const el=$(id); if(el) el.classList.toggle('hidden',!on); }
  function msg(id,text){ if($(id)) $(id).textContent=text||''; }
  function valueClass(id,val){const e=$(id);if(!e)return;e.classList.remove('positive','negative');if(Number(val)>0)e.classList.add('positive');if(Number(val)<0)e.classList.add('negative');}
  function setStatus(text){const b=$('statusBar');if(!b)return;if(text){b.textContent=text;b.classList.remove('hidden')}else b.classList.add('hidden');}
  function fail(text){console.error(text);setStatus(text);}

  async function init(){
    bindUI();
    sb=await connectSupabase();
    if(!sb){ fail('Supabase belum terhubung. Pastikan config.js tersedia dan berisi konfigurasi Supabase yang benar.'); return; }
    try{
      const {data,error}=await sb.auth.getSession();
      if(error) throw error;
      await applySession(data.session);
      sb.auth.onAuthStateChange((_event,session)=>{ setTimeout(()=>applySession(session),0); });
    }catch(e){fail('Gagal membaca sesi Supabase: '+(e.message||e));}
  }

  async function applySession(session){
    user=session?.user||null;
    updateHeader();
    if(user){
      ownerId=user.id;
      setStatus('Admin mode aktif — data yang ditampilkan hanya milik akun login.');
      await loadAll(true);
      openPage('global');
    }else{
      await resolvePublicOwner();
      await loadAll(false);
      openPage('journal');
      setStatus(ownerId?'View Only — data publik aktif.':'View Only belum dikonfigurasi: portal_public_owner belum memiliki owner.');
    }
    updateAdminUI();
  }

  async function resolvePublicOwner(){
    ownerId=null;
    try{
      const {data,error}=await sb.from('portal_public_owner').select('owner_id').eq('id',true).maybeSingle();
      if(error) throw error;
      ownerId=data?.owner_id||null;
    }catch(e){ console.warn(e); }
  }

  async function loadAll(isAdmin){
    trades=[];accounts=[];payouts=[];
    if(!ownerId){renderAll();return;}
    await Promise.all([loadTrades(),loadAccounts(),loadPayouts()]);
    renderAll();
    if(isAdmin) await loadPropSilently();
  }
  async function loadTrades(){
    const {data,error}=await sb.from('trades').select('*').eq('user_id',ownerId).order('trade_date',{ascending:true});
    if(error){fail('Gagal membaca trades: '+error.message);return} trades=data||[];
  }
  async function loadAccounts(){
    const {data,error}=await sb.from('prop_accounts').select('*').eq('user_id',ownerId).order('created_at',{ascending:false});
    if(error){console.warn('accounts',error);return} accounts=data||[];
  }
  async function loadPayouts(){
    const {data,error}=await sb.from('payouts').select('*').eq('user_id',ownerId).order('payout_date',{ascending:false});
    if(error){console.warn('payouts',error);return} payouts=data||[];
  }
  async function loadPropSilently(){ /* optional legacy profiles data; no dashboard dependency */ }

  function updateHeader(){show('loginOpen',!user);show('logout',!!user)}
  function updateAdminUI(){document.querySelectorAll('.adminOnly').forEach(e=>e.classList.toggle('hidden',!user));}

  window.openPage = openPage;
  function openPage(id){
    document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
    document.querySelectorAll('.navBtn').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
    $(id)?.classList.remove('hidden');
    if(id==='performance')renderPerformance();
    if(id==='accounts')renderAccounts();
    if(id==='payouts')renderPayouts();
    if(id==='calendar')renderCalendar();
    if(id==='journal')renderJournal();
    if(id==='ea')loadEA();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function renderAll(){renderGlobal();renderPerformance();renderAccounts();renderPayouts();renderCalendar();renderJournal();fillAccountSelects();}
  function stats(rows){
    const vals=rows.map(t=>Number(t.pl)||0), wins=vals.filter(v=>v>0), losses=vals.filter(v=>v<0), gp=wins.reduce((a,v)=>a+v,0), gl=Math.abs(losses.reduce((a,v)=>a+v,0));
    let eq=0,peak=0,dd=0;vals.forEach(v=>{eq+=v;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)});
    return {n:vals.length,w:wins.length,l:losses.length,gp,gl,wr:vals.length?wins.length/vals.length*100:0,pf:gl?gp/gl:0,net:eq,dd,avgW:wins.length?gp/wins.length:0,avgL:losses.length?gl/losses.length:0,exp:vals.length?eq/vals.length:0};
  }
  function renderGlobal(){
    const s=stats(trades), fees=accounts.reduce((a,x)=>a+Number(x.purchase_fee||0),0), pay=payouts.filter(x=>String(x.status).toLowerCase()==='paid').reduce((a,x)=>a+Number(x.amount||0),0);
    setText('gPL',money(s.net));setText('gWR',s.wr.toFixed(1)+'%');setText('gTrades',s.n);setText('gPF',s.pf.toFixed(2));setText('gFees',money(-fees));setText('gPayout',money(pay));setText('gNet',money(pay-fees));setText('gAccounts',accounts.length);valueClass('gPL',s.net);valueClass('gNet',pay-fees);drawChart($('equity'),trades);setText('equityLabel',money(s.net));
    $('accountOverview').innerHTML=accounts.map(a=>{const pl=trades.filter(t=>t.account_id===a.id).reduce((x,t)=>x+Number(t.pl||0),0);return `<div class="overviewRow"><div><b>${esc(a.firm||'')}</b><small class="muted">${esc(a.account_name||'')}</small></div><div><b class="${pl>=0?'positive':'negative'}">${money(pl)}</b><span class="status">${esc(a.status||'—')}</span></div></div>`}).join('')||'<p class="muted">Belum ada akun.</p>';
  }
  function setText(id,v){if($(id))$(id).textContent=v}
  function drawChart(c,rows){if(!c)return;const dpr=devicePixelRatio||1,w=c.clientWidth||600,h=250;c.width=w*dpr;c.height=h*dpr;const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);if(!rows.length)return;let eq=0;const pts=[0];rows.forEach(t=>{eq+=Number(t.pl)||0;pts.push(eq)});let min=Math.min(...pts,0),max=Math.max(...pts,0);if(min===max){min-=1;max+=1}const X=i=>i/(pts.length-1)*w,Y=v=>h-12-(v-min)/(max-min)*(h-24);x.strokeStyle='#27313d';x.lineWidth=1;for(let i=1;i<4;i++){x.beginPath();x.moveTo(0,i*h/4);x.lineTo(w,i*h/4);x.stroke()}x.beginPath();pts.forEach((v,i)=>i?x.lineTo(X(i),Y(v)):x.moveTo(X(i),Y(v)));x.strokeStyle='#35d07f';x.lineWidth=2.5;x.stroke()}

  function setupFilters(){
    fillSelect('fAccount',accounts.map(a=>({v:a.id,t:`${a.firm} — ${a.account_name}`})),'Semua akun');
    fillSelect('fStrategy',uniq(trades.map(t=>t.strategy)),'Semua strategi');fillSelect('fTF',uniq(trades.map(t=>t.timeframe)),'Semua timeframe');fillSelect('fSession',uniq(trades.map(t=>t.session)),'Semua session');
  }
  function fillSelect(id,items,first){const s=$(id);if(!s)return;const old=s.value;s.innerHTML=`<option value="">${esc(first)}</option>`+(items||[]).map(i=>typeof i==='object'?`<option value="${esc(i.v)}">${esc(i.t)}</option>`:`<option value="${esc(i)}">${esc(i)}</option>`).join('');if([...s.options].some(o=>o.value===old))s.value=old}
  const uniq=a=>[...new Set(a.filter(Boolean))].sort();
  function filteredTrades(){const aid=$('fAccount')?.value||'',st=$('fStrategy')?.value||'',tf=$('fTF')?.value||'',se=$('fSession')?.value||'',from=$('fFrom')?.value||'',to=$('fTo')?.value||'';return trades.filter(t=>{const d=String(t.trade_date||'').slice(0,10);return(!aid||t.account_id===aid)&&(!st||t.strategy===st)&&(!tf||t.timeframe===tf)&&(!se||t.session===se)&&(!from||d>=from)&&(!to||d<=to)})}
  function renderPerformance(){setupFilters();const ts=filteredTrades(),s=stats(ts);setText('pTrades',s.n);setText('pWR',s.wr.toFixed(1)+'%');setText('pPL',money(s.net));setText('pPF',s.pf.toFixed(2));setText('pAvgW',money(s.avgW));setText('pAvgL',money(-s.avgL));setText('pExp',money(s.exp));setText('pDD',money(-s.dd));setText('pEq',money(s.net));valueClass('pPL',s.net);drawChart($('perfChart'),ts);groupBox('byAccount',ts,t=>{const a=accounts.find(x=>x.id===t.account_id);return a?`${a.firm} — ${a.account_name}`:'Tanpa akun'});groupBox('byStrategy',ts,t=>t.strategy||'Tanpa strategi');groupBox('byTF',ts,t=>t.timeframe||'Tanpa TF');groupBox('bySession',ts,t=>t.session||'Tanpa session')}
  function groupBox(id,rows,keyFn){const map={};rows.forEach(t=>{const k=keyFn(t),v=Number(t.pl)||0;if(!map[k])map[k]={n:0,w:0,l:0,pl:0};map[k].n++;map[k].pl+=v;if(v>0)map[k].w++;if(v<0)map[k].l++});$(id).innerHTML=Object.entries(map).sort((a,b)=>b[1].pl-a[1].pl).map(([k,v])=>`<div class="trade"><div><b>${esc(k)}</b><span>${v.n?((v.w/v.n)*100).toFixed(1):0}% WR</span></div><small>${v.n} trade · ${v.w}W / ${v.l}L · <b class="${v.pl>=0?'positive':'negative'}">${money(v.pl)}</b></small></div>`).join('')||'<p class="muted">Belum ada data.</p>'}

  function fillAccountSelects(){const opts=accounts.map(a=>({v:a.id,t:`${a.firm} — ${a.account_name}`}));fillSelect('tAccount',opts,'Pilih akun');fillSelect('pAccount',opts,'Pilih akun')}
  function renderAccounts(){$('accountsList').innerHTML=accounts.map(a=>{const rows=trades.filter(t=>t.account_id===a.id),pl=rows.reduce((s,t)=>s+Number(t.pl||0),0),target=Number(a.account_size||0)*Number(a.target_pct||0)/100,progress=target?Math.max(0,Math.min(100,pl/target*100)):0;return `<article class="panel accountCard"><div class="accountTop"><div><h2>${esc(a.firm)}</h2><small>${esc(a.account_name)}</small></div><span class="status">${esc(a.status||'—')}</span></div><div class="metricGrid"><div><small>Size</small><b>${money(a.account_size)}</b></div><div><small>Fee</small><b class="negative">${money(-Number(a.purchase_fee||0))}</b></div><div><small>Trading P/L</small><b class="${pl>=0?'positive':'negative'}">${money(pl)}</b></div><div><small>Target</small><b>${Number(a.target_pct||0)}%</b></div><div><small>Max DD</small><b>${Number(a.max_dd_pct||0)}%</b></div><div><small>Consistency</small><b>${Number(a.consistency_pct||0)}%</b></div></div><div class="progress"><i style="width:${progress}%"></i></div><div class="accountActions adminOnly"><button class="secondary" data-edit-account="${a.id}">Edit</button><button class="secondary" data-status-account="${a.id}">Status</button><button class="secondary" data-delete-account="${a.id}">Hapus</button></div></article>`}).join('')||'<div class="panel"><b>Belum ada akun Prop Firm.</b><p class="muted">Login admin untuk menambahkan akun.</p></div>';updateAdminUI()}
  function renderPayouts(){$('payoutList').innerHTML=payouts.map(p=>{const a=accounts.find(x=>x.id===p.account_id);return `<div class="trade"><div><b>${money(p.amount)}</b><span class="tag">${esc(p.status)}</span></div><small>${esc(a?.firm||'')} — ${esc(a?.account_name||'')} · ${esc(p.payout_date||'')}</small><small>${esc(p.note||'')}</small></div>`}).join('')||'<p class="muted">Belum ada payout.</p>'}
  function renderJournal(){const s=stats(trades);setText('jTrades',s.n);setText('jWR',s.wr.toFixed(1)+'%');setText('jPL',money(s.net));setText('jDD',money(-s.dd));valueClass('jPL',s.net);const q=($('search')?.value||'').toLowerCase();const rows=trades.slice().reverse().filter(t=>`${t.symbol||''} ${t.strategy||''} ${t.session||''}`.toLowerCase().includes(q));$('journalList').innerHTML=rows.map(t=>`<div class="trade"><div><b>${esc(t.symbol)}</b> <span class="tag">${esc(t.side)}</span><small>${new Date(t.trade_date).toLocaleString('id-ID')}</small></div><div><b class="${Number(t.pl)>=0?'positive':'negative'}">${money(t.pl)}</b>${user?` <button class="secondary" data-delete-trade="${t.id}">Hapus</button>`:''}</div><small>${esc(t.strategy||'')} · ${esc(t.timeframe||'')} · ${esc(t.session||'')}</small></div>`).join('')||'<p class="muted">Belum ada trade.</p>'}
  function renderCalendar(){const y=monthCursor.getFullYear(),m=monthCursor.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();$('monthTitle').textContent=new Date(y,m,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});let h=['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(x=>`<div class="calHead">${x}</div>`).join('');for(let i=0;i<first;i++)h+='<div></div>';for(let d=1;d<=days;d++){const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,pl=trades.filter(t=>String(t.trade_date||'').slice(0,10)===key).reduce((s,t)=>s+Number(t.pl||0),0);h+=`<button class="calDay ${pl>0?'calWin':pl<0?'calLoss':''} ${key===new Date().toISOString().slice(0,10)?'calToday':''}" data-date="${key}"><b>${d}</b><small>${pl?money(pl):'—'}</small></button>`}$('calendarGrid').innerHTML=h}

  async function saveTrade(e){e.preventDefault();if(!user)return msg('tradeMsg','Login admin diperlukan.');msg('tradeMsg','Menyimpan...');const row={user_id:user.id,account_id:$('tAccount').value||null,trade_date:new Date().toISOString(),symbol:$('tSymbol').value.trim().toUpperCase(),side:$('tSide').value,entry:num('tEntry'),exit:num('tExit'),risk:num('tRisk'),pl:num('tPL'),strategy:$('tStrategy').value.trim(),timeframe:$('tTF').value.trim(),session:$('tSession').value.trim(),notes:$('tNotes').value.trim()};const {error}=await sb.from('trades').insert(row);if(error){msg('tradeMsg',error.message);return}$('tradeForm').reset();show('tradeModal',false);await loadAll(true)}
  async function saveAccount(e){e.preventDefault();if(!user)return msg('accountMsg','Login admin diperlukan.');msg('accountMsg','Menyimpan...');const row={firm:$('aFirm').value.trim(),account_name:$('aName').value.trim(),account_size:num('aSize'),purchase_fee:num('aFee'),status:$('aStatus').value,target_pct:num('aTarget'),max_dd_pct:num('aDD'),daily_loss_pct:num('aDaily'),consistency_pct:num('aCons'),start_date:$('aStart').value||null,notes:$('aNotes').value.trim()};let q=editingAccount?sb.from('prop_accounts').update(row).eq('id',editingAccount).eq('user_id',user.id):sb.from('prop_accounts').insert({...row,user_id:user.id});const {error}=await q;if(error){msg('accountMsg',error.message);return}editingAccount=null;$('accountForm').reset();show('accountModal',false);await loadAll(true)}
  async function savePayout(e){e.preventDefault();if(!user)return msg('payoutMsg','Login admin diperlukan.');msg('payoutMsg','Menyimpan...');const row={user_id:user.id,account_id:$('pAccount').value,amount:num('pAmount'),payout_date:$('pDate').value,status:$('pStatus').value,note:$('pNote').value.trim()};const {error}=await sb.from('payouts').insert(row);if(error){msg('payoutMsg',error.message);return}$('payoutForm').reset();show('payoutModal',false);await loadAll(true)}
  const num=id=>{const n=parseFloat($(id)?.value);return Number.isFinite(n)?n:0};

  async function deleteTrade(id){if(!user)return; if(!confirm('Hapus trade ini?'))return;const {error}=await sb.from('trades').delete().eq('id',id).eq('user_id',user.id);if(error)alert(error.message);else await loadAll(true)}
  async function editAccount(id){const a=accounts.find(x=>x.id===id);if(!a)return;editingAccount=id;$('aFirm').value=a.firm||'';$('aName').value=a.account_name||'';$('aSize').value=a.account_size??'';$('aFee').value=a.purchase_fee??0;$('aStatus').value=a.status||'Phase 1';$('aTarget').value=a.target_pct??6;$('aDD').value=a.max_dd_pct??4;$('aDaily').value=a.daily_loss_pct??2;$('aCons').value=a.consistency_pct??20;$('aStart').value=a.start_date||'';$('aNotes').value=a.notes||'';show('accountModal',true)}
  async function changeStatus(id){const a=accounts.find(x=>x.id===id);if(!a)return;const s=prompt('Status: Phase 1, Phase 2, Funded, Payout, Failed, Closed',a.status||'Phase 1');if(!s)return;const {error}=await sb.from('prop_accounts').update({status:s}).eq('id',id).eq('user_id',user.id);if(error)alert(error.message);else await loadAll(true)}
  async function removeAccount(id){if(!confirm('Hapus akun ini? Data trade tidak ikut dihapus.'))return;const {error}=await sb.from('prop_accounts').delete().eq('id',id).eq('user_id',user.id);if(error)alert(error.message);else await loadAll(true)}

  async function loadEA(){
    if(!sb){return}
    const [tradeRes,snapRes]=await Promise.all([
      sb.from('ea_trades_public').select('*').order('time',{ascending:false}).limit(500),
      sb.from('ea_account_snapshots_public').select('*').order('time',{ascending:false}).limit(500)
    ]);
    if(tradeRes.error){
      eaTrades=[];
      $('eaBody').innerHTML=`<tr><td colspan="8" class="muted center">EA table belum siap: ${esc(tradeRes.error.message)}</td></tr>`;
    } else eaTrades=tradeRes.data||[];
    if(snapRes.error){
      eaSnapshots=[];
      console.warn('EA snapshots:',snapRes.error.message);
    } else eaSnapshots=snapRes.data||[];
    renderEA();
    if(eaTimer)clearTimeout(eaTimer);
    eaTimer=setTimeout(()=>{if(!$('ea').classList.contains('hidden'))loadEA()},15000)
  }

  function latestSnapshot(account){
    return eaSnapshots.find(x=>String(x.account??'').trim()===String(account??'').trim())||null;
  }

  function eaAccountKey(x){return String(x.account??'').trim() || 'Unknown';}
  function eaAccountsData(){
    const map=new Map();
    for(const x of eaTrades){
      const key=eaAccountKey(x);
      if(!map.has(key))map.set(key,{account:key,broker:x.broker||'—',symbol:x.symbol||'—',last:x.time?new Date(x.time).getTime():0,rows:[]});
      const a=map.get(key); a.rows.push(x);
      const tm=x.time?new Date(x.time).getTime():0; if(tm>a.last){a.last=tm;a.broker=x.broker||a.broker;a.symbol=x.symbol||a.symbol}
    }
    for(const x of eaSnapshots){
      const key=eaAccountKey(x);
      if(!map.has(key))map.set(key,{account:key,broker:x.broker||'—',symbol:x.symbol||'—',last:x.time?new Date(x.time).getTime():0,rows:[]});
      const a=map.get(key); const tm=x.time?new Date(x.time).getTime():0;
      if(tm>a.last){a.last=tm;a.broker=x.broker||a.broker;a.symbol=x.symbol||a.symbol}
    }
    return [...map.values()].sort((a,b)=>b.last-a.last);
  }

  function isClosedEA(x){const e=String(x.event||'').toLowerCase();return e.includes('close')||e.includes('result')||e.includes('closed');}

  function renderEAAccounts(){
    const list=eaAccountsData();
    const filter=$('eaAccountFilter')?.value||'';
    if($('eaAccountFilter')){
      const old=filter;
      $('eaAccountFilter').innerHTML='<option value="">Semua akun</option>'+list.map(a=>`<option value="${esc(a.account)}">${esc(a.account)}${a.broker&&a.broker!=='—'?' · '+esc(a.broker):''}</option>`).join('');
      $('eaAccountFilter').value=list.some(a=>a.account===old)?old:'';
    }
    if(!list.length){$('eaAccounts').innerHTML='<div class="emptyState">Belum ada akun EA. Setelah EA mengirim trade, akun MT5 akan muncul otomatis di sini.</div>';return}
    $('eaAccounts').innerHTML=list.map(a=>{
      const closed=a.rows.filter(isClosedEA); const st=stats(closed.map(x=>({pl:Number(x.profit||0)})));
      const snap=latestSnapshot(a.account);
      const snapTime=snap?.time?new Date(snap.time).getTime():0;
      const activity=Math.max(a.last||0,snapTime);
      const online=activity>0 && Date.now()-activity<=3*60*1000;
      const pnl=closed.reduce((z,x)=>z+Number(x.profit||0),0);
      const lastTrade=a.rows[0];
      const balance=snap?Number(snap.balance||0):0, equity=snap?Number(snap.equity||0):0;
      const ddPct=(balance>0&&equity<balance)?((balance-equity)/balance*100):0;
      return `<article class="eaAccountCard ${online?'eaOnline':'eaOffline'}" data-ea-account-card="${esc(a.account)}">
        <div class="eaAccountTop"><div><div class="eaAccountName">${esc(a.account)}</div><small>${esc(snap?.broker||a.broker)} · ${esc(snap?.symbol||a.symbol)}</small></div><span class="eaStatus ${online?'online':'offline'}"><i></i>${online?'ONLINE':'OFFLINE'}</span></div>
        <div class="eaMiniGrid"><div><small>Balance</small><b>${money(balance)}</b></div><div><small>Equity</small><b>${money(equity)}</b></div><div><small>Today P/L</small><b class="${Number(snap?.today_pl||0)>=0?'positive':'negative'}">${money(snap?.today_pl||0)}</b></div><div><small>Floating</small><b class="${Number(snap?.floating_profit||0)>=0?'positive':'negative'}">${money(snap?.floating_profit||0)}</b></div><div><small>Trades</small><b>${closed.length}</b></div><div><small>Win Rate</small><b>${st.wr.toFixed(1)}%</b></div><div><small>PF</small><b>${st.pf.toFixed(2)}</b></div><div><small>DD Est.</small><b>${ddPct.toFixed(1)}%</b></div></div>
        <div class="eaMLLine"><span>ML ${(Number(snap?.ml_probability||0)*100).toFixed(1)}%</span><span>Risk ×${Number(snap?.adaptive_risk||1).toFixed(2)}</span><span>Samples ${Number(snap?.ml_samples||0)}</span><span>WF ${snap?.wf_enabled?'ON':'OFF'} ${Number(snap?.wf_valid_folds||0)}/${Number(snap?.wf_folds||0)}</span></div>
        <div class="eaAccountFoot"><span>Last: ${lastTrade?.event?esc(lastTrade.event):esc(snap?.event||'—')}</span><span>${activity?new Date(activity).toLocaleString('id-ID'):'—'}</span></div>
      </article>`
    }).join('')
  }

  function renderEA(){
    const closed=eaTrades.filter(isClosedEA); const s=stats(closed.map(x=>({pl:Number(x.profit||0)})));
    setText('eaTrades',closed.length);setText('eaWR',s.wr.toFixed(1)+'%');setText('eaPL',money(s.net));setText('eaPF',s.pf.toFixed(2));
    const latest=[...eaTrades,...eaSnapshots].filter(x=>x?.time).sort((a,b)=>new Date(b.time)-new Date(a.time))[0];
    if(latest){setText('eaLast',latest.event||'—');setText('eaSide',latest.type||'—');setText('eaSymbol',latest.symbol||'—');setText('eaTime',new Date(latest.time).toLocaleString('id-ID'));setText('eaBadge',latest.event||'LIVE');document.querySelector('.live')?.classList.add('online');setText('liveText','ONLINE')}
    else {document.querySelector('.live')?.classList.remove('online');setText('liveText','WAITING');}
    renderEAAccounts();
    const filter=$('eaAccountFilter')?.value||''; const rows=filter?eaTrades.filter(x=>eaAccountKey(x)===filter):eaTrades;
    setText('eaFilterLabel',filter?`AKUN ${filter}`:'SEMUA AKUN');
    $('eaBody').innerHTML=rows.map(x=>`<tr><td>${x.time?esc(new Date(x.time).toLocaleString('id-ID')):'—'}</td><td><b>${esc(eaAccountKey(x))}</b></td><td>${esc(x.broker||'—')}</td><td>${esc(x.event||'—')}</td><td>${esc(x.symbol||'—')}</td><td>${esc(x.type||'—')}</td><td>${x.price??'—'}</td><td class="${Number(x.profit)>=0?'positive':'negative'}">${money(x.profit)}</td></tr>`).join('')||'<tr><td colspan="8" class="muted center">Belum ada data EA untuk akun ini.</td></tr>'
  }

  function exportCSV(){const headers=['trade_date','symbol','side','entry','exit','risk','pl','strategy','timeframe','session','notes'];const rows=trades.map(t=>headers.map(h=>`"${String(t[h]??'').replaceAll('"','""')}"`).join(','));const blob=new Blob([[headers.join(','),...rows].join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='inzakitrade-journal.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}

  function bindUI(){
    $('loginOpen')?.addEventListener('click',()=>{show('loginModal',true);$('email')?.focus()});$('logout')?.addEventListener('click',()=>sb.auth.signOut());
    $('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();msg('loginMsg','Login...');const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)msg('loginMsg',error.message);else show('loginModal',false)});
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.close,false)));
    document.querySelectorAll('.navBtn').forEach(b=>b.addEventListener('click',()=>openPage(b.dataset.page)));
    ['fAccount','fStrategy','fTF','fSession','fFrom','fTo'].forEach(id=>$(id)?.addEventListener('change',renderPerformance));$('fReset')?.addEventListener('click',()=>{['fAccount','fStrategy','fTF','fSession','fFrom','fTo'].forEach(id=>{if($(id))$(id).value=''});renderPerformance()});
    $('search')?.addEventListener('input',renderJournal);$('eaAccountFilter')?.addEventListener('change',renderEA);$('export')?.addEventListener('click',exportCSV);['quickTrade','journalAdd'].forEach(id=>$(id)?.addEventListener('click',()=>{fillAccountSelects();show('tradeModal',true)}));
    $('tradeForm')?.addEventListener('submit',saveTrade);$('addAccount')?.addEventListener('click',()=>{editingAccount=null;$('accountForm').reset();show('accountModal',true)});$('accountForm')?.addEventListener('submit',saveAccount);$('addPayout')?.addEventListener('click',()=>{fillAccountSelects();show('payoutModal',true)});$('payoutForm')?.addEventListener('submit',savePayout);
    $('prevMonth')?.addEventListener('click',()=>{monthCursor.setMonth(monthCursor.getMonth()-1);renderCalendar()});$('nextMonth')?.addEventListener('click',()=>{monthCursor.setMonth(monthCursor.getMonth()+1);renderCalendar()});$('todayMonth')?.addEventListener('click',()=>{monthCursor=new Date();renderCalendar()});
    document.addEventListener('click',e=>{const d=e.target.closest('[data-delete-trade]');if(d)deleteTrade(d.dataset.deleteTrade);const ed=e.target.closest('[data-edit-account]');if(ed)editAccount(ed.dataset.editAccount);const st=e.target.closest('[data-status-account]');if(st)changeStatus(st.dataset.statusAccount);const del=e.target.closest('[data-delete-account]');if(del)removeAccount(del.dataset.deleteAccount);const day=e.target.closest('[data-date]');if(day){const date=day.dataset.date;$('fFrom').value=date;$('fTo').value=date;openPage('performance')}});
  }
  window.openPage=openPage;
  document.addEventListener('DOMContentLoaded',init);
})();
