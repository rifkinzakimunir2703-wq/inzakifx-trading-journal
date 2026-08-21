// app.js
// Portal Trading Journal
// Public: View Only
// Admin: Full Access

let currentUser = null;
let trades = [];
let calendarCursor = new Date();

// ===============================
// SUPABASE
// ===============================
const supabaseClient = window.supabaseClient || window.supabase;

// ===============================
// AUTH
// ===============================
async function checkAuth() {
  try {
    const { data } = await supabaseClient.auth.getSession();
    currentUser = data?.session?.user || null;

    updateViewMode();

    if (currentUser) {
      await loadAllData();
    } else {
      await loadPublicData();
    }
  } catch (error) {
    console.error("Auth error:", error);
    updateViewMode();
  }
}

function updateViewMode() {
  const isAdmin = !!currentUser;

  document.body.classList.toggle("admin-mode", isAdmin);
  document.body.classList.toggle("view-only-mode", !isAdmin);

  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = isAdmin ? "" : "none";
  });

  const loginBtn = document.getElementById("adminLoginBtn");

  if (loginBtn) {
    loginBtn.style.display = isAdmin ? "none" : "";
  }

  const authView = document.getElementById("authView");
  const appView = document.getElementById("appView");

  if (isAdmin) {
    if (authView) authView.classList.add("hidden");
    if (appView) appView.classList.remove("hidden");
  } else {
    if (authView) authView.classList.add("hidden");
    if (appView) appView.classList.remove("hidden");
  }
}

function showAdminLogin() {
  const authView = document.getElementById("authView");
  const appView = document.getElementById("appView");
  const loginBtn = document.getElementById("adminLoginBtn");

  if (authView) authView.classList.remove("hidden");
  if (appView) appView.classList.add("hidden");
  if (loginBtn) loginBtn.style.display = "none";
}

// ===============================
// LOGIN
// ===============================
async function loginAdmin(email, password) {
  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    alert(error.message);
    return false;
  }

  currentUser = data.user;
  updateViewMode();
  await loadAllData();

  return true;
}

// ===============================
// LOGOUT
// ===============================
async function logoutAdmin() {
  await supabaseClient.auth.signOut();

  currentUser = null;
  updateViewMode();
  await loadPublicData();
}

// ===============================
// LOAD DATA
// ===============================
async function loadAllData() {
  await loadTrades();
  await loadPropAccounts();
  await loadPayouts();

  renderJournal();
  renderPerformance();
  renderCalendar();
}

async function loadPublicData() {
  await loadTrades();

  renderJournal();
  renderPerformance();
  renderCalendar();
}

// ===============================
// TRADES
// ===============================
async function loadTrades() {
  try {
    const { data, error } = await supabaseClient
      .from("trades")
      .select("*")
      .order("trade_date", { ascending: false });

    if (error) {
      console.error("Load trades:", error);
      return;
    }

    trades = data || [];
  } catch (error) {
    console.error(error);
  }
}

// ===============================
// PROP ACCOUNTS
// ===============================
async function loadPropAccounts() {
  if (!currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from("prop_accounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load prop accounts:", error);
      return;
    }

    window.propAccounts = data || [];
  } catch (error) {
    console.error(error);
  }
}

// ===============================
// PAYOUTS
// ===============================
async function loadPayouts() {
  if (!currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from("payouts")
      .select("*")
      .order("payout_date", { ascending: false });

    if (error) {
      console.error("Load payouts:", error);
      return;
    }

    window.payouts = data || [];
  } catch (error) {
    console.error(error);
  }
}

// ===============================
// FORMAT MONEY
// ===============================
function money(value) {
  const n = Number(value || 0);

  return n.toLocaleString("id-ID", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

// ===============================
// FORMAT DATE
// ===============================
function formatDate(date) {
  if (!date) return "-";

  return new Date(date).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

// ===============================
// JOURNAL
// ===============================
function renderJournal() {
  const container =
    document.getElementById("journalList") ||
    document.getElementById("tradingJournal");

  if (!container) return;

  if (!trades.length) {
    container.innerHTML = `
      <div class="empty-state">
        Belum ada trading journal.
      </div>
    `;
    return;
  }

  container.innerHTML = trades.map(trade => {
    const pl = Number(trade.pl || 0);

    return `
      <div class="journal-card">
        <div class="journal-date">
          ${formatDate(trade.trade_date)}
        </div>

        <div class="journal-main">
          <strong>${trade.symbol || "XAUUSD"}</strong>

          <span class="${pl >= 0 ? "profit" : "loss"}">
            ${money(pl)}
          </span>
        </div>

        <div class="journal-info">
          <span>Direction: ${trade.direction || "-"}</span>
          <span>Entry: ${trade.entry ?? "-"}</span>
          <span>SL: ${trade.sl ?? "-"}</span>
          <span>TP: ${trade.tp ?? "-"}</span>
        </div>

        ${
          trade.notes
            ? `<div class="journal-notes">${trade.notes}</div>`
            : ""
        }

        ${
          currentUser
            ? `
              <div class="admin-actions">
                <button onclick="editTrade('${trade.id}')">
                  Edit
                </button>

                <button onclick="deleteTrade('${trade.id}')">
                  Delete
                </button>
              </div>
            `
            : ""
        }
      </div>
    `;
  }).join("");
}

// ===============================
// ADD TRADE
// ===============================
async function addTrade(tradeData) {
  if (!currentUser) {
    alert("Login admin diperlukan.");
    return;
  }

  const { error } = await supabaseClient
    .from("trades")
    .insert([tradeData]);

  if (error) {
    alert(error.message);
    return;
  }

  await loadTrades();

  renderJournal();
  renderPerformance();
  renderCalendar();
}

// ===============================
// DELETE TRADE
// ===============================
async function deleteTrade(id) {
  if (!currentUser) {
    alert("Login admin diperlukan.");
    return;
  }

  if (!confirm("Hapus jurnal ini?")) return;

  const { error } = await supabaseClient
    .from("trades")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadTrades();

  renderJournal();
  renderPerformance();
  renderCalendar();
}

// ===============================
// EDIT TRADE
// ===============================
async function editTrade(id) {
  if (!currentUser) {
    alert("Login admin diperlukan.");
    return;
  }

  const trade = trades.find(t => String(t.id) === String(id));

  if (!trade) return;

  // Gunakan form edit yang sudah ada di HTML jika tersedia.
  if (typeof openEditTradeModal === "function") {
    openEditTradeModal(trade);
    return;
  }

  alert("Form edit belum tersedia pada halaman ini.");
}

// ===============================
// PERFORMANCE
// ===============================
function renderPerformance() {
  const container =
    document.getElementById("performancePage") ||
    document.getElementById("performance");

  if (!container) return;

  const totalTrades = trades.length;

  const wins = trades.filter(t => Number(t.pl || 0) > 0).length;
  const losses = trades.filter(t => Number(t.pl || 0) < 0).length;

  const totalPL = trades.reduce(
    (sum, trade) => sum + Number(trade.pl || 0),
    0
  );

  const winrate =
    totalTrades > 0
      ? (wins / totalTrades) * 100
      : 0;

  const existingStats =
    container.querySelector(".performance-stats");

  if (!existingStats) return;

  existingStats.innerHTML = `
    <div class="stat-card">
      <small>Total Trade</small>
      <strong>${totalTrades}</strong>
    </div>

    <div class="stat-card">
      <small>Win</small>
      <strong>${wins}</strong>
    </div>

    <div class="stat-card">
      <small>Loss</small>
      <strong>${losses}</strong>
    </div>

    <div class="stat-card">
      <small>Winrate</small>
      <strong>${winrate.toFixed(1)}%</strong>
    </div>

    <div class="stat-card">
      <small>Total P/L</small>
      <strong class="${totalPL >= 0 ? "profit" : "loss"}">
        ${money(totalPL)}
      </strong>
    </div>
  `;
}

// ===============================
// CALENDAR
// ===============================
function renderCalendar() {
  const box = document.getElementById("calendarGrid");

  if (!box) return;

  const current = new Date(calendarCursor);

  const year = current.getFullYear();
  const month = current.getMonth();

  const firstDay = new Date(
    year,
    month,
    1
  ).getDay();

  const totalDays = new Date(
    year,
    month + 1,
    0
  ).getDate();

  const title =
    document.getElementById("calTitle");

  if (title) {
    const text = current.toLocaleDateString(
      "id-ID",
      {
        month: "long",
        year: "numeric"
      }
    );

    title.textContent =
      text.charAt(0).toUpperCase() +
      text.slice(1);
  }

  const dayNames = [
    "Min",
    "Sen",
    "Sel",
    "Rab",
    "Kam",
    "Jum",
    "Sab"
  ];

  let html = dayNames
    .map(day =>
      `<div class="calHead">${day}</div>`
    )
    .join("");

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="calEmpty"></div>`;
  }

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(
      year,
      month,
      day
    );

    const key =
      date.toISOString().slice(0, 10);

    const dayTrades = trades.filter(trade => {
      if (!trade.trade_date) return false;

      return new Date(trade.trade_date)
        .toISOString()
        .slice(0, 10) === key;
    });

    const pl = dayTrades.reduce(
      (sum, trade) =>
        sum + Number(trade.pl || 0),
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
        class="
          calDay
          ${pl > 0 ? "calWin" : ""}
          ${pl < 0 ? "calLoss" : ""}
          ${today ? "calToday" : ""}
        "
        data-date="${key}"
      >
        <b>${day}</b>
        <small>
          ${pl ? money(pl) : "—"}
        </small>
      </button>
    `;
  }

  box.innerHTML = html;
}

// ===============================
// CALENDAR NAVIGATION
// ===============================
document.addEventListener(
  "click",
  event => {
    const day =
      event.target.closest(".calDay");

    if (!day) return;

    const date = day.dataset.date;

    const from =
      document.getElementById("perfFrom");

    const to =
      document.getElementById("perfTo");

    if (from) from.value = date;
    if (to) to.value = date;

    openPage("performancePage");

    if (
      typeof renderPerformance ===
      "function"
    ) {
      renderPerformance();
    }
  }
);

document.addEventListener(
  "DOMContentLoaded",
  () => {
    const prev =
      document.getElementById("calPrev");

    const next =
      document.getElementById("calNext");

    if (prev) {
      prev.onclick = () => {
        calendarCursor.setMonth(
          calendarCursor.getMonth() - 1
        );

        renderCalendar();
      };
    }

    if (next) {
      next.onclick = () => {
        calendarCursor.setMonth(
          calendarCursor.getMonth() + 1
        );

        renderCalendar();
      };
    }
  }
);

// ===============================
// PAGE NAVIGATION
// ===============================
function openPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach(page => {
      page.classList.add("hidden");
    });

  const page =
    document.getElementById(pageId);

  if (page) {
    page.classList.remove("hidden");
  }

  document
    .querySelectorAll(".navBtn")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.page === pageId
      );
    });

  if (pageId === "calendarPage") {
    renderCalendar();
  }

  if (pageId === "performancePage") {
    renderPerformance();
  }

  if (pageId === "journalPage") {
    renderJournal();
  }
}

// ===============================
// NAVIGATION BUTTONS
// ===============================
document.addEventListener(
  "DOMContentLoaded",
  () => {
    document
      .querySelectorAll(".navBtn")
      .forEach(btn => {
        btn.addEventListener(
          "click",
          () => {
            const page =
              btn.dataset.page;

            if (page) {
              openPage(page);
            }
          }
        );
      });

    checkAuth();
  }
);

// ===============================
// SUPABASE AUTH STATE
// ===============================
if (
  supabaseClient &&
  supabaseClient.auth
) {
  supabaseClient.auth.onAuthStateChange(
    async (_event, session) => {
      currentUser =
        session?.user || null;

      updateViewMode();

      if (currentUser) {
        await loadAllData();
      } else {
        await loadPublicData();
      }
    }
  );
}
