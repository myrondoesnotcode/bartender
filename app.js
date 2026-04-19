// ─── STATE ───────────────────────────────────────────────
let currentOrder  = []; // { drink, qty }
let currentBills  = [];
let currentMonth  = "";
let orderOpen     = false;
let billingReady  = false;
let tableReady    = false;

// ─── SCREENS ─────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ─── API ─────────────────────────────────────────────────
async function api(params) {
  return apiFetch(params, sessionStorage.getItem("password") || "");
}

async function apiFetch(params, pw) {
  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  Object.entries({ ...params, password: pw }).forEach(([k, v]) =>
    url.searchParams.set(k, v)
  );
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Network error");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ─── LOGIN ───────────────────────────────────────────────
async function login() {
  const pw  = document.getElementById("login-password").value.trim();
  const err = document.getElementById("login-error");
  if (!pw) return;
  err.classList.remove("visible");

  // Demo mode: if Apps Script not yet configured, accept password locally
  const isDemo = CONFIG.APPS_SCRIPT_URL.includes("YOUR_SCRIPT_ID");
  if (isDemo) {
    if (pw === "1948") {
      sessionStorage.setItem("password", pw);
      showScreen("screen-billing");
      initBilling();
    } else {
      err.classList.add("visible");
    }
    return;
  }

  try {
    await apiFetch({ action: "getMonths" }, pw);
    sessionStorage.setItem("password", pw);
    showScreen("screen-billing");
    initBilling();
  } catch {
    err.classList.add("visible");
  }
}

// ─── NAV ─────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      showScreen(target);
      if (target === "screen-billing") initBilling();
      if (target === "screen-table")   initTable();
    });
  });
}

// ─── BILLING: ACCOUNT LOOKUP ─────────────────────────────
let lookupTimer = null;

function initBilling() {
  if (billingReady) return;
  billingReady = true;

  renderDrinks("all");

  document.getElementById("cat-tabs").addEventListener("click", e => {
    const tab = e.target.closest(".cat-tab");
    if (!tab) return;
    document.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    renderDrinks(tab.dataset.cat);
  });

  document.getElementById("bill-account").addEventListener("input", e => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(() => lookup(e.target.value.trim()), 380);
  });

  document.getElementById("order-bar").addEventListener("click", toggleOrder);
  document.getElementById("bill-submit").addEventListener("click", submitBill);
}

async function lookup(account) {
  const display = document.getElementById("customer-display");
  const newRow  = document.getElementById("new-customer-row");

  if (!account) {
    display.innerHTML = '<span class="cust-placeholder">Enter an account number</span>';
    newRow.classList.add("hidden");
    return;
  }

  display.innerHTML = '<span class="cust-loading">Looking up…</span>';
  try {
    const r = await api({ action: "lookup", account });
    if (r.found) {
      display.innerHTML = `<span class="cust-found">${r.name}</span>`;
      newRow.classList.add("hidden");
    } else {
      display.innerHTML = '<span class="cust-not-found">Account not found</span>';
      newRow.classList.remove("hidden");
    }
  } catch {
    display.innerHTML = '<span class="cust-not-found">Lookup failed</span>';
  }
}

// ─── DRINKS GRID ─────────────────────────────────────────
function renderDrinks(cat) {
  const list = cat === "all"
    ? CONFIG.DRINKS
    : CONFIG.DRINKS.filter(d => d.cat === cat);

  const grid = document.getElementById("drinks-grid");
  grid.innerHTML = "";

  list.forEach(drink => {
    const inOrder = currentOrder.find(o => o.drink.id === drink.id);
    const card = document.createElement("div");
    card.className = "drink-card" + (inOrder ? " has-items" : "");
    card.dataset.id = drink.id;
    card.innerHTML = `
      ${inOrder ? `<span class="drink-badge">${inOrder.qty}</span>` : ""}
      <span class="drink-name">${drink.name}</span>
      <span class="drink-price">₪${drink.price}</span>
    `;
    card.addEventListener("click", () => addDrink(drink));
    grid.appendChild(card);
  });
}

function addDrink(drink) {
  const existing = currentOrder.find(o => o.drink.id === drink.id);
  if (existing) {
    existing.qty++;
  } else {
    currentOrder.push({ drink, qty: 1 });
    // Auto-open order panel on first item
    if (currentOrder.length === 1) openOrder();
  }
  syncOrderUI();
  refreshActiveDrinks();
}

function refreshActiveDrinks() {
  const cat = document.querySelector(".cat-tab.active")?.dataset.cat || "all";
  renderDrinks(cat);
}

// ─── ORDER PANEL ─────────────────────────────────────────
function openOrder() {
  orderOpen = true;
  document.getElementById("order-panel").classList.remove("collapsed");
}

function toggleOrder() {
  orderOpen = !orderOpen;
  document.getElementById("order-panel").classList.toggle("collapsed", !orderOpen);
}

function syncOrderUI() {
  const total = currentOrder.reduce((s, o) => s + o.drink.price * o.qty, 0);
  const count = currentOrder.reduce((s, o) => s + o.qty, 0);

  document.getElementById("order-count").textContent = count;
  document.getElementById("order-total").textContent  = `₪${total.toFixed(2)}`;

  const container = document.getElementById("order-items");

  if (!currentOrder.length) {
    container.innerHTML = '<p class="order-empty">No drinks added yet — tap any drink above</p>';
    return;
  }

  container.innerHTML = "";
  currentOrder.forEach((o, idx) => {
    const row = document.createElement("div");
    row.className = "order-item";
    row.innerHTML = `
      <span class="oi-name">${o.drink.name}</span>
      <div class="oi-qty">
        <button class="qty-btn" data-act="dec" data-i="${idx}">−</button>
        <span class="oi-qty-num">${o.qty}</span>
        <button class="qty-btn" data-act="inc" data-i="${idx}">+</button>
      </div>
      <span class="oi-price">₪${(o.drink.price * o.qty).toFixed(2)}</span>
      <button class="oi-remove" data-i="${idx}">✕</button>
    `;
    container.appendChild(row);
  });

  container.addEventListener("click", e => {
    const btn = e.target.closest("[data-act], .oi-remove");
    if (!btn) return;
    const i = parseInt(btn.dataset.i);
    if (btn.classList.contains("oi-remove")) {
      currentOrder.splice(i, 1);
    } else if (btn.dataset.act === "inc") {
      currentOrder[i].qty++;
    } else if (btn.dataset.act === "dec") {
      currentOrder[i].qty--;
      if (currentOrder[i].qty <= 0) currentOrder.splice(i, 1);
    }
    syncOrderUI();
    refreshActiveDrinks();
  }, { once: true });
}

// ─── SUBMIT BILL ─────────────────────────────────────────
async function submitBill() {
  const account = document.getElementById("bill-account").value.trim();
  const newName = document.getElementById("bill-new-name").value.trim();
  const note    = document.getElementById("bill-description").value.trim();
  const isNew   = !document.getElementById("new-customer-row").classList.contains("hidden");
  const fb      = document.getElementById("bill-feedback");

  if (!account)             return feedback(fb, "Please enter an account number.", "error");
  if (!currentOrder.length) return feedback(fb, "Add at least one drink first.", "error");
  if (isNew && !newName)    return feedback(fb, "Enter the customer name to add them.", "error");

  const total   = currentOrder.reduce((s, o) => s + o.drink.price * o.qty, 0);
  const autoDesc = currentOrder
    .map(o => o.qty > 1 ? `${o.drink.name} ×${o.qty}` : o.drink.name)
    .join(", ");
  const desc = note ? `${autoDesc} — ${note}` : autoDesc;

  const btn = document.getElementById("bill-submit");
  btn.disabled = true; btn.textContent = "Submitting…";

  try {
    await api({
      action: isNew ? "addAndBill" : "bill",
      account,
      amount: total.toFixed(2),
      desc,
      name: newName,
    });
    feedback(fb, "✓ Bill submitted!", "success");
    resetBillingForm();
    tableReady = false;
  } catch (err) {
    feedback(fb, "Error: " + err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "Submit Bill";
  }
}

function feedback(el, msg, type) {
  el.textContent = msg;
  el.className = "bill-feedback " + type;
  setTimeout(() => el.classList.add("hidden"), 4500);
}

function resetBillingForm() {
  ["bill-account", "bill-new-name", "bill-description"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("customer-display").innerHTML =
    '<span class="cust-placeholder">Enter an account number</span>';
  document.getElementById("new-customer-row").classList.add("hidden");
  currentOrder = [];
  orderOpen = false;
  document.getElementById("order-panel").classList.add("collapsed");
  syncOrderUI();
  refreshActiveDrinks();
}

// ─── TABLE SCREEN ─────────────────────────────────────────
async function initTable() {
  if (tableReady) return;
  tableReady = true;
  await loadMonths();
  if (currentMonth) await loadTable(currentMonth);
  document.getElementById("month-selector").addEventListener("change", e =>
    loadTable(e.target.value)
  );
  document.getElementById("export-csv").addEventListener("click", exportCSV);
}

async function loadMonths() {
  const sel = document.getElementById("month-selector");
  sel.innerHTML = "";
  try {
    const { months } = await api({ action: "getMonths" });
    if (!months.length) {
      sel.innerHTML = '<option value="">No data yet</option>';
      return;
    }
    months.forEach(m => {
      const o = document.createElement("option");
      o.value = m; o.textContent = fmtMonth(m);
      sel.appendChild(o);
    });
    currentMonth = months[0];
    document.getElementById("open-sheet").href =
      `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit`;
  } catch {
    sel.innerHTML = '<option value="">Error loading months</option>';
  }
}

function fmtMonth(key) {
  const [y, m] = key.split("_");
  return new Date(+y, +m - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

async function loadTable(month) {
  currentMonth = month;
  const box = document.getElementById("bills-table-container");
  box.innerHTML = '<p class="tbl-msg">Loading…</p>';
  try {
    const { bills } = await api({ action: "getBills", month });
    currentBills = bills;
    renderTable(bills);
  } catch (err) {
    box.innerHTML = `<p class="tbl-msg" style="color:var(--red)">Failed: ${err.message}</p>`;
  }
}

function renderTable(bills) {
  const box = document.getElementById("bills-table-container");
  if (!bills.length) {
    box.innerHTML = '<p class="tbl-msg">No bills this month.</p>';
    return;
  }

  const groups = {};
  bills.forEach(b => {
    if (!groups[b.account]) groups[b.account] = { name: b.name, bills: [], total: 0 };
    groups[b.account].bills.push(b);
    groups[b.account].total += parseFloat(b.amount) || 0;
  });

  const tbl  = document.createElement("table");
  tbl.className = "bills-tbl";
  tbl.innerHTML = `<thead><tr>
    <th>Acct</th><th>Customer</th><th>Total</th><th>#</th><th></th>
  </tr></thead>`;
  const tbody = document.createElement("tbody");

  Object.entries(groups)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .forEach(([acct, g]) => {
      const gid = `g${acct}`;
      const hr = document.createElement("tr");
      hr.className = "grp-row";
      hr.innerHTML = `
        <td><span class="acct-num">${acct}</span></td>
        <td>${g.name}</td>
        <td class="acct-total">₪${g.total.toFixed(2)}</td>
        <td>${g.bills.length}</td>
        <td><span class="expand-ico">▶</span></td>
      `;
      hr.addEventListener("click", () => {
        hr.classList.toggle("open");
        tbody.querySelectorAll(`[data-gid="${gid}"]`).forEach(r =>
          r.classList.toggle("visible")
        );
      });
      tbody.appendChild(hr);

      g.bills.forEach(b => {
        const dr = document.createElement("tr");
        dr.className = "det-row";
        dr.dataset.gid = gid;
        const dt = b.datetime ? new Date(b.datetime).toLocaleString() : "";
        dr.innerHTML = `
          <td></td>
          <td>₪${parseFloat(b.amount || 0).toFixed(2)}</td>
          <td colspan="2" style="color:var(--text)">${b.description || ""}</td>
          <td style="color:var(--text3);font-size:0.72rem;white-space:nowrap">${dt}</td>
        `;
        tbody.appendChild(dr);
      });
    });

  tbl.appendChild(tbody);
  box.innerHTML = "";
  box.appendChild(tbl);
}

function exportCSV() {
  if (!currentBills.length) return;
  const rows = [
    ["AccountNumber", "CustomerName", "Amount", "Description", "DateTime"],
    ...currentBills.map(b => [
      b.account, b.name, b.amount,
      (b.description || "").replace(/,/g, ";"),
      b.datetime,
    ]),
  ];
  const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
  Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `bills_${currentMonth}.csv`,
  }).click();
}

// ─── BOOT ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // screen-login already has .active in HTML; this ensures correct state
  showScreen("screen-login");

  document.getElementById("login-btn").addEventListener("click", login);
  document.getElementById("login-password").addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });

  initNav();

  // Skip login if already authenticated in this session
  if (sessionStorage.getItem("password")) {
    showScreen("screen-billing");
    initBilling();
  }
});
