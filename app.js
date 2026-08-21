/* =========================================================
   INZAKI TRADING JOURNAL
   ADMIN LOGIN + PUBLIC VIEW ONLY
   ========================================================= */

const $ = id => document.getElementById(id);

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let currentUser = null;
let publicOwnerId = null;

let trades = [];
let accounts = [];
let payouts = [];

let prop = {
  account: 5000,
  targetPct: 6,
  maxDDPct: 4,
  dailyLossPct: 2,
  consistencyPct: 20,
  buffer: 100
};

let authMode = "login";
let editingAccountId = null;
let calendarCursor = new Date();

const money = n => {
  const v = Number(n) || 0;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
};

const esc = v =>
  String(v ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));

function show(id, yes = true) {
  const el = $(id);
  if (el) el.classList.toggle("hidden", !yes);
}

function num(id) {
  const el = $(id);
  if (!el) return 0;

  const n = parseFloat(el.value);
  return Number.isFinite(n) ? n : 0;
}

function setValueClass(id, value, mode = "normal") {
  const el = $(id);
  if (!el) return;

  el.classList.remove("positive", "negative", "neutralValue");

  if (mode === "winrate") {
    el.classList.add(Number(value) >= 50 ? "positive" : "negative");
  } else if (Number(value) > 0) {
    el.classList.add("positive");
  } else if (Number(value) < 0) {
    el.classList.add("negative");
  } else {
    el.classList.add("neutralValue");
  }
}

/* =========================================================
   MODE / AUTH UI
   ========================================================= */

function isAdmin() {
  return !!currentUser;
}

function setPublicNav(admin) {

  /*
    PUBLIK HANYA:
    - Trading Journal
    - Journal Performance
    - Calendar

    ADMIN:
    - Semua halaman
  */

  const publicPages = new Set([
    "journalPage",
    "performancePage",
    "calendarPage"
  ]);

  document.querySelectorAll(".navBtn").forEach(btn => {

    const page = btn.dataset.page;

    btn.style.display =
      admin || publicPages.has(page)
        ? ""
        : "none";

  });

  if (!admin) {
    openPage("journalPage");
  }
}

function setPublicControls(admin) {

  const adminControls = [
    "addTradeBtn",
    "addAccountBtn",
    "addPayoutBtn",
    "savePropBtn",
    "exportBtn",
    "modeBtn"
  ];

  adminControls.forEach(id => {

    const el = $(id);

    if (el) {
      el.classList.toggle("hidden", !admin);
    }

  });

  /*
    Semua elemen admin-only
    disembunyikan untuk publik.
  */

  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden", !admin);
  });
}

function setModeBadge(admin) {

  const badge = $("viewModeBadge");

  if (!badge) return;

  if (admin) {
    badge.textContent = "🟢 ADMIN MODE";
  } else {
    badge.textContent = "👁 VIEW ONLY";
  }
}

function getLoginButton() {
  return $("loginBtn") || $("adminLoginBtn");
}

function showAdminLogin() {

  show("appView", false);
  show("authView", true);
  show("logoutBtn", false);

  const loginBtn = getLoginButton();

  if (loginBtn) {
    loginBtn.style.display = "none";
  }

  const registerTab = $("registerTab");

  /*
    Register sengaja dimatikan.
    Hanya Admin yang dibuat dari
    Supabase Authentication.
  */

  if (registerTab) {
    registerTab.style.display = "none";
  }

  if ($("loginTab")) {
    $("loginTab").style.display = "";
  }

  if ($("authSubmit")) {
    $("authSubmit").textContent = "Login Admin";
  }

  if ($("authMsg")) {
    $("authMsg").textContent = "";
  }
}

function enterPublicUI() {

  currentUser = null;

  show("authView", false);
  show("appView", true);
  show("logoutBtn", false);

  const loginBtn = getLoginButton();

  if (loginBtn) {
    loginBtn.style.display = "";
  }

  setPublicNav(false);
  setPublicControls(false);
  setModeBadge(false);
}

async function enterAdminUI(user) {

  currentUser = user;

  show("authView", false);
  show("appView", true);
  show("logoutBtn", true);

  const loginBtn = getLoginButton();

  if (loginBtn) {
    loginBtn.style.display = "none";
  }

  setPublicNav(true);
  setPublicControls(true);
  setModeBadge(true);

  await loadAdminData();
}

/* =========================================================
   AUTH
   ========================================================= */

function setupAuth() {

  const loginBtn = getLoginButton();

  if (loginBtn) {
    loginBtn.onclick = showAdminLogin;
  }

  if ($("registerTab")) {
    $("registerTab").style.display = "none";
  }

  if ($("loginTab")) {
    $("loginTab").onclick = () => {
      authMode = "login";

      $("loginTab").classList.add("active");

      if ($("registerTab")) {
        $("registerTab").classList.remove("active");
      }

      document.querySelectorAll(".registerOnly")
        .forEach(el => el.classList.add("hidden"));

      if ($("authSubmit")) {
        $("authSubmit").textContent = "Login Admin";
      }

      if ($("authMsg")) {
        $("authMsg").textContent = "";
      }
    };
  }

  if ($("authForm")) {

    $("authForm").onsubmit = async e => {

      e.preventDefault();

      if (!$("authMsg")) return;

      $("authMsg").textContent = "Login...";

      const email = $("email")?.value.trim();
      const password = $("password")?.value;

      if (!email || !password) {
        $("authMsg").textContent =
          "Email dan password wajib diisi.";

        return;
      }

      const { error } =
        await sb.auth.signInWithPassword({
          email,
          password
        });

      if (error) {

        $("authMsg").textContent =
          "Login gagal: " + error.message;

        return;
      }

      $("authMsg").textContent =
        "Login berhasil.";

    };
  }

  if ($("logoutBtn")) {

    $("logoutBtn").onclick = async () => {

      await sb.auth.signOut();

    };

  }
}

/* =========================================================
   PUBLIC OWNER
   ========================================================= */

async function getPublicOwnerId() {

  const { data, error } =
    await sb.rpc("get_public_portal_owner_id");

  if (error) {

    console.error(
      "Gagal mengambil public owner:",
      error
    );

    return null;
  }

  return data || null;
}

/* =========================================================
   PUBLIC DATA
   ========================================================= */

async function loadPublicData() {

  publicOwnerId = await getPublicOwnerId();

  if (!publicOwnerId) {

    console.error(
      "Public owner belum dikonfigurasi."
    );

    trades = [];
    accounts = [];
    payouts = [];

    renderAll();

    return;
  }

  const [
    tradesResult,
    accountsResult,
    payoutsResult
  ] = await Promise.all([

    sb
      .from("trades")
      .select("*")
      .eq("user_id", publicOwnerId)
      .order("trade_date", {
        ascending: true
      }),

    sb
      .from("prop_accounts")
      .select("*")
      .eq("user_id", publicOwnerId)
      .order("created_at", {
        ascending: false
      }),

    sb
      .from("payouts")
      .select("*")
      .eq("user_id", publicOwnerId)
      .order("payout_date", {
        ascending: false
      })

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

  trades = tradesResult.data || [];
  accounts = accountsResult.data || [];
  payouts = payoutsResult.data || [];

  renderAll();
}

async function loadAdminData() {

  if (!currentUser) return;

  await Promise.all([
    loadTrades(),
    loadAccounts(),
    loadPayouts(),
    loadProp()
  ]);

  renderAll();
}

/* =========================================================
   TRADES
   ========================================================= */

async function loadTrades() {

  if (!currentUser) return;

  const { data, error } =
    await sb
      .from("trades")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("trade_date", {
        ascending: true
      });

  if (error) {

    console.error(
      "Load trades:",
      error
    );

    return;
  }

  trades = data || [];
}

async function loadAccounts() {

  if (!currentUser) return;

  const { data, error } =
    await sb
      .from("prop_accounts")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", {
        ascending: false
      });

  if (error) {

    console.error(
      "Load accounts:",
      error
    );

    return;
  }

  accounts = data || [];
}

async function loadPayouts() {

  if (!currentUser) return;

  const { data, error } =
    await sb
      .from("payouts")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("payout_date", {
        ascending: false
      });

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
   PROP SETTINGS
   ========================================================= */

async function loadProp() {

  if (!currentUser) return;

  const { data, error } =
    await sb
      .from("profiles")
      .select("prop_settings")
      .eq("id", currentUser.id)
      .maybeSingle();

  if (!error && data?.prop_settings) {

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

  Object.entries(map).forEach(([id, key]) => {

    if ($(id)) {
      $(id).value = prop[key];
    }

  });
}

async function saveProp() {

  if (!currentUser) {
    showAdminLogin();
    return;
  }

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

  const { error } =
    await sb
      .from("profiles")
      .update({
        prop_settings: prop
      })
      .eq("id", currentUser.id);

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
      (a, t) => a + Number(t.pl || 0),
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

  const vals = Object.values(days);

  const best =
    Math.max(0, ...vals);

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

  if (net <= -ddLimit) {

    warn =
      "⛔ Max drawdown terlampaui.";

  } else if (
    vals.some(v => v <= -dailyLimit)
  ) {

    warn =
      "⛔ Daily loss limit terlampaui.";

  } else if (
    consistency > prop.consistencyPct
  ) {

    warn =
      "⚠️ Consistency di atas batas.";

  } else if (net >= target) {

    warn =
      "✅ Target profit tercapai.";

  } else {

    warn =
      "🟢 Masih dalam batas. Sisa target: " +
      money(Math.max(0, target - net));

  }

  if ($("propWarning"))
    $("propWarning").textContent = warn;
}

/* =========================================================
   TRADE FORM
   ========================================================= */

function setupTradeForm() {

  if ($("addTradeBtn")) {

    $("addTradeBtn").onclick = () => {

      if (!currentUser) {
        showAdminLogin();
        return;
      }

      show("modal", true);

    };

  }

  if ($("closeModal")) {
    $("closeModal").onclick =
      () => show("modal", false);
  }

  if ($("tradeForm")) {

    $("tradeForm").onsubmit =
      async e => {

        e.preventDefault();

        if (!currentUser) {
          showAdminLogin();
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
            $("tAccount")?.value || null,

          trade_date:
            new Date().toISOString(),

          symbol:
            $("tSymbol")?.value
              .trim()
              .toUpperCase(),

          side:
            $("tSide")?.value || "BUY",

          entry:
            num("tEntry"),

          exit:
            num("tExit"),

          risk:
            num("tRisk"),

          pl:
            num("tPL"),

          strategy:
            $("tStrategy")?.value.trim() || "",

          timeframe:
            $("tTF")?.value.trim() || "",

          session:
            $("tSession")?.value.trim() || "",

          notes:
            $("tNotes")?.value.trim() || ""

        };

        const { error } =
          await sb
            .from("trades")
            .insert(row);

        if (error) {

          if ($("tradeMsg"))
            $("tradeMsg").textContent =
              error.message;

          return;
        }

        $("tradeForm").reset();

        if ($("tradeMsg"))
          $("tradeMsg").textContent =
            "Trade tersimpan.";

        show("modal", false);

        await loadAdminData();

      };

  }
}

/* =========================================================
   ACCOUNTS
   ========================================================= */

function fillTradeAccounts() {

  const s = $("tAccount");

  if (!s) return;

  s.innerHTML =
    '<option value="">Pilih akun prop firm</option>' +

    accounts
      .map(a =>
        `<option value="${a.id}">
          ${esc(a.firm)} — ${esc(a.account_name)}
        </option>`
      )
      .join("");
}

function fillPayoutAccounts() {

  const s = $("pAccount");

  if (!s) return;

  s.innerHTML =
    accounts
      .map(a =>
        `<option value="${a.id}">
          ${esc(a.firm)} — ${esc(a.account_name)}
        </option>`
      )
      .join("");
}

function getAccountConsistency(accountId) {

  const rows =
    trades.filter(
      t => t.account_id === accountId
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
      .reduce((s, v) => s + v, 0);

  const positiveDays =
    Object.values(daily)
      .filter(v => v > 0);

  const best =
    positiveDays.length
      ? Math.max(...positiveDays)
      : 0;

  return total > 0
    ? best / total * 100
    : 0;
}

function renderAccounts() {

  const box = $("accountList");

  if (!box) return;

  box.innerHTML =
    accounts.map(a => {

      const ats =
        trades.filter(
          t => t.account_id === a.id
        );

      const pl =
        ats.reduce(
          (s, t) => s + Number(t.pl || 0),
          0
        );

      const paid =
        payouts
          .filter(
            p =>
              p.account_id === a.id &&
              p.status === "Paid"
          )
          .reduce(
            (s, p) =>
              s + Number(p.amount || 0),
            0
          );

      const target =
        Number(a.account_size) *
        Number(a.target_pct) /
        100;

      const progress =
        target
          ? Math.max(
              0,
              pl / target * 100
            )
          : 0;

      const consistency =
        getAccountConsistency(a.id);

      const rule =
        Number(a.consistency_pct || 0);

      const consistencyClass =
        ats.length
          ? (
              !rule ||
              consistency <= rule
                ? "positive"
                : "negative"
            )
          : "neutralValue";

      return `
        <div class="panel accountCard">

          <div class="accountTop">

            <div>
              <h2>${esc(a.firm)}</h2>
              <small>
                ${esc(a.account_name)}
              </small>
            </div>

            <span class="status">
              ${esc(a.status || "")}
            </span>

          </div>

          <div class="accountMetrics">

            <div>
              <small>Size</small>
              <b>${money(a.account_size)}</b>
            </div>

            <div>
              <small>Fee</small>
              <b class="negative">
                ${money(-Number(a.purchase_fee || 0))}
              </b>
            </div>

            <div>
              <small>Trading P/L</small>
              <b class="${pl >= 0 ? "positive" : "negative"}">
                ${money(pl)}
              </b>
            </div>

            <div>
              <small>Payout</small>
              <b class="${paid > 0 ? "positive" : ""}">
                ${money(paid)}
              </b>
            </div>

            <div>
              <small>Consistency</small>
              <b class="${consistencyClass}">
                ${ats.length
                  ? consistency.toFixed(1) + "%"
                  : "—"}
              </b>
            </div>

            <div>
              <small>Rule</small>
              <b>
                ${rule ? rule + "%" : "—"}
              </b>
            </div>

          </div>

          <div class="progress">
            <i style="
              width:${Math.min(
                100,
                Math.max(0, progress)
              )}%
            "></i>
          </div>

          <div class="accountRuleLine">

            <span>
              Target ${Number(a.target_pct)}%
            </span>

            <span>
              Max DD ${Number(a.max_dd_pct)}%
            </span>

            <span>
              Daily ${Number(a.daily_loss_pct)}%
            </span>

            <span>
              Consistency ${rule}%
            </span>

          </div>

          ${
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
              : ""
          }

        </div>
      `;

    }).join("") ||

    `
      <div class="panel emptyState">
        <strong>
          Belum ada akun Prop Firm
        </strong>
      </div>
    `;
}

async function setAccountStatus(id) {

  if (!currentUser) {
    showAdminLogin();
    return;
  }

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

  const { error } =
    await sb
      .from("prop_accounts")
      .update({ status })
      .eq("id", id)
      .eq("user_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadAdminData();
}

async function deleteAccount(id) {

  if (!currentUser) {
    showAdminLogin();
    return;
  }

  if (!confirm("Hapus akun ini?")) return;

  const { error } =
    await sb
      .from("prop_accounts")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadAdminData();
}

async function editAccount(id) {

  if (!currentUser) {
    showAdminLogin();
    return;
  }

  const a =
    accounts.find(
      x => x.id === id
    );

  if (!a) return;

  editingAccountId = id;

  if ($("aFirm"))
    $("aFirm").value = a.firm || "";

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
      a.status || "Phase 1";

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
    $("accountModalTitle").textContent =
      "Edit Prop Firm Account";

  if ($("accountSubmitBtn"))
    $("accountSubmitBtn").textContent =
      "Update Account";

  show("accountModal", true);
}

window.editAccount = editAccount;

/* =========================================================
   ACCOUNT FORM
   ========================================================= */

function setupAccountForm() {

  if ($("addAccountBtn")) {

    $("addAccountBtn").onclick = () => {

      if (!currentUser) {
        showAdminLogin();
        return;
      }

      editingAccountId = null;

      $("accountForm")?.reset();

      if ($("accountModalTitle"))
        $("accountModalTitle").textContent =
          "Tambah Prop Firm Account";

      if ($("accountSubmitBtn"))
        $("accountSubmitBtn").textContent =
          "Simpan Akun";

      if ($("aStatus"))
        $("aStatus").value =
          "Phase 1";

      if ($("aTarget"))
        $("aTarget").value = 6;

      if ($("aMaxDD"))
        $("aMaxDD").value = 4;

      if ($("aDaily"))
        $("aDaily").value = 2;

      if ($("aConsistency"))
        $("aConsistency").value = 20;

      show("accountModal", true);

    };

  }

  if ($("closeAccountModal")) {

    $("closeAccountModal").onclick =
      () => show("accountModal", false);

  }

  if ($("accountForm")) {

    $("accountForm").onsubmit =
      async e => {

        e.preventDefault();

        if (!currentUser) {
          showAdminLogin();
          return;
        }

        const n = id =>
          parseFloat($(id)?.value) || 0;

        const row = {

          firm:
            $("aFirm")?.value.trim(),

          account_name:
            $("aName")?.value.trim(),

          account_size:
            n("aSize"),

          purchase_fee:
            n("aFee"),

          status:
            $("aStatus")?.value,

          target_pct:
            n("aTarget"),

          max_dd_pct:
            n("aMaxDD"),

          daily_loss_pct:
            n("aDaily"),

          consistency_pct:
            n("aConsistency"),

          start_date:
            $("aStart")?.value || null,

          notes:
            $("aNotes")?.value.trim() || ""

        };

        let result;

        if (editingAccountId) {

          result =
            await sb
              .from("prop_accounts")
              .update(row)
              .eq("id", editingAccountId)
              .eq("user_id", currentUser.id);

        } else {

          result =
            await sb
              .from("prop_accounts")
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

        editingAccountId = null;

        show("accountModal", false);

        await loadAdminData();

      };

  }
}

/* =========================================================
   PAYOUT
   ========================================================= */

function renderPayouts() {

  const box = $("payoutList");

  if (!box) return;

  box.innerHTML =
    payouts.map(p => {

      const a =
        accounts.find(
          x => x.id === p.account_id
        );

      return `
        <div class="trade">

          <div>
            <b>${money(p.amount)}</b>

            <span class="pill">
              ${esc(p.status)}
            </span>
          </div>

          <small>
            ${esc(a?.firm || "")}
            ·
            ${esc(a?.account_name || "")}
            ·
            ${esc(p.payout_date || "")}
          </small>

          <small>
            ${esc(p.note || "")}
          </small>

        </div>
      `;

    }).join("") ||

    `<p class="muted">
      Belum ada payout.
    </p>`;
}

function setupPayoutForm() {

  if ($("addPayoutBtn")) {

    $("addPayoutBtn").onclick = () => {

      if (!currentUser) {
        showAdminLogin();
        return;
      }

      fillPayoutAccounts();

      show("payoutModal", true);

    };

  }

  if ($("closePayoutModal")) {

    $("closePayoutModal").onclick =
      () => show("payoutModal", false);

  }

  if ($("payoutForm")) {

    $("payoutForm").onsubmit =
      async e => {

        e.preventDefault();

        if (!currentUser) {
          showAdminLogin();
          return;
        }

        const row = {

          user_id:
            currentUser.id,

          account_id:
            $("pAccount")?.value,

          amount:
            parseFloat(
              $("pAmount")?.value
            ) || 0,

          payout_date:
            $("pDate")?.value,

          status:
            $("pStatus")?.value,

          note:
            $("pNote")?.value.trim() || ""

        };

        const { error } =
          await sb
            .from("payouts")
            .insert(row);

        if (error) {

          if ($("payoutMsg"))
            $("payoutMsg").textContent =
              error.message;

          return;
        }

        $("payoutForm").reset();

        show("payoutModal", false);

        await loadAdminData();

      };

  }
}

/* =========================================================
   GLOBAL DASHBOARD
   ========================================================= */

function renderGlobal() {

  const fees =
    accounts.reduce(
      (s, a) =>
        s +
        Number(a.purchase_fee || 0),
      0
    );

  const pays =
    payouts
      .filter(p => p.status === "Paid")
      .reduce(
        (s, p) =>
          s +
          Number(p.amount || 0),
        0
      );

  const vals =
    trades.map(
      t => Number(t.pl || 0)
    );

  const pl =
    vals.reduce(
      (s, v) => s + v,
      0
    );

  const wins =
    vals.filter(v => v > 0);

  const losses =
    vals.filter(v => v < 0);

  const grossW =
    wins.reduce(
      (s, v) => s + v,
      0
    );

  const grossL =
    Math.abs(
      losses.reduce(
        (s, v) => s + v,
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
      ? netCash / fees * 100
      : 0;

  const countStatus =
    s =>
      accounts.filter(
        a =>
          (a.status || "")
            .toLowerCase()
            .replace(/\s+/g, " ") === s
      ).length;

  const values = [

    ["gTradingPL", money(pl)],
    ["gWinRate", wr.toFixed(1) + "%"],
    ["gTradeCount", vals.length],
    ["gProfitFactor", pf.toFixed(2)],

    ["gFees", money(-fees)],
    ["gPayouts", money(pays)],
    ["gNet", money(netCash)],
    ["gCashROI", roi.toFixed(1) + "%"],

    ["gAccounts", accounts.length],
    ["gPhase1", countStatus("phase 1")],
    ["gPhase2", countStatus("phase 2")],
    ["gFunded", countStatus("funded")]

  ];

  values.forEach(([id, value]) => {

    if ($(id)) {
      $(id).textContent = value;
    }

  });

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
    "gProfitFactor",
    pf
  );

  setValueClass(
    "gNet",
    netCash
  );

  const todayKey =
    new Date()
      .toISOString()
      .slice(0, 10);

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

  const todayPL =
    daily[todayKey] || 0;

  const dayVals =
    Object.values(daily);

  const bestDay =
    dayVals.length
      ? Math.max(...dayVals)
      : 0;

  const worstDay =
    dayVals.length
      ? Math.min(...dayVals)
      : 0;

  if ($("gTodayPL"))
    $("gTodayPL").textContent =
      money(todayPL);

  if ($("gBestDay"))
    $("gBestDay").textContent =
      money(bestDay);

  if ($("gWorstDay"))
    $("gWorstDay").textContent =
      money(worstDay);

  if ($("gRiskAccounts")) {

    const risk =
      accounts.filter(a => {

        const c =
          getAccountConsistency(a.id);

        const rule =
          Number(a.consistency_pct || 0);

        return rule > 0 && c > rule;

      }).length;

    $("gRiskAccounts").textContent =
      risk;

  }

  const list =
    $("globalAccountList");

  if (list) {

    list.innerHTML =
      accounts.map(a => {

        const plA =
          trades
            .filter(
              t =>
                t.account_id === a.id
            )
            .reduce(
              (s, t) =>
                s + Number(t.pl || 0),
              0
            );

        const paid =
          payouts
            .filter(
              p =>
                p.account_id === a.id &&
                p.status === "Paid"
            )
            .reduce(
              (s, p) =>
                s +
                Number(p.amount || 0),
              0
            );

        return `
          <div class="globalAccountRow">

            <div>
              <b>
                ${esc(a.firm)}
                —
                ${esc(a.account_name)}
              </b>

              <span class="dashStatus">
                ${esc(a.status || "")}
              </span>
            </div>

            <div class="accountOverviewStats">

              <small>
                P/L ${money(plA)}
                ·
                Payout ${money(paid)}
              </small>

              <span>
                Consistency
                ${getAccountConsistency(a.id).toFixed(1)}%
              </span>

            </div>

          </div>
        `;

      }).join("") ||

      `<p class="muted">
        Belum ada akun Prop Firm.
      </p>`;

  }

  drawGlobalEquity();
}

function drawGlobalEquity() {

  const c =
    $("globalEquityChart");

  if (!c) return;

  const ts =
    [...trades].sort(
      (a, b) =>
        new Date(a.trade_date) -
        new Date(b.trade_date)
    );

  const ctx =
    c.getContext("2d");

  const w =
    c.width =
      (c.clientWidth || 600) * 2;

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
      $("gEquityLabel").textContent =
        "$0.00";

    return;
  }

  let eq = 0;

  const pts = [0];

  ts.forEach(t => {

    eq += Number(t.pl || 0);

    pts.push(eq);

  });

  if ($("gEquityLabel"))
    $("gEquityLabel").textContent =
      money(eq);

  let min =
    Math.min(...pts, 0);

  let max =
    Math.max(...pts, 0);

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
      (v - min) /
      (max - min) *
      h;

  ctx.beginPath();

  pts.forEach((v, i) => {

    if (i === 0)
      ctx.moveTo(X(i), Y(v));
    else
      ctx.lineTo(X(i), Y(v));

  });

  ctx.strokeStyle =
    "#3fb950";

  ctx.lineWidth = 5;

  ctx.stroke();
}

/* =========================================================
   JOURNAL
   ========================================================= */

function renderJournal() {

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

  const wr =
    total
      ? wins.length /
        total *
        100
      : 0;

  const pf =
    grossLoss
      ? grossWin /
        grossLoss
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

  let equity = 0;
  let peak = 0;
  let maxDD = 0;

  const eq = [];

  trades.forEach(t => {

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

    eq.push(equity);

  });

  if ($("maxDD"))
    $("maxDD").textContent =
      money(-maxDD);

  if ($("equityLabel"))
    $("equityLabel").textContent =
      money(equity);

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
    Math.max(
      0,
      ...Object.values(days)
    );

  if ($("bestDay"))
    $("bestDay").textContent =
      money(bestDay);

  const q =
    $("search")?.value
      .toLowerCase() || "";

  const filtered =
    trades.filter(t => {

      const text =
        [
          t.symbol,
          t.strategy,
          t.session
        ]
          .join(" ")
          .toLowerCase();

      return text.includes(q);

    });

  const list =
    $("tradeList");

  if (list) {

    list.innerHTML =
      filtered
        .slice()
        .reverse()
        .map(t => {

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

                ${
                  currentUser
                    ? `
                      <button
                        class="danger"
                        onclick="deleteTrade('${t.id}')">
                        Hapus
                      </button>
                    `
                    : ""
                }

              </div>

              <small>
                ${esc(t.strategy || "")}
                ${esc(t.timeframe || "")}
                ${esc(t.session || "")}
              </small>

            </div>
          `;

        }).join("") ||

      `<p class="muted">
        Belum ada trade.
      </p>`;

  }

  drawEquity(eq);
}

function drawEquity(data) {

  const c =
    $("equityChart");

  if (!c) return;

  const dpr =
    window.devicePixelRatio || 1;

  const w =
    c.clientWidth || 600;

  const h = 260;

  c.width =
    w * dpr;

  c.height =
    h * dpr;

  const ctx =
    c.getContext("2d");

  ctx.scale(dpr, dpr);

  ctx.clearRect(
    0,
    0,
    w,
    h
  );

  if (!data.length) return;

  const min =
    Math.min(0, ...data);

  const max =
    Math.max(0, ...data);

  const range =
    max - min || 1;

  ctx.beginPath();

  data.forEach((v, i) => {

    const px =
      data.length === 1
        ? w / 2
        : i /
          (data.length - 1) *
          w;

    const py =
      h -
      (v - min) /
      range *
      h *
      0.8 -
      10;

    if (i === 0)
      ctx.moveTo(px, py);
    else
      ctx.lineTo(px, py);

  });

  ctx.strokeStyle =
    "#27d39a";

  ctx.lineWidth = 3;

  ctx.stroke();
}

window.deleteTrade =
  async function(id) {

    if (!currentUser) {
      showAdminLogin();
      return;
    }

    if (!confirm("Hapus trade ini?"))
      return;

    const { error } =
      await sb
        .from("trades")
        .delete()
        .eq("id", id)
        .eq("user_id", currentUser.id);

    if (error) {

      alert(error.message);
      return;

    }

    await loadAdminData();

  };

/* =========================================================
   PERFORMANCE
   ========================================================= */

function setupPerfFilters() {

  const fill =
    (id, values) => {

      const s = $(id);

      if (!s) return;

      const old =
        s.value;

      s.innerHTML =
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

      s.value = old;

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
              ${esc(a.account_name)}
            </option>`
        )
        .join("");

    account.value = old;

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
    $("perfAccount")?.value || "";

  const st =
    $("perfStrategy")?.value || "";

  const tf =
    $("perfTF")?.value || "";

  const se =
    $("perfSession")?.value || "";

  const from =
    $("perfFrom")?.value || "";

  const to =
    $("perfTo")?.value || "";

  return trades
    .filter(t => {

      const d =
        new Date(t.trade_date)
          .toISOString()
          .slice(0, 10);

      return (
        (!aid ||
          t.account_id === aid) &&

        (!st ||
          t.strategy === st) &&

        (!tf ||
          t.timeframe === tf) &&

        (!se ||
          t.session === se) &&

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

function groupPerf(ts, key) {

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
      Number(t.pl || 0);

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
        b.pl - a.pl
    );
}

function renderPerfTable(id, rows) {

  const el = $(id);

  if (!el) return;

  el.innerHTML =
    rows.map(x => {

      return `
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
            ${x.n} trades
            ·
            ${x.w}W /
            ${x.l}L
            ·

            <b class="${
              x.pl >= 0
                ? "positive"
                : "negative"
            }">
              ${money(x.pl)}
            </b>
          </small>

        </div>
      `;

    }).join("") ||

    `<p class="muted">
      Belum ada data.
    </p>`;
}

function renderPerformance() {

  setupPerfFilters();

  const ts =
    getPerfTrades();

  const vals =
    ts.map(
      t => Number(t.pl || 0)
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
      (a, b) => a + b,
      0
    );

  const grossW =
    wins.reduce(
      (a, b) => a + b,
      0
    );

  const grossL =
    Math.abs(
      losses.reduce(
        (a, b) => a + b,
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
      ? grossW / grossL
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

    eq +=
      Number(t.pl || 0);

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
      new Date(t.trade_date)
        .toISOString()
        .slice(0, 10);

    days[d] =
      (days[d] || 0) +
      Number(t.pl || 0);

  });

  const dayVals =
    Object.values(days);

  const best =
    dayVals.length
      ? Math.max(...dayVals)
      : 0;

  const worst =
    dayVals.length
      ? Math.min(...dayVals)
      : 0;

  const values = [

    ["pTotal", ts.length],
    ["pWinRate", wr.toFixed(1) + "%"],
    ["pNet", money(net)],
    ["pPF", pf.toFixed(2)],
    ["pAvgWin", money(avgW)],
    ["pAvgLoss", money(-avgL)],
    ["pExpectancy", money(exp)],
    ["pMaxDD", money(-maxDD)],
    ["pBestDay", money(best)],
    ["pWorstDay", money(worst)],
    ["pWins", wins.length],
    ["pLosses", losses.length],
    ["perfEquity", money(eq)]

  ];

  values.forEach(([id, v]) => {

    if ($(id)) {
      $(id).textContent = v;
    }

  });

  renderPerfTable(
    "perfAccounts",
    groupPerf(
      ts,
      "account_id"
    ).map(x => {

      const a =
        accounts.find(
          a => a.id === x.name
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
    Object
      .entries(days)
      .sort(
        (a, b) =>
          b[0].localeCompare(a[0])
      );

  if ($("perfDays")) {

    $("perfDays").innerHTML =
      pd.map(
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
      ).join("") ||

      `<p class="muted">
        Belum ada data.
      </p>`;

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
      (c.clientWidth || 600) * 2;

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

    eq +=
      Number(t.pl || 0);

    pts.push(eq);

  });

  let min =
    Math.min(...pts);

  let max =
    Math.max(...pts);

  if (min === max) {

    min -= 1;
    max += 1;

  }

  ctx.beginPath();

  pts.forEach((v, i) => {

    const x =
      i /
      (pts.length - 1) *
      w;

    const y =
      h -
      (v - min) /
      (max - min) *
      h;

    if (i === 0)
      ctx.moveTo(x, y);
    else
      ctx.lineTo(x, y);

  });

  ctx.strokeStyle =
    "#58a6ff";

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
    new Date(calendarCursor);

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

  let title =
    now.toLocaleDateString(
      "id-ID",
      {
        month: "long",
        year: "numeric"
      }
    );

  if ($("calTitle")) {

    $("calTitle")
      .textContent =
      title.charAt(0).toUpperCase() +
      title.slice(1);

  }

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
              .slice(0, 10) === key
        )
        .reduce(
          (s, t) =>
            s +
            Number(t.pl || 0),
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

        <b>${d}</b>

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

  box.innerHTML = html;
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function openPage(pageId) {

  /*
    Publik tidak boleh membuka
    halaman admin walaupun mencoba
    lewat URL / console.
  */

  if (
    !currentUser &&
    ![
      "journalPage",
      "performancePage",
      "calendarPage"
    ].includes(pageId)
  ) {

    pageId = "journalPage";

  }

  document
    .querySelectorAll(".page")
    .forEach(
      p =>
        p.classList.add("hidden")
    );

  document
    .querySelectorAll(".navBtn")
    .forEach(
      b =>
        b.classList.toggle(
          "active",
          b.dataset.page === pageId
        )
    );

  const page =
    $(pageId);

  if (page) {
    page.classList.remove("hidden");
  }

  if (pageId === "globalPage")
    renderGlobal();

  if (pageId === "performancePage")
    renderPerformance();

  if (pageId === "accountsPage")
    renderAccounts();

  if (pageId === "payoutsPage")
    renderPayouts();

  if (pageId === "calendarPage")
    renderCalendar();

  if (pageId === "journalPage")
    renderJournal();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

window.openPage =
  openPage;

document.addEventListener(
  "click",
  e => {

    const nav =
      e.target.closest(".navBtn");

    if (nav) {

      e.preventDefault();

      openPage(
        nav.dataset.page
      );

      return;

    }

    const day =
      e.target.closest(".calDay");

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
   SEARCH
   ========================================================= */

if ($("search")) {

  $("search").oninput =
    renderJournal;

}

/* =========================================================
   CALENDAR BUTTONS
   ========================================================= */

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
   PERFORMANCE FILTERS
   ========================================================= */

[
  "perfAccount",
  "perfStrategy",
  "perfTF",
  "perfSession",
  "perfFrom",
  "perfTo"
].forEach(id => {

  if ($(id)) {

    $(id).addEventListener(
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

        if ($(id))
          $(id).value = "";

      });

      renderPerformance();

    };

}

/* =========================================================
   EXPORT CSV
   ========================================================= */

if ($("exportBtn")) {

  $("exportBtn").onclick =
    () => {

      if (!currentUser) {
        showAdminLogin();
        return;
      }

      const headers = [
        "date",
        "symbol",
        "side",
        "entry",
        "exit",
        "risk",
        "pl",
        "strategy",
        "timeframe",
        "session",
        "notes"
      ];

      const rows =
        trades.map(
          t =>
            headers
              .map(
                h =>
                  `"${String(
                    h === "date"
                      ? t.trade_date
                      : t[h] ?? ""
                  ).replaceAll(
                    '"',
                    '""'
                  )}"`
              )
              .join(",")
        );

      const blob =
        new Blob(
          [
            [
              headers.join(","),
              ...rows
            ].join("\n")
          ],
          {
            type:
              "text/csv"
          }
        );

      const a =
        document.createElement(
          "a"
        );

      a.href =
        URL.createObjectURL(
          blob
        );

      a.download =
        "inzakifx-trades.csv";

      a.click();

      URL.revokeObjectURL(
        a.href
      );

    };

}

/* =========================================================
   MODE BUTTON
   ========================================================= */

if ($("modeBtn")) {

  $("modeBtn").onclick =
    () => {

      if (!currentUser) {
        showAdminLogin();
        return;
      }

      show(
        "propPanel",
        $("propPanel")
          ?.classList.contains(
            "hidden"
          )
      );

      renderProp();

    };

}

if ($("savePropBtn")) {
  $("savePropBtn").onclick =
    saveProp;
}

/* =========================================================
   RENDER ALL
   ========================================================= */

function renderAll() {

  renderJournal();
  renderPerformance();
  renderCalendar();
  renderGlobal();
  renderAccounts();
  renderPayouts();

  fillTradeAccounts();
  fillPayoutAccounts();

  if (currentUser) {
    renderProp();
  }

}

/* =========================================================
   INIT
   ========================================================= */

async function init() {

  setupAuth();
  setupTradeForm();
  setupAccountForm();
  setupPayoutForm();

  /*
    Cek session admin.
  */

  const {
    data: {
      session
    }
  } =
    await sb.auth.getSession();

  if (session) {

    await enterAdminUI(
      session.user
    );

  } else {

    /*
      PENTING:
      Tidak menampilkan Login.
      Langsung View Only.
    */

    enterPublicUI();

    await loadPublicData();

  }

  /*
    Supabase Auth listener
  */

  sb.auth.onAuthStateChange(
    async (_event, session) => {

      if (session) {

        await enterAdminUI(
          session.user
        );

      } else {

        enterPublicUI();

        await loadPublicData();

      }

    }
  );

}

/* =========================================================
   START
   ========================================================= */

init();

/* =========================================================
   RESIZE
   ========================================================= */

window.addEventListener(
  "resize",
  () => {

    if (
      !$("appView") ||
      $("appView")
        .classList
        .contains("hidden")
    ) {
      return;
    }

    renderGlobal();
    renderJournal();
    renderPerformance();

  }
);
