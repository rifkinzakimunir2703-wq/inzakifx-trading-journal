/* =========================================================
   INZAKI FX TRADING JOURNAL
   VIEW ONLY + ADMIN LOGIN
   Supabase
   ========================================================= */

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let isAdmin = false;

let trades = [];
let accounts = [];
let payouts = [];

let authMode = "login";

let prop = {
  account: 5000,
  targetPct: 6,
  maxDDPct: 4,
  dailyLossPct: 2,
  consistencyPct: 20,
  buffer: 100
};

let editingAccountId = null;
let calendarCursor = new Date();

/* =========================================================
   HELPERS
   ========================================================= */

const $ = id => document.getElementById(id);

const money = n => {
  const value = Number(n) || 0;
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
};

function show(id, yes = true) {
  const el = $(id);
  if (el) el.classList.toggle("hidden", !yes);
}

function num(id) {
  const el = $(id);
  if (!el) return 0;

  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : 0;
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
   ROLE / VIEW MODE
   ========================================================= */

async function checkAdminRole(user) {
  if (!user) return false;

  try {
    const { data, error } = await sb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Role check:", error);
      return false;
    }

    return data?.role === "admin";
  } catch (err) {
    console.error(err);
    return false;
  }
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {

  if (
    !SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")
  ) {
    console.error(
      "Supabase Publishable Key belum diatur."
    );
    return;
  }

  createAdminLoginButton();

  const {
    data: { session }
  } = await sb.auth.getSession();

  if (session) {
    await enterAdmin(session.user);
  } else {
    await enterViewOnly();
  }

  sb.auth.onAuthStateChange(
    async (_event, session) => {

      if (session) {
        await enterAdmin(session.user);
      } else {
        await enterViewOnly();
      }
    }
  );
}

/* =========================================================
   VIEW ONLY MODE
   ========================================================= */

async function enterViewOnly() {

  currentUser = null;
  isAdmin = false;

  show("authView", false);
  show("appView", true);
  show("logoutBtn", false);

  hideAdminControls();

  setupViewOnlyNavigation();

  await loadPublicData();

  openPublicPage();
}

/* =========================================================
   ADMIN MODE
   ========================================================= */

async function enterAdmin(user) {

  currentUser = user;

  isAdmin = await checkAdminRole(user);

  if (!isAdmin) {
    console.warn(
      "User login tetapi bukan admin."
    );

    await sb.auth.signOut();
    return;
  }

  show("authView", false);
  show("appView", true);
  show("logoutBtn", true);

  showAdminControls();

  setupAdminNavigation();

  await loadAdminData();

  openPage("globalPage");
}

/* =========================================================
   ADMIN LOGIN BUTTON
   ========================================================= */

function createAdminLoginButton() {

  if ($("adminLoginBtn")) return;

  const topbar =
    document.querySelector(".topbar");

  if (!topbar) return;

  const btn =
    document.createElement("button");

  btn.id = "adminLoginBtn";
  btn.className = "secondary";
  btn.type = "button";
  btn.textContent = "🔐 Admin Login";

  btn.onclick = openAdminLogin;

  topbar.appendChild(btn);
}

/* =========================================================
   OPEN ADMIN LOGIN
   ========================================================= */

function openAdminLogin() {

  const auth = $("authView");

  if (!auth) {
    alert(
      "Form login tidak ditemukan di index.html."
    );
    return;
  }

  show("appView", false);
  show("authView", true);

  const registerTab = $("registerTab");

  if (registerTab) {
    registerTab.classList.add("hidden");
  }

  setAuthMode("login");

  if ($("authMsg")) {
    $("authMsg").textContent =
      "Login khusus administrator.";
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================================
   RETURN VIEW ONLY
   ========================================================= */

function closeAdminLogin() {

  show("authView", false);
  show("appView", true);

  enterViewOnly();
}

/* =========================================================
   AUTH MODE
   ========================================================= */

function setAuthMode(mode) {

  authMode = "login";

  if ($("loginTab")) {
    $("loginTab").classList.add("active");
  }

  if ($("registerTab")) {
    $("registerTab").classList.remove("active");
    $("registerTab").classList.add("hidden");
  }

  document
    .querySelectorAll(".registerOnly")
    .forEach(el =>
      el.classList.add("hidden")
    );

  if ($("authSubmit")) {
    $("authSubmit").textContent = "Login";
  }
}

/* =========================================================
   LOGIN FORM
   ========================================================= */

if ($("authForm")) {

  $("authForm").onsubmit = async e => {

    e.preventDefault();

    const email =
      $("email")?.value.trim() || "";

    const password =
      $("password")?.value || "";

    if (!email || !password) {

      if ($("authMsg")) {
        $("authMsg").textContent =
          "Email dan password wajib diisi.";
      }

      return;
    }

    if ($("authMsg")) {
      $("authMsg").textContent =
        "Memproses login...";
    }

    const { error } =
      await sb.auth.signInWithPassword({
        email,
        password
      });

    if (error) {

      if ($("authMsg")) {
        $("authMsg").textContent =
          error.message;
      }

      return;
    }

    if ($("authMsg")) {
      $("authMsg").textContent =
        "Login berhasil.";
    }
  };
}

/* =========================================================
   LOGOUT
   ========================================================= */

if ($("logoutBtn")) {

  $("logoutBtn").onclick = async () => {

    await sb.auth.signOut();

    currentUser = null;
    isAdmin = false;

    await enterViewOnly();
  };
}

/* =========================================================
   ADMIN CONTROLS
   ========================================================= */

function showAdminControls() {

  document
    .querySelectorAll(
      "#addTradeBtn, #addAccountBtn, #addPayoutBtn, #modeBtn, #exportBtn"
    )
    .forEach(el => {
      if (el) el.classList.remove("hidden");
    });
}

function hideAdminControls() {

  document
    .querySelectorAll(
      "#addTradeBtn, #addAccountBtn, #addPayoutBtn, #modeBtn, #exportBtn"
    )
    .forEach(el => {
      if (el) el.classList.add("hidden");
    });

  document
    .querySelectorAll(
      ".accountActions, .trade button.danger"
    )
    .forEach(el => {
      el.classList.add("hidden");
    });

  const propPanel = $("propPanel");

  if (propPanel) {
    propPanel.classList.add("hidden");
  }
}

/* =========================================================
   NAVIGATION VIEW ONLY
   ========================================================= */

function setupViewOnlyNavigation() {

  const allowed = [
    "performancePage",
    "calendarPage",
    "journalPage"
  ];

  document
    .querySelectorAll(".navBtn")
    .forEach(btn => {

      const page =
        btn.dataset.page;

      if (allowed.includes(page)) {

        btn.classList.remove("hidden");

      } else {

        btn.classList.add("hidden");
      }
    });
}

/* =========================================================
   NAVIGATION ADMIN
   ========================================================= */

function setupAdminNavigation() {

  document
    .querySelectorAll(".navBtn")
    .forEach(btn =>
      btn.classList.remove("hidden")
    );
}

/* =========================================================
   PUBLIC DATA
   ========================================================= */

async function loadPublicData() {

  try {

    const [
      tradesResult,
      accountsResult,
      payoutsResult
    ] = await Promise.all([

      sb
        .from("trades")
        .select("*")
        .order(
          "trade_date",
          { ascending: true }
        ),

      sb
        .from("prop_accounts")
        .select("*")
        .order(
          "created_at",
          { ascending: false }
        ),

      sb
        .from("payouts")
        .select("*")
        .order(
          "payout_date",
          { ascending: false }
        )
    ]);

    if (tradesResult.error) {
      console.error(
        "Public trades:",
        tradesResult.error
      );
    }

    if (accountsResult.error) {
      console.error(
        "Public accounts:",
        accountsResult.error
      );
    }

    if (payoutsResult.error) {
      console.error(
        "Public payouts:",
        payoutsResult.error
      );
    }

    trades =
      tradesResult.data || [];

    accounts =
      accountsResult.data || [];

    payouts =
      payoutsResult.data || [];

    renderAll();
  }

  catch (err) {

    console.error(
      "Gagal load public data:",
      err
    );
  }
}

/* =========================================================
   ADMIN DATA
   ========================================================= */

async function loadAdminData() {

  if (!currentUser) return;

  await Promise.all([
    loadTrades(),
    loadAccounts(),
    loadPayouts()
  ]);

  await loadProp();

  renderAll();
}

/* =========================================================
   TRADES
   ========================================================= */

async function loadTrades() {

  if (!currentUser) return;

  const {
    data,
    error
  } = await sb
    .from("trades")
    .select("*")
    .eq(
      "user_id",
      currentUser.id
    )
    .order(
      "trade_date",
      { ascending: true }
    );

  if (error) {

    console.error(
      "Load trades:",
      error
    );

    return;
  }

  trades = data || [];
}

/* =========================================================
   ACCOUNTS
   ========================================================= */

async function loadAccounts() {

  if (!currentUser) return;

  const {
    data,
    error
  } = await sb
    .from("prop_accounts")
    .select("*")
    .eq(
      "user_id",
      currentUser.id
    )
    .order(
      "created_at",
      { ascending: false }
    );

  if (error) {

    console.error(
      "Load accounts:",
      error
    );

    return;
  }

  accounts = data || [];
}

/* =========================================================
   PAYOUTS
   ========================================================= */

async function loadPayouts() {

  if (!currentUser) return;

  const {
    data,
    error
  } = await sb
    .from("payouts")
    .select("*")
    .eq(
      "user_id",
      currentUser.id
    )
    .order(
      "payout_date",
      { ascending: false }
    );

  if (error) {

    console.error(
      "Load payouts:",
      error
    );

    return;
  }

  payouts = data || [];
}

/* =========================================================
   RENDER ALL
   ========================================================= */

function renderAll() {

  render();
  renderGlobal();
  renderAccounts();
  renderPayouts();
  renderCalendar();

  setupPerfFilters();
  renderPerformance();

  fillTradeAccounts();
  fillPayoutAccounts();
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
        a + Number(t.pl || 0),
      0
    );

  const grossLoss =
    Math.abs(
      losses.reduce(
        (a, t) =>
          a + Number(t.pl || 0),
        0
      )
    );

  const wr =
    total
      ? wins.length / total * 100
      : 0;

  const pf =
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
      wr.toFixed(1) + "%";

  if ($("netPL"))
    $("netPL").textContent =
      money(net);

  if ($("profitFactor"))
    $("profitFactor").textContent =
      pf === Infinity
        ? "∞"
        : pf.toFixed(2);

  setValueClass(
    "winRate",
    wr,
    "winrate"
  );

  setValueClass(
    "netPL",
    net
  );

  setValueClass(
    "profitFactor",
    pf
  );

  const eq = [];

  let equity = 0;
  let peak = 0;
  let dd = 0;

  trades.forEach(t => {

    equity += Number(
      t.pl || 0
    );

    peak =
      Math.max(
        peak,
        equity
      );

    dd =
      Math.max(
        dd,
        peak - equity
      );

    eq.push(equity);
  });

  if ($("maxDD"))
    $("maxDD").textContent =
      money(-dd);

  if ($("equityLabel"))
    $("equityLabel").textContent =
      money(equity);

  setValueClass(
    "maxDD",
    -dd
  );

  setValueClass(
    "equityLabel",
    equity
  );

  const days = {};

  trades.forEach(t => {

    const d =
      new Date(
        t.trade_date
      )
      .toISOString()
      .slice(0, 10);

    days[d] =
      (days[d] || 0) +
      Number(t.pl || 0);
  });

  const bestDay =
    Math.max(
      0,
      ...Object.values(days)
    );

  if ($("bestDay"))
    $("bestDay").textContent =
      money(bestDay);

  setValueClass(
    "bestDay",
    bestDay
  );

  const search =
    $("search")?.value
      .toLowerCase() || "";

  const filtered =
    trades.filter(t =>
      (
        `${t.symbol || ""} ` +
        `${t.strategy || ""} ` +
        `${t.session || ""}`
      )
      .toLowerCase()
      .includes(search)
    );

  const list =
    $("tradeList");

  if (!list) return;

  list.innerHTML =
    filtered
      .slice()
      .reverse()
      .map(t => {

        const adminButtons =
          isAdmin
            ? `
              <button
                class="danger"
                onclick="deleteTrade('${t.id}')"
              >
                Hapus
              </button>
            `
            : "";

        return `
          <div class="trade">

            <div>
              <b>${esc(t.symbol)}</b>

              <span class="pill">
                ${esc(t.side)}
              </span>

              <small>
                ${new Date(
                  t.trade_date
                ).toLocaleString("id-ID")}
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

              ${adminButtons}

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

  draw(eq);
}

if ($("search")) {
  $("search").oninput =
    render;
}

/* =========================================================
   ADD TRADE
   ========================================================= */

if ($("addTradeBtn")) {

  $("addTradeBtn").onclick = () => {

    if (!isAdmin) return;

    show(
      "modal",
      true
    );
  };
}

if ($("closeModal")) {

  $("closeModal").onclick =
    () => show(
      "modal",
      false
    );
}

/* =========================================================
   SAVE TRADE
   ========================================================= */

if ($("tradeForm")) {

  $("tradeForm").onsubmit =
    async e => {

      e.preventDefault();

      if (!isAdmin || !currentUser) {
        alert(
          "Login sebagai admin terlebih dahulu."
        );
        return;
      }

      if ($("tradeMsg")) {
        $("tradeMsg").textContent =
          "Menyimpan...";
      }

      const row = {

        user_id:
          currentUser.id,

        account_id:
          $("tAccount")
            ? $("tAccount").value || null
            : null,

        trade_date:
          new Date().toISOString(),

        symbol:
          $("tSymbol")
            ?.value
            .trim()
            .toUpperCase(),

        side:
          $("tSide")?.value,

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
            ?.value.trim() || "",

        timeframe:
          $("tTF")
            ?.value.trim() || "",

        session:
          $("tSession")
            ?.value.trim() || "",

        notes:
          $("tNotes")
            ?.value.trim() || ""
      };

      const {
        error
      } = await sb
        .from("trades")
        .insert(row);

      if (error) {

        if ($("tradeMsg")) {
          $("tradeMsg").textContent =
            error.message;
        }

        return;
      }

      e.target.reset();

      if ($("tradeMsg")) {
        $("tradeMsg").textContent =
          "Trade tersimpan.";
      }

      setTimeout(
        () =>
          show(
            "modal",
            false
          ),
        500
      );

      await loadAdminData();
    };
}

/* =========================================================
   DELETE TRADE
   ========================================================= */

async function deleteTrade(id) {

  if (!isAdmin || !currentUser) {
    alert(
      "Mode View Only."
    );
    return;
  }

  if (
    !confirm(
      "Hapus trade ini?"
    )
  ) return;

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

    alert(
      error.message
    );

    return;
  }

  await loadAdminData();
}

window.deleteTrade =
  deleteTrade;

/* =========================================================
   PROP FIRM
   ========================================================= */

async function loadProp() {

  if (!currentUser) return;

  const {
    data,
    error
  } = await sb
    .from("profiles")
    .select("prop_settings")
    .eq(
      "id",
      currentUser.id
    )
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

    propAccount:
      "account",

    propTargetPct:
      "targetPct",

    propMaxDDPct:
      "maxDDPct",

    propDailyLossPct:
      "dailyLossPct",

    propConsistencyPct:
      "consistencyPct",

    propBuffer:
      "buffer"
  };

  Object.entries(map)
    .forEach(
      ([id, key]) => {

        if ($(id)) {
          $(id).value =
            prop[key];
        }
      }
    );
}

async function saveProp() {

  if (!isAdmin || !currentUser) {
    alert(
      "Login sebagai admin terlebih dahulu."
    );
    return;
  }

  const n =
    id =>
      parseFloat(
        $(id)?.value
      ) || 0;

  prop = {

    account:
      n("propAccount"),

    targetPct:
      n("propTargetPct"),

    maxDDPct:
      n("propMaxDDPct"),

    dailyLossPct:
      n("propDailyLossPct"),

    consistencyPct:
      n("propConsistencyPct"),

    buffer:
      n("propBuffer")
  };

  const {
    error
  } = await sb
    .from("profiles")
    .update({
      prop_settings:
        prop
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

  if (!$("propTarget"))
    return;

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
      new Date(
        t.trade_date
      )
      .toISOString()
      .slice(0, 10);

    days[d] =
      (days[d] || 0) +
      Number(t.pl || 0);
  });

  const vals =
    Object.values(days);

  const best =
    Math.max(
      0,
      ...vals
    );

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

  if ($("propTarget"))
    $("propTarget").textContent =
      money(target);

  if ($("propProgress"))
    $("propProgress").textContent =
      progress.toFixed(1) + "%";

  if ($("propDDLimit"))
    $("propDDLimit").textContent =
      money(ddLimit);

  if ($("propDailyLimit"))
    $("propDailyLimit").textContent =
      money(dailyLimit);

  if ($("propBestDay"))
    $("propBestDay").textContent =
      money(best);

  if ($("propConsistency"))
    $("propConsistency").textContent =
      consistency.toFixed(1) + "%";

  let warn = "";

  if (net <= -ddLimit)

    warn =
      "⛔ Max drawdown terlampaui.";

  else if (
    vals.some(
      v =>
        v <= -dailyLimit
    )
  )

    warn =
      "⛔ Daily loss limit terlampaui.";

  else if (
    consistency >
    prop.consistencyPct
  )

    warn =
      "⚠️ Consistency di atas batas.";

  else if (
    net >= target
  )

    warn =
      "✅ Target profit tercapai.";

  else

    warn =
      "🟢 Masih dalam batas. Sisa target: " +
      money(
        Math.max(
          0,
          target - net
        )
      );

  if ($("propWarning"))
    $("propWarning").textContent =
      warn;
}

if ($("modeBtn")) {

  $("modeBtn").onclick =
    () => {

      if (!isAdmin) return;

      show(
        "propPanel",
        $("propPanel")
          .classList
          .contains("hidden")
      );

      renderProp();
    };
}

if ($("savePropBtn")) {
  $("savePropBtn").onclick =
    saveProp;
}

/* =========================================================
   ACCOUNTS
   ========================================================= */

function fillTradeAccounts() {

  const s =
    $("tAccount");

  if (!s) return;

  s.innerHTML =
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

  const s =
    $("pAccount");

  if (!s) return;

  s.innerHTML =
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
      new Date(
        t.trade_date
      )
      .toISOString()
      .slice(0, 10);

    daily[d] =
      (daily[d] || 0) +
      Number(t.pl || 0);
  });

  const total =
    Object.values(
      daily
    ).reduce(
      (s, v) =>
        s + v,
      0
    );

  const positiveDays =
    Object.values(
      daily
    ).filter(
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

function renderAccounts() {

  const box =
    $("accountList");

  if (!box) return;

  box.innerHTML =
    accounts
      .map(a => {

        const ats =
          trades.filter(
            t =>
              t.account_id ===
              a.id
          );

        const pl =
          ats.reduce(
            (s, t) =>
              s +
              Number(
                t.pl || 0
              ),
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

        const consistencyClass =
          ats.length
            ? (
                !rule ||
                consistency <= rule
              )
                ? "positive"
                : "negative"
            : "neutralValue";

        const statusClass =
          (
            a.status || ""
          )
            .toLowerCase()
            .replace(
              /\s+/g,
              ""
            );

        const actions =
          isAdmin
            ? `
              <div class="accountActions">

                <button
                  class="secondary"
                  onclick="editAccount('${a.id}')"
                >
                  ✏️ Edit Account
                </button>

                <button
                  class="secondary"
                  onclick="setAccountStatus('${a.id}')"
                >
                  Ubah Status
                </button>

                <button
                  class="danger"
                  onclick="deleteAccount('${a.id}')"
                >
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
                  ${esc(
                    a.account_name
                  )}
                </small>
              </div>

              <span
                class="status ${statusClass}"
              >
                ${esc(
                  a.status
                )}
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
                <b class="${
                  paid > 0
                    ? "positive"
                    : ""
                }">
                  ${money(paid)}
                </b>
              </div>

              <div>
                <small>Consistency</small>
                <b class="${consistencyClass}">
                  ${
                    ats.length
                      ? consistency.toFixed(1) +
                        "%"
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
                )}%"
              ></i>
            </div>

            <div class="accountRuleLine">
              <span>
                Target ${
                  Number(
                    a.target_pct
                  )
                }%
              </span>

              <span>
                Max DD ${
                  Number(
                    a.max_dd_pct
                  )
                }%
              </span>

              <span>
                Daily ${
                  Number(
                    a.daily_loss_pct
                  )
                }%
              </span>

              <span>
                Consistency ${
                  rule
                }%
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

        <p class="muted">
          Belum ada akun yang tersimpan.
        </p>

        ${
          isAdmin
            ? `
              <button
                onclick="
                  document
                  .getElementById(
                    'addAccountBtn'
                  )
                  .click()
                "
              >
                + Tambah Akun
              </button>
            `
            : ""
        }

      </div>
    `;
}

/* =========================================================
   ADD ACCOUNT
   ========================================================= */

if ($("addAccountBtn")) {

  $("addAccountBtn").onclick =
    () => {

      if (!isAdmin) return;

      editingAccountId =
        null;

      $("accountForm")
        ?.reset();

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

  $("closeAccountModal")
    .onclick =
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

  if (!isAdmin) return;

  const a =
    accounts.find(
      x => x.id === id
    );

  if (!a) return;

  editingAccountId =
    id;

  if ($("aFirm"))
    $("aFirm").value =
      a.firm || "";

  if ($("aName"))
    $("aName").value =
      a.account_name || "";

  if ($("aSize"))
    $("aSize").value =
      a.account_size ?? 0;

  if ($("aFee"))
    $("aFee").value =
      a.purchase_fee ?? 0;

  if ($("aStatus"))
    $("aStatus").value =
      a.status ||
      "Phase 1";

  if ($("aTarget"))
    $("aTarget").value =
      a.target_pct ?? 6;

  if ($("aMaxDD"))
    $("aMaxDD").value =
      a.max_dd_pct ?? 4;

  if ($("aDaily"))
    $("aDaily").value =
      a.daily_loss_pct ?? 2;

  if ($("aConsistency"))
    $("aConsistency").value =
      a.consistency_pct ?? 20;

  if ($("aStart"))
    $("aStart").value =
      a.start_date || "";

  if ($("aNotes"))
    $("aNotes").value =
      a.notes || "";

  if ($("accountModalTitle"))
    $("accountModalTitle")
      .textContent =
        "Edit Prop Firm Account";

  if ($("accountSubmitBtn"))
    $("accountSubmitBtn")
      .textContent =
        "Update Account";

  if ($("accountMsg"))
    $("accountMsg")
      .textContent = "";

  show(
    "accountModal",
    true
  );
}

window.editAccount =
  editAccount;

/* =========================================================
   SAVE ACCOUNT
   ========================================================= */

if ($("accountForm")) {

  $("accountForm").onsubmit =
    async e => {

      e.preventDefault();

      if (
        !isAdmin ||
        !currentUser
      ) {
        alert(
          "Login sebagai admin terlebih dahulu."
        );
        return;
      }

      if ($("accountMsg"))
        $("accountMsg")
          .textContent =
            "Menyimpan...";

      const n =
        id =>
          parseFloat(
            $(id)?.value
          ) || 0;

      const row = {

        firm:
          $("aFirm")
            ?.value.trim() || "",

        account_name:
          $("aName")
            ?.value.trim() || "",

        account_size:
          n("aSize"),

        purchase_fee:
          n("aFee"),

        status:
          $("aStatus")
            ?.value || "Phase 1",

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
            ?.value || null,

        notes:
          $("aNotes")
            ?.value.trim() || ""
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
          $("accountMsg")
            .textContent =
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

      await loadAdminData();
    };
}

/* =========================================================
   ACCOUNT STATUS
   ========================================================= */

async function setAccountStatus(id) {

  if (!isAdmin || !currentUser)
    return;

  const a =
    accounts.find(
      x => x.id === id
    );

  if (!a) return;

  const status =
    prompt(
      "Status baru: Phase 1, Phase 2, Funded, Payout, Failed, Closed",
      a.status
    );

  if (!status) return;

  const {
    error
  } = await sb
    .from(
      "prop_accounts"
    )
    .update({
      status
    })
    .eq(
      "id",
      id
    )
    .eq(
      "user_id",
      currentUser.id
    );

  if (error) {

    alert(
      error.message
    );

    return;
  }

  await loadAdminData();
}

window.setAccountStatus =
  setAccountStatus;

/* =========================================================
   DELETE ACCOUNT
   ========================================================= */

async function deleteAccount(id) {

  if (!isAdmin || !currentUser)
    return;

  if (
    !confirm(
      "Hapus akun ini?"
    )
  ) return;

  const {
    error
  } = await sb
    .from(
      "prop_accounts"
    )
    .delete()
    .eq(
      "id",
      id
    )
    .eq(
      "user_id",
      currentUser.id
    );

  if (error) {

    alert(
      error.message
    );

    return;
  }

  await loadAdminData();
}

window.deleteAccount =
  deleteAccount;

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

        const a =
          accounts.find(
            x =>
              x.id ===
              p.account_id
          );

        return `
          <div class="trade">

            <div>
              <b>
                ${money(
                  p.amount
                )}
              </b>

              <span class="pill">
                ${esc(
                  p.status
                )}
              </span>
            </div>

            <small>
              ${esc(
                a?.firm || ""
              )}
              ·
              ${esc(
                a?.account_name ||
                  ""
              )}
              ·
              ${esc(
                p.payout_date ||
                  ""
              )}
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

    `
      <p class="muted">
        Belum ada payout.
      </p>
    `;
}

if ($("addPayoutBtn")) {

  $("addPayoutBtn").onclick =
    () => {

      if (!isAdmin) return;

      fillPayoutAccounts();

      show(
        "payoutModal",
        true
      );
    };
}

if ($("closePayoutModal")) {

  $("closePayoutModal")
    .onclick =
      () =>
        show(
          "payoutModal",
          false
        );
}

if ($("payoutForm")) {

  $("payoutForm").onsubmit =
    async e => {

      e.preventDefault();

      if (
        !isAdmin ||
        !currentUser
      ) {
        alert(
          "Login sebagai admin terlebih dahulu."
        );
        return;
      }

      const row = {

        user_id:
          currentUser.id,

        account_id:
          $("pAccount")
            ?.value,

        amount:
          parseFloat(
            $("pAmount")
              ?.value
          ) || 0,

        payout_date:
          $("pDate")
            ?.value,

        status:
          $("pStatus")
            ?.value,

        note:
          $("pNote")
            ?.value.trim() || ""
      };

      const {
        error
      } = await sb
        .from("payouts")
        .insert(row);

      if (error) {

        if ($("payoutMsg"))
          $("payoutMsg")
            .textContent =
              error.message;

        return;
      }

      e.target.reset();

      show(
        "payoutModal",
        false
      );

      await loadAdminData();
    };
}

/* =========================================================
   GLOBAL DASHBOARD
   ========================================================= */

function renderGlobal() {

  const fees =
    accounts.reduce(
      (s, a) =>
        s +
        Number(
          a.purchase_fee || 0
        ),
      0
    );

  const pays =
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

  const vals =
    trades.map(
      t =>
        Number(
          t.pl || 0
        )
    );

  const pl =
    vals.reduce(
      (s, v) =>
        s + v,
      0
    );

  const wins =
    vals.filter(
      v => v > 0
    );

  const losses =
    vals.filter(
      v => v < 0
    );

  const grossW =
    wins.reduce(
      (s, v) =>
        s + v,
      0
    );

  const grossL =
    Math.abs(
      losses.reduce(
        (s, v) =>
          s + v,
        0
      )
    );

  const wr =
    vals.length
      ? wins.length /
        vals.length *
        100
      : 0;

  const pf =
    grossL
      ? grossW / grossL
      : 0;

  const netCash =
    pays - fees;

  const roi =
    fees
      ? netCash /
        fees *
        100
      : 0;

  const countStatus =
    status =>
      accounts.filter(
        a =>
          (
            a.status || ""
          )
            .toLowerCase()
            .replace(
              /\s+/g,
              " "
            ) ===
          status
      ).length;

  [
    [
      "gTradingPL",
      money(pl)
    ],
    [
      "gWinRate",
      wr.toFixed(1) +
        "%"
    ],
    [
      "gTradeCount",
      vals.length
    ],
    [
      "gProfitFactor",
      pf.toFixed(2)
    ],
    [
      "gFees",
      money(-fees)
    ],
    [
      "gPayouts",
      money(pays)
    ],
    [
      "gNet",
      money(netCash)
    ],
    [
      "gCashROI",
      roi.toFixed(1) +
        "%"
    ],
    [
      "gAccounts",
      accounts.length
    ],
    [
      "gPhase1",
      countStatus(
        "phase 1"
      )
    ],
    [
      "gPhase2",
      countStatus(
        "phase 2"
      )
    ],
    [
      "gFunded",
      countStatus(
        "funded"
      )
    ]
  ].forEach(
    ([id, value]) => {

      if ($(id))
        $(id).textContent =
          value;
    }
  );

  setValueClass(
    "gTradingPL",
    pl
  );

  setValueClass(
    "gNet",
    netCash
  );

  setValueClass(
    "gFees",
    -fees
  );

  setValueClass(
    "gPayouts",
    pays
  );

  setValueClass(
    "gCashROI",
    roi
  );

  setValueClass(
    "gWinRate",
    wr,
    "winrate"
  );

  setValueClass(
    "gProfitFactor",
    pf
  );

  const todayKey =
    new Date()
      .toISOString()
      .slice(0, 10);

  const daily = {};

  trades.forEach(t => {

    const d =
      new Date(
        t.trade_date
      )
      .toISOString()
      .slice(0, 10);

    daily[d] =
      (daily[d] || 0) +
      Number(t.pl || 0);
  });

  const todayPL =
    daily[todayKey] || 0;

  const dayVals =
    Object.values(
      daily
    );

  const bestDay =
    dayVals.length
      ? Math.max(
          ...dayVals
        )
      : 0;

  const worstDay =
    dayVals.length
      ? Math.min(
          ...dayVals
        )
      : 0;

  const riskCount =
    accounts.filter(a => {

      const c =
        getAccountConsistency(
          a.id
        );

      const r =
        Number(
          a.consistency_pct ||
            0
        );

      return (
        r > 0 &&
        c > r
      );
    }).length;

  [
    [
      "gTodayPL",
      money(todayPL)
    ],
    [
      "gBestDay",
      money(bestDay)
    ],
    [
      "gWorstDay",
      money(worstDay)
    ],
    [
      "gRiskAccounts",
      riskCount
    ]
  ].forEach(
    ([id, value]) => {

      if ($(id))
        $(id).textContent =
          value;
    }
  );

  setValueClass(
    "gTodayPL",
    todayPL
  );

  setValueClass(
    "gBestDay",
    bestDay
  );

  setValueClass(
    "gWorstDay",
    worstDay
  );

  const list =
    $("globalAccountList");

  if (list) {

    list.innerHTML =
      accounts
        .map(a => {

          const st =
            a.status ||
            "Phase 1";

          const plA =
            trades
              .filter(
                t =>
                  t.account_id ===
                  a.id
              )
              .reduce(
                (s, t) =>
                  s +
                  Number(
                    t.pl || 0
                  ),
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

          const c =
            getAccountConsistency(
              a.id
            );

          const rule =
            Number(
              a.consistency_pct ||
                0
            );

          return `
            <div
              class="globalAccountRow"
            >

              <div>
                <b>
                  ${esc(
                    a.firm
                  )}
                  —
                  ${esc(
                    a.account_name
                  )}
                </b>

                <span
                  class="dashStatus"
                >
                  ${esc(st)}
                </span>
              </div>

              <div
                class="accountOverviewStats"
              >

                <small>
                  P/L
                  ${money(plA)}
                  · Payout
                  ${money(paid)}
                </small>

                <span
                  class="consistencyBadge"
                >
                  Consistency
                  ${c.toFixed(1)}%
                  ${
                    rule
                      ? " / Rule " +
                        rule +
                        "%"
                      : ""
                  }
                </span>

              </div>

            </div>
          `;
        })
        .join("") ||

      `
        <p class="muted">
          Belum ada akun Prop Firm.
        </p>
      `;
  }

  drawGlobalEquity();
}

/* =========================================================
   GLOBAL EQUITY
   ========================================================= */

function drawGlobalEquity() {

  const c =
    $("globalEquityChart");

  if (!c) return;

  const ts =
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
    c.getContext("2d");

  const w =
    c.width =
      c.clientWidth * 2;

  const h =
    c.height =
      250 * 2;

  ctx.clearRect(
    0,
    0,
    w,
    h
  );

  if (!ts.length) {

    if ($("gEquityLabel"))
      $("gEquityLabel")
        .textContent =
          "$0.00";

    return;
  }

  let eq = 0;

  const pts = [0];

  ts.forEach(t => {

    eq += Number(
      t.pl || 0
    );

    pts.push(eq);
  });

  if ($("gEquityLabel"))
    $("gEquityLabel")
      .textContent =
        money(eq);

  let min =
    Math.min(
      ...pts,
      0
    );

  let max =
    Math.max(
      ...pts,
      0
    );

  if (min === max) {

    min -= 1;
    max += 1;
  }

  const X =
    i =>
      i /
      (pts.length - 1) *
      w;

  const Y =
    v =>
      h -
      (
        v - min
      ) /
      (
        max - min
      ) *
      h;

  ctx.beginPath();

  pts.forEach(
    (v, i) => {

      if (i)
        ctx.lineTo(
          X(i),
          Y(v)
        );
      else
        ctx.moveTo(
          X(i),
          Y(v)
        );
    }
  );

  ctx.strokeStyle =
    "#3fb950";

  ctx.lineWidth = 5;

  ctx.stroke();
}

/* =========================================================
   PERFORMANCE
   ========================================================= */

function setupPerfFilters() {

  const fill =
    (id, values) => {

      const s =
        $(id);

      if (!s) return;

      const old =
        s.value;

      s.innerHTML =
        '<option value="">Semua</option>' +

        [
          ...new Set(
            values.filter(
              Boolean
            )
          )
        ]
          .sort()
          .map(
            v =>
              `<option>
                ${esc(v)}
              </option>`
          )
          .join("");

      s.value =
        old;
    };

  const account =
    $("perfAccount");

  if (account) {

    const old =
      account.value;

    account.innerHTML =
      '<option value="">Semua Akun</option>' +

      accounts
        .map(
          a =>
            `<option value="${a.id}">
              ${esc(a.firm)}
              —
              ${esc(
                a.account_name
              )}
            </option>`
        )
        .join("");

    account.value =
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

  const aid =
    $("perfAccount")
      ?.value || "";

  const st =
    $("perfStrategy")
      ?.value || "";

  const tf =
    $("perfTF")
      ?.value || "";

  const se =
    $("perfSession")
      ?.value || "";

  const from =
    $("perfFrom")
      ?.value || "";

  const to =
    $("perfTo")
      ?.value || "";

  return trades
    .filter(t => {

      const d =
        new Date(
          t.trade_date
        )
        .toISOString()
        .slice(0, 10);

      return (

        (!aid ||
          t.account_id ===
            aid) &&

        (!st ||
          t.strategy ===
            st) &&

        (!tf ||
          t.timeframe ===
            tf) &&

        (!se ||
          t.session ===
            se) &&

        (!from ||
          d >= from) &&

        (!to ||
          d <= to)
      );
    })
    .sort(
      (a, b) =>
        new Date(
          a.trade_date
        ) -
        new Date(
          b.trade_date
        )
    );
}

function groupPerf(
  ts,
  key
) {

  const g = {};

  ts.forEach(t => {

    const k =
      t[key] ||
      "Unknown";

    if (!g[k]) {

      g[k] = {
        n: 0,
        w: 0,
        l: 0,
        pl: 0
      };
    }

    const p =
      Number(
        t.pl || 0
      );

    g[k].n++;

    g[k].pl += p;

    if (p > 0)
      g[k].w++;

    if (p < 0)
      g[k].l++;
  });

  return Object
    .entries(g)
    .map(
      ([name, x]) => ({
        ...x,
        name,
        wr:
          x.n
            ? x.w /
              x.n *
              100
            : 0
      })
    )
    .sort(
      (a, b) =>
        b.pl -
        a.pl
    );
}

function renderPerfTable(
  id,
  rows
) {

  const el =
    $(id);

  if (!el) return;

  el.innerHTML =
    rows
      .map(
        x =>
          `
          <div class="trade">

            <div>
              <b>
                ${esc(
                  x.name
                )}
              </b>

              <span>
                ${x.wr.toFixed(
                  1
                )}% WR
              </span>
            </div>

            <small>
              ${x.n}
              trades ·
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

    `
      <p class="muted">
        Belum ada data.
      </p>
    `;
}

function renderPerformance() {

  setupPerfFilters();

  const ts =
    getPerfTrades();

  const vals =
    ts.map(
      t =>
        Number(
          t.pl || 0
        )
    );

  const wins =
    vals.filter(
      x => x > 0
    );

  const losses =
    vals.filter(
      x => x < 0
    );

  const net =
    vals.reduce(
      (a, b) =>
        a + b,
      0
    );

  const grossW =
    wins.reduce(
      (a, b) =>
        a + b,
      0
    );

  const grossL =
    Math.abs(
      losses.reduce(
        (a, b) =>
          a + b,
        0
      )
    );

  const wr =
    ts.length
      ? wins.length /
        ts.length *
        100
      : 0;

  const pf =
    grossL
      ? grossW /
        grossL
      : 0;

  const avgW =
    wins.length
      ? grossW /
        wins.length
      : 0;

  const avgL =
    losses.length
      ? grossL /
        losses.length
      : 0;

  const exp =
    ts.length
      ? net /
        ts.length
      : 0;

  let eq = 0;
  let peak = 0;
  let maxDD = 0;

  ts.forEach(t => {

    eq += Number(
      t.pl || 0
    );

    peak =
      Math.max(
        peak,
        eq
      );

    maxDD =
      Math.max(
        maxDD,
        peak - eq
      );
  });

  const days = {};

  ts.forEach(t => {

    const d =
      new Date(
        t.trade_date
      )
      .toISOString()
      .slice(0, 10);

    days[d] =
      (days[d] || 0) +
      Number(t.pl || 0);
  });

  const dayVals =
    Object.values(
      days
    );

  const best =
    dayVals.length
      ? Math.max(
          ...dayVals
        )
      : 0;

  const worst =
    dayVals.length
      ? Math.min(
          ...dayVals
        )
      : 0;

  [
    [
      "pTotal",
      ts.length
    ],
    [
      "pWinRate",
      wr.toFixed(1) +
        "%"
    ],
    [
      "pNet",
      money(net)
    ],
    [
      "pPF",
      pf.toFixed(2)
    ],
    [
      "pAvgWin",
      money(avgW)
    ],
    [
      "pAvgLoss",
      money(-avgL)
    ],
    [
      "pExpectancy",
      money(exp)
    ],
    [
      "pMaxDD",
      money(-maxDD)
    ],
    [
      "pBestDay",
      money(best)
    ],
    [
      "pWorstDay",
      money(worst)
    ],
    [
      "pWins",
      wins.length
    ],
    [
      "pLosses",
      losses.length
    ],
    [
      "perfEquity",
      money(eq)
    ]
  ].forEach(
    ([id, value]) => {

      if ($(id))
        $(id).textContent =
          value;
    }
  );

  renderPerfTable(
    "perfAccounts",
    groupPerf(
      ts,
      "account_id"
    ).map(x => {

      const a =
        accounts.find(
          a =>
            a.id ===
            x.name
        );

      x.name =
        a
          ? `${a.firm} — ${a.account_name}`
          : x.name;

      return x;
    })
  );

  renderPerfTable(
    "perfStrategies",
    groupPerf(
      ts,
      "strategy"
    )
  );

  renderPerfTable(
    "perfTimeframes",
    groupPerf(
      ts,
      "timeframe"
    )
  );

  renderPerfTable(
    "perfSessions",
    groupPerf(
      ts,
      "session"
    )
  );

  const pd =
    Object.entries(
      days
    )
      .sort(
        (a, b) =>
          b[0].localeCompare(
            a[0]
          )
      );

  if ($("perfDays")) {

    $("perfDays")
      .innerHTML =
        pd
          .map(
            ([d, p]) =>
              `
              <div class="trade">

                <div>

                  <b>${d}</b>

                  <b class="${
                    p >= 0
                      ? "positive"
                      : "negative"
                  }">
                    ${money(p)}
                  </b>

                </div>

              </div>
              `
          )
          .join("") ||

        `
          <p class="muted">
            Belum ada data.
          </p>
        `;
  }

  drawPerformanceChart(ts);
}

function drawPerformanceChart(ts) {

  const c =
    $("performanceChart");

  if (!c) return;

  const ctx =
    c.getContext("2d");

  const w =
    c.width =
      c.clientWidth * 2;

  const h =
    c.height =
      280 * 2;

  ctx.clearRect(
    0,
    0,
    w,
    h
  );

  if (!ts.length)
    return;

  let eq = 0;

  const pts = [0];

  ts.forEach(t => {

    eq += Number(
      t.pl || 0
    );

    pts.push(eq);
  });

  let min =
    Math.min(
      ...pts
    );

  let max =
    Math.max(
      ...pts
    );

  if (min === max) {

    min -= 1;
    max += 1;
  }

  ctx.beginPath();

  pts.forEach(
    (v, i) => {

      const x =
        i /
        (pts.length - 1) *
        w;

      const y =
        h -
        (
          v - min
        ) /
        (
          max - min
        ) *
        h;

      if (i === 0)
        ctx.moveTo(
          x,
          y
        );
      else
        ctx.lineTo(
          x,
          y
        );
    }
  );

  ctx.strokeStyle =
    "#58a6ff";

  ctx.lineWidth =
    5;

  ctx.stroke();
}

/* =========================================================
   PERFORMANCE FILTER EVENTS
   ========================================================= */

[
  "perfAccount",
  "perfStrategy",
  "perfTF",
  "perfSession",
  "perfFrom",
  "perfTo"
].forEach(
  id => {

    if ($(id)) {

      $(id).addEventListener(
        "change",
        renderPerformance
      );
    }
  }
);

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
      ].forEach(
        id => {

          if ($(id))
            $(id).value =
              "";
        }
      );

      renderPerformance();
    };
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

  const y =
    now.getFullYear();

  const m =
    now.getMonth();

  const first =
    new Date(
      y,
      m,
      1
    ).getDay();

  const days =
    new Date(
      y,
      m + 1,
      0
    ).getDate();

  const title =
    now.toLocaleDateString(
      "id-ID",
      {
        month:
          "long",
        year:
          "numeric"
      }
    );

  if ($("calTitle"))
    $("calTitle")
      .textContent =
        title.charAt(0)
          .toUpperCase() +
        title.slice(1);

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
    let d = 1;
    d <= days;
    d++
  ) {

    const dt =
      new Date(
        y,
        m,
        d
      );

    const key =
      dt.toISOString()
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
          (
