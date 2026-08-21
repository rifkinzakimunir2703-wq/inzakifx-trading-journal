/* =========================================================
   INZAKI TRADING JOURNAL
   ADMIN LOGIN + PUBLIC VIEW ONLY
   ========================================================= */

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let trades = [];
let accounts = [];
let payouts = [];

let authMode = "login";
let editingAccountId = null;
let calendarCursor = new Date();

let prop = {
  account: 5000,
  targetPct: 6,
  maxDDPct: 4,
  dailyLossPct: 2,
  consistencyPct: 20,
  buffer: 100
};

/* =========================================================
   HELPERS
   ========================================================= */

const $ = id => document.getElementById(id);

const money = n => {
  const v = Number(n) || 0;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
};

function num(id) {
  const el = $(id);
  if (!el) return 0;

  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : 0;
}

function show(id, yes = true) {
  const el = $(id);
  if (!el) return;

  el.classList.toggle("hidden", !yes);
}

function esc(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m])
  );
}

function setValueClass(id, value, mode = "normal") {
  const el = $(id);
  if (!el) return;

  el.classList.remove(
    "positive",
    "negative",
    "neutralValue"
  );

  if (mode === "winrate") {
    el.classList.add(
      Number(value) >= 50
        ? "positive"
        : "negative"
    );
  } else if (Number(value) > 0) {
    el.classList.add("positive");
  } else if (Number(value) < 0) {
    el.classList.add("negative");
  } else {
    el.classList.add("neutralValue");
  }
}

/* =========================================================
   SECURITY / MODE
   ========================================================= */

function isAdmin() {
  return !!currentUser;
}

function requireAdmin() {
  if (!currentUser) {
    showAdminLogin();
    return false;
  }

  return true;
}

/* =========================================================
   INJECT ADMIN LOGIN BUTTON
   ========================================================= */

function setupAdminLoginButton() {

  let btn = $("adminLoginBtn");

  /*
     Kalau HTML sudah punya adminLoginBtn,
     kita pakai yang sudah ada.
  */

  if (!btn) {

    btn = document.createElement("button");

    btn.id = "adminLoginBtn";
    btn.type = "button";
    btn.innerHTML = "🔐 Admin Login";

    btn.style.position = "fixed";
    btn.style.right = "14px";
    btn.style.top = "14px";
    btn.style.zIndex = "9999";
    btn.style.padding = "9px 13px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid #30363d";
    btn.style.background = "#161b22";
    btn.style.color = "#fff";
    btn.style.cursor = "pointer";

    document.body.appendChild(btn);
  }

  btn.onclick = showAdminLogin;
}

/* =========================================================
   LOGIN MODAL
   ========================================================= */

function setupLoginModal() {

  const authView = $("authView");

  if (!authView) return;

  /*
     Ubah authView menjadi modal login.
  */

  authView.style.position = "fixed";
  authView.style.left = "50%";
  authView.style.top = "50%";
  authView.style.transform = "translate(-50%, -50%)";
  authView.style.width = "min(420px, calc(100vw - 30px))";
  authView.style.zIndex = "10001";
  authView.style.background = "#0d1117";
  authView.style.border = "1px solid #30363d";
  authView.style.borderRadius = "16px";
  authView.style.boxShadow = "0 20px 70px rgba(0,0,0,.7)";

  /*
     Jangan tampilkan Register.
     Ini khusus Admin Login.
  */

  const registerTab = $("registerTab");

  if (registerTab) {
    registerTab.style.display = "none";
  }

  const loginTab = $("loginTab");

  if (loginTab) {
    loginTab.textContent = "🔐 Admin Login";
    loginTab.classList.add("active");
  }

  const title = authView.querySelector("h1");

  if (title) {
    title.textContent = "🔐 Admin Login";
  }

  const description = authView.querySelector(".muted");

  if (description) {
    description.textContent =
      "Login hanya untuk mengelola Trading Journal.";
  }

  /*
     Tambahkan tombol tutup jika belum ada.
  */

  if (!$("closeAdminLogin")) {

    const closeBtn = document.createElement("button");

    closeBtn.id = "closeAdminLogin";
    closeBtn.type = "button";
    closeBtn.textContent = "×";

    closeBtn.style.position = "absolute";
    closeBtn.style.right = "12px";
    closeBtn.style.top = "10px";
    closeBtn.style.width = "34px";
    closeBtn.style.height = "34px";
    closeBtn.style.borderRadius = "8px";
    closeBtn.style.border = "1px solid #30363d";
    closeBtn.style.background = "#161b22";
    closeBtn.style.color = "#fff";
    closeBtn.style.fontSize = "22px";
    closeBtn.style.cursor = "pointer";

    authView.appendChild(closeBtn);

    closeBtn.onclick = () => {
      hideAdminLogin();
    };
  }

  /*
     Hilangkan register mode.
  */

  authMode = "login";
}

/* =========================================================
   SHOW / HIDE ADMIN LOGIN
   ========================================================= */

function showAdminLogin() {

  setupLoginModal();

  const authView = $("authView");
  const appView = $("appView");
  const loginBtn = $("adminLoginBtn");

  if (authView) {
    authView.classList.remove("hidden");
    authView.style.display = "block";
  }

  if (appView) {
    appView.classList.remove("hidden");
  }

  if (loginBtn) {
    loginBtn.style.display = "none";
  }

  const email = $("email");

  if (email) {
    setTimeout(() => email.focus(), 100);
  }
}

function hideAdminLogin() {

  const authView = $("authView");
  const loginBtn = $("adminLoginBtn");

  if (authView) {
    authView.classList.add("hidden");
    authView.style.display = "none";
  }

  if (loginBtn && !currentUser) {
    loginBtn.style.display = "";
  }
}

/* =========================================================
   PUBLIC / ADMIN NAVIGATION
   ========================================================= */

function setPublicNav(admin) {

  const publicPages = new Set([
    "journalPage",
    "performancePage",
    "calendarPage"
  ]);

  document.querySelectorAll(".navBtn").forEach(btn => {

    const page = btn.dataset.page;

    if (
      admin ||
      publicPages.has(page)
    ) {
      btn.style.display = "";
    } else {
      btn.style.display = "none";
    }

  });

  /*
     Public langsung diarahkan ke Trading Journal.
  */

  if (!admin) {
    openPage("journalPage");
  }
}

/* =========================================================
   ADMIN CONTROLS
   ========================================================= */

function setAdminControls(admin) {

  const controls = [
    "addTradeBtn",
    "addAccountBtn",
    "addPayoutBtn",
    "savePropBtn",
    "exportBtn",
    "modeBtn"
  ];

  controls.forEach(id => {

    const el = $(id);

    if (!el) return;

    el.classList.toggle(
      "hidden",
      !admin
    );

  });

  /*
     Semua elemen .admin-only
  */

  document
    .querySelectorAll(".admin-only")
    .forEach(el => {

      el.classList.toggle(
        "hidden",
        !admin
      );

    });

}

/* =========================================================
   PUBLIC MODE
   ========================================================= */

async function enterPublic() {

  currentUser = null;

  /*
     Tampilkan portal.
  */

  show("appView", true);
  show("authView", false);
  show("logoutBtn", false);

  /*
     Login button tetap terlihat.
  */

  const loginBtn = $("adminLoginBtn");

  if (loginBtn) {
    loginBtn.style.display = "";
  }

  /*
     View Only.
  */

  setPublicNav(false);
  setAdminControls(false);

  /*
     Pastikan tidak ada modal edit terbuka.
  */

  [
    "modal",
    "accountModal",
    "payoutModal"
  ].forEach(id => {

    const el = $(id);

    if (el) {
      el.classList.add("hidden");
    }

  });

  /*
     Load data publik.
  */

  await loadPublicData();
}

/* =========================================================
   ADMIN MODE
   ========================================================= */

async function enterAdmin(user) {

  currentUser = user;

  show("appView", true);
  show("authView", false);
  show("logoutBtn", true);

  const loginBtn = $("adminLoginBtn");

  if (loginBtn) {
    loginBtn.style.display = "none";
  }

  setPublicNav(true);
  setAdminControls(true);

  await loadTrades();
  await loadProp();
  await loadAccounts();
  await loadPayouts();

  openPage("globalPage");
}

/* =========================================================
   AUTH INIT
   ========================================================= */

async function initAuth() {

  /*
     Cek session.
  */

  const {
    data: { session }
  } = await sb.auth.getSession();

  if (session) {
    await enterAdmin(session.user);
  } else {
    await enterPublic();
  }

  /*
     Pantau login/logout.
  */

  sb.auth.onAuthStateChange(
    async (_event, session) => {

      if (session) {
        await enterAdmin(session.user);
      } else {
        await enterPublic();
      }

    }
  );
}

/* =========================================================
   LOGIN FORM
   ========================================================= */

function setupAuthForm() {

  const form = $("authForm");

  if (!form) return;

  /*
     Login only.
  */

  const registerTab = $("registerTab");

  if (registerTab) {
    registerTab.style.display = "none";
  }

  const loginTab = $("loginTab");

  if (loginTab) {
    loginTab.textContent = "🔐 Admin Login";
  }

  form.onsubmit = async e => {

    e.preventDefault();

    const email =
      $("email")?.value.trim();

    const password =
      $("password")?.value;

    const msg = $("authMsg");

    if (!email || !password) {

      if (msg) {
        msg.textContent =
          "Email dan password wajib diisi.";
      }

      return;
    }

    if (msg) {
      msg.textContent = "Memproses login...";
    }

    const { error } =
      await sb.auth.signInWithPassword({
        email,
        password
      });

    if (error) {

      if (msg) {
        msg.textContent =
          "Login gagal: " +
          error.message;
      }

      return;
    }

    if (msg) {
      msg.textContent =
        "Login berhasil.";
    }

    form.reset();

    hideAdminLogin();
  };
}

/* =========================================================
   PUBLIC DATA
   ========================================================= */

async function loadPublicData() {

  await loadPublicTrades();
  await loadPublicAccounts();
  await loadPublicPayouts();

  openPage("journalPage");
}

async function loadPublicTrades() {

  const {
    data,
    error
  } = await sb
    .from("trades")
    .select("*")
    .order("trade_date", {
      ascending: true
    });

  if (error) {

    console.error(
      "Public trades error:",
      error
    );

    trades = [];

  } else {

    trades = data || [];

  }

  render();
  renderGlobal();
  renderCalendar();
  setupPerfFilters();
  renderPerformance();
}

async function loadPublicAccounts() {

  const {
    data,
    error
  } = await sb
    .from("prop_accounts")
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (error) {

    console.error(
      "Public accounts error:",
      error
    );

    accounts = [];

  } else {

    accounts = data || [];

  }

  renderAccounts();
  renderGlobal();
  renderCalendar();
  setupPerfFilters();
  renderPerformance();
}

async function loadPublicPayouts() {

  const {
    data,
    error
  } = await sb
    .from("payouts")
    .select("*")
    .order("payout_date", {
      ascending: false
    });

  if (error) {

    console.error(
      "Public payouts error:",
      error
    );

    payouts = [];

  } else {

    payouts = data || [];

  }

  renderPayouts();
  renderGlobal();
}

/* =========================================================
   ADMIN DATA
   ========================================================= */

async function loadTrades() {

  if (!currentUser) {
    return loadPublicTrades();
  }

  const {
    data,
    error
  } = await sb
    .from("trades")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("trade_date", {
      ascending: true
    });

  if (error) {

    console.error(error);

    trades = [];

    return;
  }

  trades = data || [];

  render();
  renderGlobal();
  renderCalendar();
  setupPerfFilters();
  renderPerformance();
}

async function loadAccounts() {

  if (!currentUser) {
    return loadPublicAccounts();
  }

  const {
    data,
    error
  } = await sb
    .from("prop_accounts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false
    });

  if (error) {

    console.error(error);

    accounts = [];

  } else {

    accounts = data || [];

  }

  renderAccounts();
  renderGlobal();
  fillPayoutAccounts();
  fillTradeAccounts();
  renderCalendar();
  setupPerfFilters();
  renderPerformance();
}

async function loadPayouts() {

  if (!currentUser) {
    return loadPublicPayouts();
  }

  const {
    data,
    error
  } = await sb
    .from("payouts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("payout_date", {
      ascending: false
    });

  if (error) {

    console.error(error);

    payouts = [];

  } else {

    payouts = data || [];

  }

  renderPayouts();
  renderGlobal();
}

/* =========================================================
   PROP SETTINGS
   ========================================================= */

async function loadProp() {

  /*
     Public tidak mengedit prop setting.
     Gunakan default untuk kalkulasi.
  */

  if (!currentUser) {

    setPropInputs();
    renderProp();

    return;
  }

  const {
    data,
    error
  } = await sb
    .from("profiles")
    .select("prop_settings")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (
    !error &&
    data &&
    data.prop_settings
  ) {

    prop = {
      ...prop,
      ...data.prop_settings
    };

  }

  setPropInputs();
  renderProp();
}

function setPropInputs() {

  const map = {
    propAccount: "account",
    propTargetPct: "targetPct",
    propMaxDDPct: "maxDDPct",
    propDailyLossPct: "dailyLossPct",
    propConsistencyPct: "consistencyPct",
    propBuffer: "buffer"
  };

  Object.entries(map).forEach(
    ([id, key]) => {

      const el = $(id);

      if (el) {
        el.value = prop[key];
      }

    }
  );
}

async function saveProp() {

  if (!requireAdmin()) return;

  const n = id =>
    parseFloat($(id)?.value) || 0;

  prop = {
    account: n("propAccount"),
    targetPct: n("propTargetPct"),
    maxDDPct: n("propMaxDDPct"),
    dailyLossPct: n("propDailyLossPct"),
    consistencyPct: n("propConsistencyPct"),
    buffer: n("propBuffer")
  };

  const {
    error
  } = await sb
    .from("profiles")
    .update({
      prop_settings: prop
    })
    .eq(
      "id",
      currentUser.id
    );

  if (error) {

    alert(
      "Gagal menyimpan pengaturan: " +
      error.message
    );

    return;
  }

  renderProp();

  alert(
    "Pengaturan Prop Firm tersimpan."
  );
}

function renderProp() {

  if (!$("propTarget")) return;

  const net =
    trades.reduce(
      (a, t) =>
        a + Number(t.pl || 0),
      0
    );

  const target =
    prop.account *
    prop.targetPct /
    100;

  const ddLimit =
    prop.account *
    prop.maxDDPct /
    100;

  const dailyLimit =
    prop.account *
    prop.dailyLossPct /
    100;

  const days = {};

  trades.forEach(t => {

    const d =
      new Date(t.trade_date)
        .toISOString()
        .slice(0, 10);

    days[d] =
      (days[d] || 0) +
      Number(t.pl || 0);

  });

  const vals =
    Object.values(days);

  const best =
    vals.length
      ? Math.max(...vals)
      : 0;

  const consistency =
    net > 0
      ? best / net * 100
      : 0;

  const progress =
    target > 0
      ? Math.max(
          0,
          Math.min(
            100,
            net / target * 100
          )
        )
      : 0;

  $("propTarget").textContent =
    money(target);

  $("propProgress").textContent =
    progress.toFixed(1) + "%";

  $("propDDLimit").textContent =
    money(ddLimit);

  $("propDailyLimit").textContent =
    money(dailyLimit);

  $("propBestDay").textContent =
    money(best);

  $("propConsistency").textContent =
    consistency.toFixed(1) + "%";

  let warning = "";

  if (net <= -ddLimit) {

    warning =
      "⛔ Max drawdown terlampaui.";

  } else if (
    vals.some(v =>
      v <= -dailyLimit
    )
  ) {

    warning =
      "⛔ Daily loss limit terlampaui.";

  } else if (
    consistency >
    prop.consistencyPct
  ) {

    warning =
      "⚠️ Consistency di atas batas.";

  } else if (net >= target) {

    warning =
      "✅ Target profit tercapai.";

  } else {

    warning =
      "🟢 Masih dalam batas. Sisa target: " +
      money(
        Math.max(
          0,
          target - net
        )
      );
  }

  if ($("propWarning")) {
    $("propWarning").textContent =
      warning;
  }
}

/* =========================================================
   TRADING JOURNAL
   ========================================================= */

function render() {

  const total =
    trades.length;

  const wins =
    trades.filter(
      t => Number(t.pl) > 0
    );

  const losses =
    trades.filter(
      t => Number(t.pl) < 0
    );

  const net =
    trades.reduce(
      (a, t) =>
        a + Number(t.pl || 0),
      0
    );

  const grossWin =
    wins.reduce(
      (a, t) =>
        a + Number(t.pl),
      0
    );

  const grossLoss =
    Math.abs(
      losses.reduce(
        (a, t) =>
          a + Number(t.pl),
        0
      )
    );

  const winRate =
    total
      ? wins.length / total * 100
      : 0;

  const profitFactor =
    grossLoss
      ? grossWin / grossLoss
      : grossWin
        ? Infinity
        : 0;

  if ($("totalTrades"))
    $("totalTrades").textContent =
      total;

  if ($("winRate"))
    $("winRate").textContent =
      winRate.toFixed(1) + "%";

  if ($("netPL"))
    $("netPL").textContent =
      money(net);

  if ($("profitFactor"))
    $("profitFactor").textContent =
      profitFactor === Infinity
        ? "∞"
        : profitFactor.toFixed(2);

  setValueClass(
    "winRate",
    winRate,
    "winrate"
  );

  setValueClass(
    "netPL",
    net
  );

  setValueClass(
    "profitFactor",
    profitFactor
  );

  /*
     Equity
  */

  const equity = [];

  let e = 0;
  let peak = 0;
  let maxDD = 0;

  trades.forEach(t => {

    e += Number(t.pl || 0);

    peak =
      Math.max(
        peak,
        e
      );

    maxDD =
      Math.max(
        maxDD,
        peak - e
      );

    equity.push(e);

  });

  if ($("maxDD"))
    $("maxDD").textContent =
      money(-maxDD);

  if ($("equityLabel"))
    $("equityLabel").textContent =
      money(e);

  setValueClass(
    "maxDD",
    -maxDD
  );

  setValueClass(
    "equityLabel",
    e
  );

  /*
     Best day
  */

  const days = {};

  trades.forEach(t => {

    const d =
      new Date(t.trade_date)
        .toISOString()
        .slice(0, 10);

    days[d] =
      (days[d] || 0) +
      Number(t.pl || 0);

  });

  const bestDay =
    Object.values(days).length
      ? Math.max(
          ...Object.values(days)
        )
      : 0;

  if ($("bestDay"))
    $("bestDay").textContent =
      money(bestDay);

  setValueClass(
    "bestDay",
    bestDay
  );

  /*
     Search
  */

  const search =
    $("search")?.value
      ?.toLowerCase() || "";

  const filtered =
    trades.filter(t => {

      const text =
        `${t.symbol || ""} ${
          t.strategy || ""
        } ${
          t.session || ""
        }`;

      return text
        .toLowerCase()
        .includes(search);
    });

  /*
     Trade list
  */

  if ($("tradeList")) {

    $("tradeList").innerHTML =
      filtered
        .slice()
        .reverse()
        .map(t => {

          const deleteButton =
            currentUser
              ? `
                <button
                  class="danger"
                  onclick="deleteTrade('${t.id}')">
                  Hapus
                </button>
              `
              : "";

          return `
            <div class="trade">

              <div>
                <b>
                  ${esc(t.symbol)}
                </b>

                <span class="pill">
                  ${esc(t.side)}
                </span>

                <small>
                  ${new Date(
                    t.trade_date
                  ).toLocaleString()}
                </small>
              </div>

              <div>

                <b class="${
                  Number(t.pl) >= 0
                    ? "positive"
                    : "negative"
                }">
                  ${money(t.pl)}
                </b>

                ${deleteButton}

              </div>

              <small>
                ${esc(t.strategy || "")}
                ${esc(t.timeframe || "")}
                ${esc(t.session || "")}
              </small>

            </div>
          `;

        })
        .join("") ||
      `<p class="muted">
        Belum ada trade.
      </p>`;
  }

  draw(equity);
}

/* =========================================================
   SEARCH
   ========================================================= */

if ($("search")) {
  $("search").oninput = render;
}

/* =========================================================
   DELETE TRADE
   ========================================================= */

async function deleteTrade(id) {

  if (!requireAdmin()) return;

  if (
    !confirm(
      "Hapus trade ini?"
    )
  ) {
    return;
  }

  const {
    error
  } = await sb
    .from("trades")
    .delete()
    .eq("id", id)
    .eq(
      "user_id",
      currentUser.id
    );

  if (error) {

    alert(error.message);

  } else {

    await loadTrades();

  }
}

window.deleteTrade =
  deleteTrade;

/* =========================================================
   PERFORMANCE
   ========================================================= */

function setupPerfFilters() {

  const fill =
    (id, values) => {

      const select = $(id);

      if (!select) return;

      const old =
        select.value;

      select.innerHTML =
        '<option value="">Semua</option>' +
        [
          ...new Set(
            values.filter(Boolean)
          )
        ]
          .sort()
          .map(
            v =>
              `<option value="${esc(v)}">
                ${esc(v)}
              </option>`
          )
          .join("");

      select.value = old;
    };

  const accountSelect =
    $("perfAccount");

  if (accountSelect) {

    const old =
      accountSelect.value;

    accountSelect.innerHTML =
      '<option value="">Semua Akun</option>' +
      accounts
        .map(
          a =>
            `<option value="${a.id}">
              ${esc(a.firm)}
              —
              ${esc(a.account_name)}
            </option>`
        )
        .join("");

    accountSelect.value =
      old;
  }

  fill(
    "perfStrategy",
    trades.map(
      t => t.strategy
    )
  );

  fill(
    "perfTF",
    trades.map(
      t => t.timeframe
    )
  );

  fill(
    "perfSession",
    trades.map(
      t => t.session
    )
  );
}

function getPerfTrades() {

  const account =
    $("perfAccount")?.value ||
    "";

  const strategy =
    $("perfStrategy")?.value ||
    "";

  const tf =
    $("perfTF")?.value ||
    "";

  const session =
    $("perfSession")?.value ||
    "";

  const from =
    $("perfFrom")?.value ||
    "";

  const to =
    $("perfTo")?.value ||
    "";

  return trades
    .filter(t => {

      const d =
        new Date(t.trade_date)
          .toISOString()
          .slice(0, 10);

      return (
        (!account ||
          t.account_id === account) &&
        (!strategy ||
          t.strategy === strategy) &&
        (!tf ||
          t.timeframe === tf) &&
        (!session ||
          t.session === session) &&
        (!from ||
          d >= from) &&
        (!to ||
          d <= to)
      );

    })
    .sort(
      (a, b) =>
        new Date(a.trade_date) -
        new Date(b.trade_date)
    );
}

function groupPerf(
  rows,
  key
) {

  const groups = {};

  rows.forEach(t => {

    const name =
      t[key] ||
      "Unknown";

    if (!groups[name]) {

      groups[name] = {
        n: 0,
        w: 0,
        l: 0,
        pl: 0
      };

    }

    const pl =
      Number(t.pl || 0);

    groups[name].n++;
    groups[name].pl += pl;

    if (pl > 0)
      groups[name].w++;

    if (pl < 0)
      groups[name].l++;

  });

  return Object
    .entries(groups)
    .map(
      ([name, x]) => ({
        ...x,
        name,
        wr:
          x.n
            ? x.w / x.n * 100
            : 0
      })
    )
    .sort(
      (a, b) =>
        b.pl - a.pl
    );
}

function renderPerfTable(
  id,
  rows
) {

  const el = $(id);

  if (!el) return;

  el.innerHTML =
    rows
      .map(
        x => `
          <div class="trade">

            <div>
              <b>
                ${esc(x.name)}
              </b>

              <span>
                ${x.wr.toFixed(1)}% WR
              </span>
            </div>

            <small>
              ${x.n} trades ·
              ${x.w}W /
              ${x.l}L ·

              <b class="${
                x.pl >= 0
                  ? "positive"
                  : "negative"
              }">
                ${money(x.pl)}
              </b>
            </small>

          </div>
        `
      )
      .join("") ||
    `<p class="muted">
      Belum ada data.
    </p>`;
}

function renderPerformance() {

  const rows =
    getPerfTrades();

  const values =
    rows.map(
      t =>
        Number(t.pl || 0)
    );

  const wins =
    values.filter(
      x => x > 0
    );

  const losses =
    values.filter(
      x => x < 0
    );

  const net =
    values.reduce(
      (a, b) => a + b,
      0
    );

  const grossWin =
    wins.reduce(
      (a, b) => a + b,
      0
    );

  const grossLoss =
    Math.abs(
      losses.reduce(
        (a, b) => a + b,
        0
      )
    );

  const wr =
    rows.length
      ? wins.length /
        rows.length *
        100
      : 0;

  const pf =
    grossLoss
      ? grossWin / grossLoss
      : 0;

  const avgWin =
    wins.length
      ? grossWin / wins.length
      : 0;

  const avgLoss =
    losses.length
      ? grossLoss / losses.length
      : 0;

  const expectancy =
    rows.length
      ? net / rows.length
      : 0;

  let equity = 0;
  let peak = 0;
  let maxDD = 0;

  rows.forEach(t => {

    equity +=
      Number(t.pl || 0);

    peak =
      Math.max(
        peak,
        equity
      );

    maxDD =
      Math.max(
        maxDD,
        peak - equity
      );

  });

  const days = {};

  rows.forEach(t => {

    const d =
      new Date(t.trade_date)
        .toISOString()
        .slice(0, 10);

    days[d] =
      (days[d] || 0) +
      Number(t.pl || 0);

  });

  const dayValues =
    Object.values(days);

  const best =
    dayValues.length
      ? Math.max(...dayValues)
      : 0;

  const worst =
    dayValues.length
      ? Math.min(...dayValues)
      : 0;

  const valuesMap = [

    ["pTotal",
      rows.length],

    ["pWinRate",
      wr.toFixed(1) + "%"],

    ["pNet",
      money(net)],

    ["pPF",
      pf.toFixed(2)],

    ["pAvgWin",
      money(avgWin)],

    ["pAvgLoss",
      money(-avgLoss)],

    ["pExpectancy",
      money(expectancy)],

    ["pMaxDD",
      money(-maxDD)],

    ["pBestDay",
      money(best)],

    ["pWorstDay",
      money(worst)],

    ["pWins",
      wins.length],

    ["pLosses",
      losses.length],

    ["perfEquity",
      money(equity)]

  ];

  valuesMap.forEach(
    ([id, value]) => {

      if ($(id)) {
        $(id).textContent =
          value;
      }

    }
  );

  renderPerfTable(
    "perfAccounts",
    groupPerf(
      rows,
      "account_id"
    ).map(x => {

      const account =
        accounts.find(
          a =>
            a.id === x.name
        );

      if (account) {

        x.name =
          `${account.firm} — ${account.account_name}`;

      }

      return x;

    })
  );

  renderPerfTable(
    "perfStrategies",
    groupPerf(
      rows,
      "strategy"
    )
  );

  renderPerfTable(
    "perfTimeframes",
    groupPerf(
      rows,
      "timeframe"
    )
  );

  renderPerfTable(
    "perfSessions",
    groupPerf(
      rows,
      "session"
    )
  );

  if ($("perfDays")) {

    $("perfDays").innerHTML =
      Object.entries(days)
        .sort(
          (a, b) =>
            b[0].localeCompare(
              a[0]
            )
        )
        .map(
          ([date, pl]) => `
            <div class="trade">

              <div>
                <b>
                  ${date}
                </b>

                <b class="${
                  pl >= 0
                    ? "positive"
                    : "negative"
                }">
                  ${money(pl)}
                </b>
              </div>

            </div>
          `
        )
        .join("") ||
      `<p class="muted">
        Belum ada data.
      </p>`;
  }

  drawPerformanceChart(rows);
}

/* =========================================================
   PERFORMANCE FILTER
   ========================================================= */

[
  "perfAccount",
  "perfStrategy",
  "perfTF",
  "perfSession",
  "perfFrom",
  "perfTo"
].forEach(id => {

  const el = $(id);

  if (el) {
    el.addEventListener(
      "change",
      renderPerformance
    );
  }

});

if ($("perfReset")) {

  $("perfReset").onclick =
    () => {

      [
        "perfAccount",
        "perfStrategy",
        "perfTF",
        "perfSession",
        "perfFrom",
        "perfTo"
      ].forEach(id => {

        if ($(id)) {
          $(id).value = "";
        }

      });

      renderPerformance();

    };
}

/* =========================================================
   ACCOUNTS
   ========================================================= */

function renderAccounts() {

  const box =
    $("accountList");

  if (!box) return;

  box.innerHTML =
    accounts
      .map(a => {

        const accountTrades =
          trades.filter(
            t =>
              t.account_id ===
              a.id
          );

        const pl =
          accountTrades.reduce(
            (s, t) =>
              s +
              Number(t.pl || 0),
            0
          );

        const paid =
          payouts
            .filter(
              p =>
                p.account_id ===
                  a.id &&
                p.status ===
                  "Paid"
            )
            .reduce(
              (s, p) =>
                s +
                Number(
                  p.amount || 0
                ),
              0
            );

        const target =
          Number(
            a.account_size
          ) *
          Number(
            a.target_pct
          ) /
          100;

        const progress =
          target
            ? Math.max(
                0,
                pl /
                  target *
                  100
              )
            : 0;

        const consistency =
          getAccountConsistency(
            a.id
          );

        const rule =
          Number(
            a.consistency_pct ||
            0
          );

        const actions =
          currentUser
            ? `
              <div class="accountActions">

                <button
                  class="secondary"
                  onclick="editAccount('${a.id}')">
                  ✏️ Edit Account
                </button>

                <button
                  class="secondary"
                  onclick="setAccountStatus('${a.id}')">
                  Ubah Status
                </button>

                <button
                  class="danger"
                  onclick="deleteAccount('${a.id}')">
                  Hapus
                </button>

              </div>
            `
            : "";

        return `
          <div class="panel accountCard">

            <div class="accountTop">

              <div>
                <h2>
                  ${esc(a.firm)}
                </h2>

                <small>
                  ${esc(a.account_name)}
                </small>
              </div>

              <span class="status">
                ${esc(a.status)}
              </span>

            </div>

            <div class="accountMetrics">

              <div>
                <small>Size</small>
                <b>
                  ${money(
                    a.account_size
                  )}
                </b>
              </div>

              <div>
                <small>Fee</small>
                <b class="negative">
                  ${money(
                    -Number(
                      a.purchase_fee ||
                      0
                    )
                  )}
                </b>
              </div>

              <div>
                <small>Trading P/L</small>
                <b class="${
                  pl >= 0
                    ? "positive"
                    : "negative"
                }">
                  ${money(pl)}
                </b>
              </div>

              <div>
                <small>Payout</small>
                <b>
                  ${money(paid)}
                </b>
              </div>

              <div>
                <small>Consistency</small>
                <b>
                  ${
                    accountTrades.length
                      ? consistency.toFixed(
                          1
                        ) + "%"
                      : "—"
                  }
                </b>
              </div>

              <div>
                <small>Rule</small>
                <b>
                  ${
                    rule
                      ? rule + "%"
                      : "—"
                  }
                </b>
              </div>

            </div>

            <div class="progress">
              <i
                style="width:${Math.min(
                  100,
                  Math.max(
                    0,
                    progress
                  )
                )}%">
              </i>
            </div>

            <div class="accountRuleLine">

              <span>
                Target ${Number(
                  a.target_pct
                )}%
              </span>

              <span>
                Max DD ${Number(
                  a.max_dd_pct
                )}%
              </span>

              <span>
                Daily ${Number(
                  a.daily_loss_pct
                )}%
              </span>

              <span>
                Consistency ${rule}%
              </span>

            </div>

            ${actions}

          </div>
        `;

      })
      .join("") ||

    `
      <div class="panel emptyState">
        <strong>
          Belum ada akun Prop Firm
        </strong>
      </div>
    `;
}

function getAccountConsistency(
  accountId
) {

  const rows =
    trades.filter(
      t =>
        t.account_id ===
        accountId
    );

  const daily = {};

  rows.forEach(t => {

    const d =
      new Date(t.trade_date)
        .toISOString()
        .slice(0, 10);

    daily[d] =
      (daily[d] || 0) +
      Number(t.pl || 0);

  });

  const total =
    Object.values(daily)
      .reduce(
        (s, v) => s + v,
        0
      );

  const positiveDays =
    Object.values(daily)
      .filter(
        v => v > 0
      );

  const best =
    positiveDays.length
      ? Math.max(
          ...positiveDays
        )
      : 0;

  return total > 0
    ? best / total * 100
    : 0;
}

function fillTradeAccounts() {

  const select =
    $("tAccount");

  if (!select) return;

  select.innerHTML =
    '<option value="">Pilih akun prop firm</option>' +
    accounts
      .map(
        a =>
          `<option value="${a.id}">
            ${esc(a.firm)}
            —
            ${esc(a.account_name)}
          </option>`
      )
      .join("");
}

function fillPayoutAccounts() {

  const select =
    $("pAccount");

  if (!select) return;

  select.innerHTML =
    accounts
      .map(
        a =>
          `<option value="${a.id}">
            ${esc(a.firm)}
            —
            ${esc(a.account_name)}
          </option>`
      )
      .join("");
}

/* =========================================================
   PAYOUT
   ========================================================= */

function renderPayouts() {

  const box =
    $("payoutList");

  if (!box) return;

  box.innerHTML =
    payouts
      .map(p => {

        const account =
          accounts.find(
            a =>
              a.id ===
              p.account_id
          );

        return `
          <div class="trade">

            <div>

              <b>
                ${money(p.amount)}
              </b>

              <span class="pill">
                ${esc(p.status)}
              </span>

            </div>

            <small>
              ${esc(
                account?.firm || ""
              )}
              ·
              ${esc(
                account?.account_name ||
                ""
              )}
              ·
              ${p.payout_date}
            </small>

            <small>
              ${esc(
                p.note || ""
              )}
            </small>

          </div>
        `;

      })
      .join("") ||

    `<p class="muted">
      Belum ada payout.
    </p>`;
}

/* =========================================================
   GLOBAL DASHBOARD
   ========================================================= */

function renderGlobal() {

  const values =
    trades.map(
      t =>
        Number(t.pl || 0)
    );

  const wins =
    values.filter(
      v => v > 0
    );

  const losses =
    values.filter(
      v => v < 0
    );

  const pl =
    values.reduce(
      (s, v) =>
        s + v,
      0
    );

  const grossWin =
    wins.reduce(
      (s, v) =>
        s + v,
      0
    );

  const grossLoss =
    Math.abs(
      losses.reduce(
        (s, v) =>
          s + v,
        0
      )
    );

  const wr =
    values.length
      ? wins.length /
        values.length *
        100
      : 0;

  const pf =
    grossLoss
      ? grossWin /
        grossLoss
      : 0;

  const fees =
    accounts.reduce(
      (s, a) =>
        s +
        Number(
          a.purchase_fee ||
          0
        ),
      0
    );

  const payoutsTotal =
    payouts
      .filter(
        p =>
          p.status ===
          "Paid"
      )
      .reduce(
        (s, p) =>
          s +
          Number(
            p.amount || 0
          ),
        0
      );

  const netCash =
    payoutsTotal -
    fees;

  const roi =
    fees
      ? netCash /
        fees *
        100
      : 0;

  const set = [
    ["gTradingPL", money(pl)],
    ["gWinRate", wr.toFixed(1) + "%"],
    ["gTradeCount", values.length],
    ["gProfitFactor", pf.toFixed(2)],
    ["gFees", money(-fees)],
    ["gPayouts", money(payoutsTotal)],
    ["gNet", money(netCash)],
    ["gCashROI", roi.toFixed(1) + "%"],
    ["gAccounts", accounts.length],
    [
      "gPhase1",
      accounts.filter(
        a =>
          a.status ===
          "Phase 1"
      ).length
    ],
    [
      "gPhase2",
      accounts.filter(
        a =>
          a.status ===
          "Phase 2"
      ).length
    ],
    [
      "gFunded",
      accounts.filter(
        a =>
          a.status ===
          "Funded"
      ).length
    ]
  ];

  set.forEach(
    ([id, value]) => {

      if ($(id)) {
        $(id).textContent =
          value;
      }

    }
  );

  setValueClass(
    "gTradingPL",
    pl
  );

  setValueClass(
    "gWinRate",
    wr,
    "winrate"
  );

  setValueClass(
    "gNet",
    netCash
  );

  setValueClass(
    "gCashROI",
    roi
  );

  /*
     Daily
  */

  const daily = {};

  trades.forEach(t => {

    const d =
      new Date(t.trade_date)
        .toISOString()
        .slice(0, 10);

    daily[d] =
      (daily[d] || 0) +
      Number(t.pl || 0);

  });

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const todayPL =
    daily[today] || 0;

  const dayValues =
    Object.values(daily);

  const best =
    dayValues.length
      ? Math.max(
          ...dayValues
        )
      : 0;

  const worst =
    dayValues.length
      ? Math.min(
          ...dayValues
        )
      : 0;

  if ($("gTodayPL"))
    $("gTodayPL").textContent =
      money(todayPL);

  if ($("gBestDay"))
    $("gBestDay").textContent =
      money(best);

  if ($("gWorstDay"))
    $("gWorstDay").textContent =
      money(worst);

  drawGlobalEquity();
}

/* =========================================================
   GLOBAL EQUITY
   ========================================================= */

function drawGlobalEquity() {

  const canvas =
    $("globalEquityChart");

  if (!canvas) return;

  const rows =
    [...trades]
      .sort(
        (a, b) =>
          new Date(
            a.trade_date
          ) -
          new Date(
            b.trade_date
          )
      );

  const ctx =
    canvas.getContext("2d");

  const w =
    canvas.width =
      canvas.clientWidth * 2;

  const h =
    canvas.height =
      250 * 2;

  ctx.clearRect(
    0,
    0,
    w,
    h
  );

  if (!rows.length) {

    if ($("gEquityLabel"))
      $("gEquityLabel").textContent =
        "$0.00";

    return;
  }

  let equity = 0;

  const points = [0];

  rows.forEach(t => {

    equity +=
      Number(t.pl || 0);

    points.push(equity);

  });

  if ($("gEquityLabel"))
    $("gEquityLabel").textContent =
      money(equity);

  let min =
    Math.min(
      ...points,
      0
    );

  let max =
    Math.max(
      ...points,
      0
    );

  if (min === max) {

    min -= 1;
    max += 1;

  }

  const X =
    i =>
      i /
      (points.length - 1) *
      w;

  const Y =
    v =>
      h -
      (
        (v - min) /
        (max - min)
      ) *
      h;

  ctx.beginPath();

  points.forEach(
    (v, i) => {

      if (i === 0) {

        ctx.moveTo(
          X(i),
          Y(v)
        );

      } else {

        ctx.lineTo(
          X(i),
          Y(v)
        );

      }

    }
  );

  ctx.strokeStyle =
    "#3fb950";

  ctx.lineWidth = 5;

  ctx.stroke();
}

/* =========================================================
   CALENDAR
   ========================================================= */

function renderCalendar() {

  const box =
    $("calendarGrid");

  if (!box) return;

  const now =
    new Date(
      calendarCursor
    );

  const year =
    now.getFullYear();

  const month =
    now.getMonth();

  const first =
    new Date(
      year,
      month,
      1
    ).getDay();

  const totalDays =
    new Date(
      year,
      month + 1,
      0
    ).getDate();

  const title =
    now.toLocaleDateString(
      "id-ID",
      {
        month: "long",
        year: "numeric"
      }
    );

  if ($("calTitle"))
    $("calTitle").textContent =
      title;

  const names = [
    "Min",
    "Sen",
    "Sel",
    "Rab",
    "Kam",
    "Jum",
    "Sab"
  ];

  let html =
    names
      .map(
        n =>
          `<div class="calHead">
            ${n}
          </div>`
      )
      .join("");

  for (
    let i = 0;
    i < first;
    i++
  ) {

    html +=
      `<div class="calEmpty"></div>`;

  }

  for (
    let day = 1;
    day <= totalDays;
    day++
  ) {

    const date =
      new Date(
        year,
        month,
        day
      );

    const key =
      date
        .toISOString()
        .slice(0, 10);

    const dayPL =
      trades
        .filter(
          t =>
            new Date(
              t.trade_date
            )
              .toISOString()
              .slice(0, 10) ===
            key
        )
        .reduce(
          (s, t) =>
            s +
            Number(
              t.pl || 0
            ),
          0
        );

    const today =
      key ===
      new Date()
        .toISOString()
        .slice(0, 10);

    html += `
      <button
        type="button"
        class="calDay ${
          dayPL > 0
            ? "calWin"
            : dayPL < 0
              ? "calLoss"
              : ""
        } ${
          today
            ? "calToday"
            : ""
        }"
        data-date="${key}">

        <b>
          ${day}
        </b>

        <small>
          ${
            dayPL
              ? money(dayPL)
              : "—"
          }
        </small>

      </button>
    `;
  }

  box.innerHTML =
    html;
}

if ($("calPrev")) {

  $("calPrev").onclick =
    () => {

      calendarCursor.setMonth(
        calendarCursor.getMonth() - 1
      );

      renderCalendar();

    };
}

if ($("calNext")) {

  $("calNext").onclick =
    () => {

      calendarCursor.setMonth(
        calendarCursor.getMonth() + 1
      );

      renderCalendar();

    };
}

if ($("calToday")) {

  $("calToday").onclick =
    () => {

      calendarCursor =
        new Date();

      renderCalendar();

    };
}

/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function openPage(pageId) {

  /*
     PUBLIC HANYA:
     Journal
     Performance
     Calendar
  */

  if (
    !currentUser &&
    ![
      "journalPage",
      "performancePage",
      "calendarPage"
    ].includes(pageId)
  ) {

    pageId =
      "journalPage";
  }

  document
    .querySelectorAll(".page")
    .forEach(
      page =>
        page.classList.add(
          "hidden"
        )
    );

  document
    .querySelectorAll(".navBtn")
    .forEach(
      btn =>
        btn.classList.toggle(
          "active",
          btn.dataset.page ===
            pageId
        )
    );

  const page =
    $(pageId);

  if (page) {
    page.classList.remove(
      "hidden"
    );
  }

  if (
    pageId ===
    "globalPage"
  ) {

    renderGlobal();
    renderAccounts();

  }

  if (
    pageId ===
    "performancePage"
  ) {

    setupPerfFilters();
    renderPerformance();

  }

  if (
    pageId ===
    "accountsPage"
  ) {

    renderAccounts();

  }

  if (
    pageId ===
    "payoutsPage"
  ) {

    renderPayouts();
    fillPayoutAccounts();

  }

  if (
    pageId ===
    "calendarPage"
  ) {

    renderCalendar();

  }

  if (
    pageId ===
    "journalPage"
  ) {

    render();

  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

window.openPage =
  openPage;

/* =========================================================
   NAV CLICK
   ========================================================= */

document.addEventListener(
  "click",
  e => {

    const nav =
      e.target.closest(
        ".navBtn"
      );

    if (nav) {

      e.preventDefault();

      openPage(
        nav.dataset.page
      );

      return;
    }

    const day =
      e.target.closest(
        ".calDay"
      );

    if (day) {

      e.preventDefault();

      const date =
        day.dataset.date;

      if ($("perfFrom"))
        $("perfFrom").value =
          date;

      if ($("perfTo"))
        $("perfTo").value =
          date;

      openPage(
        "performancePage"
      );

      renderPerformance();

    }

  }
);

/* =========================================================
   ADD TRADE
   ========================================================= */

if ($("addTradeBtn")) {

  $("addTradeBtn").onclick =
    () => {

      if (!requireAdmin())
        return;

      show(
        "modal",
        true
      );

    };
}

if ($("closeModal")) {

  $("closeModal").onclick =
    () =>
      show(
        "modal",
        false
      );
}

/* =========================================================
   TRADE FORM
   ========================================================= */

if ($("tradeForm")) {

  $("tradeForm").onsubmit =
    async e => {

      e.preventDefault();

      if (!requireAdmin())
        return;

      if ($("tradeMsg"))
        $("tradeMsg").textContent =
          "Menyimpan...";

      const row = {

        user_id:
          currentUser.id,

        account_id:
          $("tAccount")
            ? $("tAccount").value ||
              null
            : null,

        trade_date:
          new Date().toISOString(),

        symbol:
          $("tSymbol")
            .value
            .trim()
            .toUpperCase(),

        side:
          $("tSide").value,

        entry:
          num("tEntry"),

        exit:
          num("tExit"),

        risk:
          num("tRisk"),

        pl:
          num("tPL"),

        strategy:
          $("tStrategy")
            .value
            .trim(),

        timeframe:
          $("tTF")
            .value
            .trim(),

        session:
          $("tSession")
            .value
            .trim(),

        notes:
          $("tNotes")
            .value
            .trim()

      };

      const {
        error
      } =
        await sb
          .from("trades")
          .insert(row);

      if (error) {

        if ($("tradeMsg"))
          $("tradeMsg").textContent =
            error.message;

        return;
      }

      e.target.reset();

      if ($("tradeMsg"))
        $("tradeMsg").textContent =
          "Trade tersimpan.";

      setTimeout(
        () =>
          show(
            "modal",
            false
          ),
        500
      );

      await loadTrades();
      await loadProp();
      await loadAccounts();
      await loadPayouts();

    };

}

/* =========================================================
   ACCOUNT MODAL
   ========================================================= */

if ($("addAccountBtn")) {

  $("addAccountBtn").onclick =
    () => {

      if (!requireAdmin())
        return;

      editingAccountId =
        null;

      $("accountForm")?.reset();

      if ($("accountModalTitle"))
        $("accountModalTitle")
          .textContent =
          "Tambah Prop Firm Account";

      if ($("accountSubmitBtn"))
        $("accountSubmitBtn")
          .textContent =
          "Simpan Akun";

      if ($("aStatus"))
        $("aStatus").value =
          "Phase 1";

      if ($("aTarget"))
        $("aTarget").value =
          6;

      if ($("aMaxDD"))
        $("aMaxDD").value =
          4;

      if ($("aDaily"))
        $("aDaily").value =
          2;

      if ($("aConsistency"))
        $("aConsistency").value =
          20;

      show(
        "accountModal",
        true
      );

    };
}

if ($("closeAccountModal")) {

  $("closeAccountModal").onclick =
    () => {

      editingAccountId =
        null;

      show(
        "accountModal",
        false
      );

    };
}

/* =========================================================
   EDIT ACCOUNT
   ========================================================= */

async function editAccount(id) {

  if (!requireAdmin())
    return;

  const account =
    accounts.find(
      a =>
        a.id === id
    );

  if (!account) return;

  editingAccountId =
    id;

  $("aFirm").value =
    account.firm || "";

  $("aName").value =
    account.account_name ||
    "";

  $("aSize").value =
    account.account_size ??
    0;

  $("aFee").value =
    account.purchase_fee ??
    0;

  $("aStatus").value =
    account.status ||
    "Phase 1";

  $("aTarget").value =
    account.target_pct ??
    6;

  $("aMaxDD").value =
    account.max_dd_pct ??
    4;

  $("aDaily").value =
    account.daily_loss_pct ??
    2;

  $("aConsistency").value =
    account.consistency_pct ??
    20;

  $("aStart").value =
    account.start_date ||
    "";

  $("aNotes").value =
    account.notes ||
    "";

  if ($("accountModalTitle"))
    $("accountModalTitle")
      .textContent =
      "Edit Prop Firm Account";

  if ($("accountSubmitBtn"))
    $("accountSubmitBtn")
      .textContent =
      "Update Account";

  show(
    "accountModal",
    true
  );
}

window.editAccount =
  editAccount;

/* =========================================================
   ACCOUNT FORM
   ========================================================= */

if ($("accountForm")) {

  $("accountForm").onsubmit =
    async e => {

      e.preventDefault();

      if (!requireAdmin())
        return;

      const n =
        id =>
          parseFloat(
            $(id)?.value
          ) || 0;

      const row = {

        firm:
          $("aFirm")
            .value
            .trim(),

        account_name:
          $("aName")
            .value
            .trim(),

        account_size:
          n("aSize"),

        purchase_fee:
          n("aFee"),

        status:
          $("aStatus")
            .value,

        target_pct:
          n("aTarget"),

        max_dd_pct:
          n("aMaxDD"),

        daily_loss_pct:
          n("aDaily"),

        consistency_pct:
          n("aConsistency"),

        start_date:
          $("aStart")
            .value ||
          null,

        notes:
          $("aNotes")
            .value
            .trim()

      };

      let result;

      if (editingAccountId) {

        result =
          await sb
            .from(
              "prop_accounts"
            )
            .update(row)
            .eq(
              "id",
              editingAccountId
            )
            .eq(
              "user_id",
              currentUser.id
            );

      } else {

        result =
          await sb
            .from(
              "prop_accounts"
            )
            .insert({
              ...row,
              user_id:
                currentUser.id
            });

      }

      if (result.error) {

        if ($("accountMsg"))
          $("accountMsg").textContent =
            result.error.message;

        return;
      }

      e.target.reset();

      editingAccountId =
        null;

      show(
        "accountModal",
        false
      );

      await loadAccounts();

    };

}

/* =========================================================
   ACCOUNT STATUS
   ========================================================= */

async function setAccountStatus(id) {

  if (!requireAdmin())
    return;

  const account =
    accounts.find(
      a =>
        a.id === id
