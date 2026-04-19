// ============================================================
// STATE
// ============================================================
let currentBills = [];
let currentMonth = "";
let tableInitialized = false;

// ============================================================
// SCREEN NAVIGATION
// ============================================================
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.remove("active");
    s.classList.add("hidden");
  });
  const target = document.getElementById(id);
  target.classList.remove("hidden");
  target.classList.add("active");
}

// ============================================================
// API HELPERS
// ============================================================
async function api(params) {
  const password = sessionStorage.getItem("password") || "";
  return apiWithPassword(params, password);
}

async function apiWithPassword(params, pw) {
  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  Object.entries({ ...params, password: pw }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Network error");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ============================================================
// LOGIN
// ============================================================
async function login() {
  const pw = document.getElementById("login-password").value.trim();
  if (!pw) return;
  const errorEl = document.getElementById("login-error");
  errorEl.classList.add("hidden");
  try {
    await apiWithPassword({ action: "getMonths" }, pw);
    sessionStorage.setItem("password", pw);
    showScreen("screen-billing");
    initBillingScreen();
  } catch {
    errorEl.classList.remove("hidden");
  }
}

// ============================================================
// TAB NAVIGATION
// ============================================================
function initTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      showScreen(target);
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(`.tab[data-target="${target}"]`).forEach(t => t.classList.add("active"));
      if (target === "screen-table") initTableScreen();
    });
  });
}

// ============================================================
// BILLING SCREEN — account lookup
// ============================================================
let lookupDebounce = null;
let billingInitialized = false;

function initBillingScreen() {
  if (billingInitialized) return;
  billingInitialized = true;

  const accountInput = document.getElementById("bill-account");
  accountInput.addEventListener("input", () => {
    clearTimeout(lookupDebounce);
    lookupDebounce = setTimeout(() => doLookup(accountInput.value.trim()), 400);
  });
  document.getElementById("bill-submit").addEventListener("click", doSubmitBill);
}

async function doLookup(account) {
  const label = document.getElementById("bill-customer-name");
  const newRow = document.getElementById("new-customer-row");
  const submitBtn = document.getElementById("bill-submit");

  if (!account) {
    label.textContent = "";
    label.className = "customer-label";
    newRow.classList.add("hidden");
    submitBtn.textContent = "Submit Bill";
    return;
  }

  try {
    const result = await api({ action: "lookup", account });
    if (result.found) {
      label.textContent = result.name;
      label.className = "customer-label found";
      newRow.classList.add("hidden");
      submitBtn.textContent = "Submit Bill";
    } else {
      label.textContent = "Not found";
      label.className = "customer-label not-found";
      newRow.classList.remove("hidden");
      submitBtn.textContent = "Add Customer & Submit Bill";
    }
  } catch {
    label.textContent = "Lookup failed";
    label.className = "customer-label not-found";
  }
}

// ============================================================
// SUBMIT BILL
// ============================================================
async function doSubmitBill() {
  const account = document.getElementById("bill-account").value.trim();
  const amount = document.getElementById("bill-amount").value.trim();
  const desc = document.getElementById("bill-description").value.trim();
  const newName = document.getElementById("bill-new-name").value.trim();
  const feedback = document.getElementById("bill-feedback");
  const isNew = !document.getElementById("new-customer-row").classList.contains("hidden");

  if (!account || !amount) {
    showFeedback(feedback, "Account number and amount are required.", "error");
    return;
  }
  if (isNew && !newName) {
    showFeedback(feedback, "Please enter the customer name.", "error");
    return;
  }

  const btn = document.getElementById("bill-submit");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  try {
    const action = isNew ? "addAndBill" : "bill";
    await api({ action, account, amount, desc, name: newName });
    showFeedback(feedback, "Bill submitted successfully!", "success");
    clearBillingForm();
    tableInitialized = false; // force table reload next time
  } catch (err) {
    showFeedback(feedback, "Error: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = isNew ? "Add Customer & Submit Bill" : "Submit Bill";
  }
}

function showFeedback(el, msg, type) {
  el.textContent = msg;
  el.className = "feedback " + type;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

function clearBillingForm() {
  ["bill-account", "bill-amount", "bill-description", "bill-new-name"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("bill-customer-name").textContent = "";
  document.getElementById("bill-customer-name").className = "customer-label";
  document.getElementById("new-customer-row").classList.add("hidden");
}

// ============================================================
// TABLE SCREEN
// ============================================================
async function initTableScreen() {
  if (tableInitialized) return;
  tableInitialized = true;

  await populateMonthSelector();
  if (currentMonth) await loadTable(currentMonth);

  document.getElementById("month-selector").addEventListener("change", e => {
    loadTable(e.target.value);
  });
  document.getElementById("export-csv").addEventListener("click", exportCSV);
}

async function populateMonthSelector() {
  const select = document.getElementById("month-selector");
  select.innerHTML = "";
  try {
    const { months } = await api({ action: "getMonths" });
    if (!months.length) {
      select.innerHTML = '<option value="">No data yet</option>';
      return;
    }
    months.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = formatMonth(m);
      select.appendChild(opt);
    });
    currentMonth = months[0];
    select.value = currentMonth;
    document.getElementById("open-sheet").href =
      "https://docs.google.com/spreadsheets/d/" + CONFIG.SHEET_ID + "/edit";
  } catch {
    select.innerHTML = '<option value="">Error loading months</option>';
  }
}

function formatMonth(key) {
  const [y, m] = key.split("_");
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

async function loadTable(month) {
  currentMonth = month;
  const container = document.getElementById("bills-table-container");
  container.innerHTML = '<p class="loading">Loading...</p>';
  try {
    const { bills } = await api({ action: "getBills", month });
    currentBills = bills;
    renderTable(bills);
  } catch (err) {
    container.innerHTML = '<p class="error">Failed to load: ' + err.message + "</p>";
  }
}

function renderTable(bills) {
  const container = document.getElementById("bills-table-container");
  if (!bills.length) {
    container.innerHTML = '<p class="loading">No bills for this month.</p>';
    return;
  }

  // Group by account number
  const groups = {};
  bills.forEach(b => {
    if (!groups[b.account]) groups[b.account] = { name: b.name, bills: [] };
    groups[b.account].bills.push(b);
  });

  const table = document.createElement("table");
  table.innerHTML = `<thead><tr>
    <th>Account</th><th>Customer</th><th>Amount</th><th>Description</th><th>Date/Time</th>
  </tr></thead>`;
  const tbody = document.createElement("tbody");

  Object.entries(groups)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .forEach(([account, group]) => {
      const total = group.bills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);

      const header = document.createElement("tr");
      header.className = "account-group-header";
      header.innerHTML = `
        <td>${account}</td>
        <td>${group.name}</td>
        <td><strong>₪${total.toFixed(2)}</strong></td>
        <td colspan="2">${group.bills.length} bill(s) — click to expand</td>
      `;
      header.addEventListener("click", () => toggleGroup(account, header));
      tbody.appendChild(header);

      group.bills.forEach(b => {
        const row = document.createElement("tr");
        row.className = "account-detail-row";
        row.dataset.account = account;
        const dt = b.datetime ? new Date(b.datetime).toLocaleString() : "";
        row.innerHTML = `
          <td></td>
          <td>${b.name}</td>
          <td>₪${parseFloat(b.amount || 0).toFixed(2)}</td>
          <td>${b.description || ""}</td>
          <td>${dt}</td>
        `;
        tbody.appendChild(row);
      });
    });

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

function toggleGroup(account, headerRow) {
  headerRow.classList.toggle("open");
  document.querySelectorAll(`.account-detail-row[data-account="${account}"]`).forEach(row => {
    row.classList.toggle("visible");
  });
}

// ============================================================
// CSV EXPORT
// ============================================================
function exportCSV() {
  if (!currentBills.length) return;
  const headers = ["AccountNumber", "CustomerName", "Amount", "Description", "DateTime"];
  const rows = currentBills.map(b => [
    b.account,
    b.name,
    b.amount,
    (b.description || "").replace(/,/g, ";"),
    b.datetime
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bills_" + currentMonth + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// BOOT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("login-btn").addEventListener("click", login);
  document.getElementById("login-password").addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });
  initTabs();

  if (sessionStorage.getItem("password")) {
    showScreen("screen-billing");
    initBillingScreen();
  }
});
