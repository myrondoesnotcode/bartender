// ============================================================
// CONFIGURATION — change PASSWORD to your actual password
// ============================================================
const PASSWORD = "1948";
const SHEET_ID = "1sxsuNSTTMBNdubWfsVWRgEFqZ624rOUTosX7TTh4Nhw";

// ============================================================
// ROUTER
// ============================================================
function doGet(e) {
  return handle(e);
}

function doPost(e) {
  return handle(e);
}

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

function handle(e) {
  try {
    const p = e.parameter || {};
    if (p.password !== PASSWORD) {
      return json({ error: "Unauthorized" });
    }
    switch (p.action) {
      case "lookup":     return json(lookupCustomer(p.account));
      case "bill":       return json(submitBill(p.account, p.name, p.amount, p.desc));
      case "addAndBill": return json(addAndBill(p.account, p.name, p.amount, p.desc));
      case "getBills":   return json(getBills(p.month));
      case "getMonths":  return json(getMonths());
      default:           return json({ error: "Unknown action" });
    }
  } catch (err) {
    return json({ error: err.message });
  }
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// CUSTOMER LOOKUP
// ============================================================
function lookupCustomer(account) {
  const sheet = getOrCreateSheet("Customers");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(account)) {
      return { found: true, name: data[i][1] };
    }
  }
  return { found: false };
}

// ============================================================
// SUBMIT BILL
// ============================================================
function submitBill(account, name, amount, desc) {
  const monthKey = getCurrentMonthTabName();
  const sheet = getOrCreateMonthSheet(monthKey);
  const resolvedName = name || lookupCustomer(account).name || "";
  sheet.appendRow([
    String(account),
    resolvedName,
    parseFloat(amount) || 0,
    desc || "",
    new Date().toISOString()
  ]);
  return { success: true };
}

// ============================================================
// ADD CUSTOMER AND BILL IN ONE STEP
// ============================================================
function addAndBill(account, name, amount, desc) {
  addCustomer(account, name);
  return submitBill(account, name, amount, desc);
}

function addCustomer(account, name) {
  const sheet = getOrCreateSheet("Customers");
  sheet.appendRow([String(account), name]);
}

// ============================================================
// GET BILLS FOR A MONTH
// ============================================================
function getBills(month) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Bills_" + month);
  if (!sheet) return { bills: [] };
  const data = sheet.getDataRange().getValues();
  const bills = data.slice(1).map(row => ({
    account: row[0],
    name: row[1],
    amount: row[2],
    description: row[3],
    datetime: row[4]
  }));
  return { bills };
}

// ============================================================
// LIST AVAILABLE MONTHS
// ============================================================
function getMonths() {
  const months = SpreadsheetApp.openById(SHEET_ID)
    .getSheets()
    .map(s => s.getName())
    .filter(n => n.startsWith("Bills_"))
    .map(n => n.replace("Bills_", ""))
    .sort()
    .reverse();
  return { months };
}

// ============================================================
// HELPERS
// ============================================================
function getCurrentMonthTabName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return y + "_" + m;
}

function getOrCreateMonthSheet(monthKey) {
  const tabName = "Bills_" + monthKey;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(["AccountNumber", "CustomerName", "Amount", "Description", "DateTime"]);
  }
  return sheet;
}

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === "Customers") {
      sheet.appendRow(["AccountNumber", "Name"]);
    }
  }
  return sheet;
}

// ============================================================
// ONE-TIME SEED — run once from the Apps Script editor
// ============================================================
function seedCustomers() {
  const sheet = getOrCreateSheet("Customers");
  const fakeData = [
    ["101", "Alice Cohen"], ["102", "Ben Levi"], ["103", "Dana Mizrahi"],
    ["104", "Eli Shapiro"], ["105", "Fiona Bar-On"], ["106", "Gal Stern"],
    ["107", "Hila Katz"], ["108", "Idan Rosen"], ["109", "Julia Peretz"],
    ["110", "Kobi Dayan"], ["111", "Lior Friedman"], ["112", "Maya Goldberg"],
    ["113", "Nir Tal"], ["114", "Orna Schwartz"], ["115", "Paz Avraham"],
    ["116", "Rina Brener"], ["117", "Shai Cohen"], ["118", "Tali Levy"],
    ["119", "Uri Ben-David"], ["120", "Vered Alon"]
  ];
  fakeData.forEach(row => sheet.appendRow(row));
}
