// ============================================================
// CONFIGURATION
// ============================================================
const PASSWORD = "1948";
const SHEET_ID = "1sxsuNSTTMBNdubWfsVWRgEFqZ624rOUTosX7TTh4Nhw";

// ============================================================
// ROUTER
// ============================================================
function doGet(e)     { return handle(e); }
function doPost(e)    { return handle(e); }
function doOptions(e) { return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT); }

function handle(e) {
  try {
    const p = e.parameter || {};
    if (p.password !== PASSWORD) return json({ error: "Unauthorized" });
    switch (p.action) {
      case "lookup":      return json(lookupCustomer(p.account));
      case "bill":        return json(submitBill(p.account, p.name, p.amount, p.desc));
      case "addAndBill":  return json(addAndBill(p.account, p.name, p.amount, p.desc));
      case "getBills":    return json(getBills(p.month));
      case "getMonths":   return json(getMonths());
      case "addCredits":  return json(addCredits(p.account, p.name, p.tickets, p.shekelAmount));
      case "getCredits":  return json(getCredits(p.month));
      case "voidBill":    return json(voidBill(p.account, p.name, p.tickets, p.desc));
      default:            return json({ error: "Unknown action" });
    }
  } catch (err) {
    return json({ error: err.message });
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// CUSTOMER LOOKUP — also returns current balance
// ============================================================
function lookupCustomer(account) {
  const sheet = getOrCreateSheet("Customers");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(account)) {
      const name = data[i][1];
      const balance = computeBalance(account);
      return { found: true, name, balance };
    }
  }
  return { found: false };
}

function computeBalance(account) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let credits = 0, spent = 0;
  ss.getSheets().forEach(s => {
    const n = s.getName();
    const d = s.getDataRange().getValues();
    if (n.startsWith("Credits_")) {
      d.slice(1).forEach(row => { if (String(row[0]) === String(account)) credits += parseInt(row[2]) || 0; });
    } else if (n.startsWith("Bills_")) {
      d.slice(1).forEach(row => { if (String(row[0]) === String(account)) spent += parseInt(row[2]) || 0; });
    }
  });
  return credits - spent;
}

// ============================================================
// SUBMIT BILL (amount = ticket cost)
// ============================================================
function submitBill(account, name, amount, desc) {
  const sheet = getOrCreateMonthSheet(getCurrentMonthTabName());
  const resolvedName = name || lookupCustomer(account).name || "";
  sheet.appendRow([String(account), resolvedName, parseInt(amount) || 0, desc || "", new Date().toISOString()]);
  return { success: true };
}

function addAndBill(account, name, amount, desc) {
  addCustomer(account, name);
  return submitBill(account, name, amount, desc);
}

function addCustomer(account, name) {
  getOrCreateSheet("Customers").appendRow([String(account), name]);
}

// ============================================================
// CREDITS
// ============================================================
function addCredits(account, name, tickets, shekelAmount) {
  const sheet = getOrCreateCreditsSheet(getCurrentMonthTabName());
  const resolvedName = name || lookupCustomer(account).name || "";
  sheet.appendRow([String(account), resolvedName, parseInt(tickets) || 0, parseFloat(shekelAmount) || 0, new Date().toISOString()]);
  return { success: true };
}

function getCredits(month) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Credits_" + month);
  if (!sheet) return { credits: [] };
  const data = sheet.getDataRange().getValues();
  return { credits: data.slice(1).map(row => ({ account: row[0], name: row[1], tickets: row[2], amount: row[3], datetime: row[4] })) };
}

// ============================================================
// VOID A BILL
// ============================================================
function voidBill(account, name, tickets, desc) {
  const sheet = getOrCreateMonthSheet(getCurrentMonthTabName());
  sheet.appendRow([String(account), name || "", -(parseInt(tickets) || 0), "VOID: " + (desc || ""), new Date().toISOString()]);
  return { success: true };
}

// ============================================================
// GET BILLS FOR A MONTH
// ============================================================
function getBills(month) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Bills_" + month);
  if (!sheet) return { bills: [] };
  const data = sheet.getDataRange().getValues();
  return { bills: data.slice(1).map(row => ({ account: row[0], name: row[1], amount: row[2], description: row[3], datetime: row[4] })) };
}

// ============================================================
// LIST AVAILABLE MONTHS
// ============================================================
function getMonths() {
  const months = SpreadsheetApp.openById(SHEET_ID)
    .getSheets().map(s => s.getName())
    .filter(n => n.startsWith("Bills_"))
    .map(n => n.replace("Bills_", ""))
    .sort().reverse();
  return { months };
}

// ============================================================
// HELPERS
// ============================================================
function getCurrentMonthTabName() {
  const now = new Date();
  return now.getFullYear() + "_" + String(now.getMonth() + 1).padStart(2, "0");
}

function getOrCreateMonthSheet(monthKey) {
  const tabName = "Bills_" + monthKey;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(["AccountNumber", "CustomerName", "Tickets", "Description", "DateTime"]);
  }
  return sheet;
}

function getOrCreateCreditsSheet(monthKey) {
  const tabName = "Credits_" + monthKey;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(["AccountNumber", "CustomerName", "Tickets", "AmountPaid", "DateTime"]);
  }
  return sheet;
}

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === "Customers") sheet.appendRow(["AccountNumber", "Name"]);
  }
  return sheet;
}

// ============================================================
// SEED REAL CUSTOMERS — run once from the Apps Script editor
// Clears existing customer data and loads the real community list
// ============================================================
function seedCustomers() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName("Customers");
  if (!sheet) { sheet = ss.insertSheet("Customers"); }
  else { sheet.clearContents(); }
  sheet.appendRow(["AccountNumber", "Name"]);

  const allData = [
    ["0126","אביעד ברק ושיר"],["0145","אביעד נטע"],["0114","אביעד עמיחי ורבקה"],
    ["0125","אדלר בלימה"],["0110","אדלר מרדכי"],["0123","אונגר משה"],
    ["0107","אורן יהודה והניה"],["2121","אלבז שריה ומוריה"],["0105","אלדד אברהם"],
    ["0147","אלדד חן"],["0121","אלדד מוטי"],["0146","אלדד נעם ושי"],
    ["0115","אלדד נפתלי ומאשי"],["0102","אלדד רוניאל"],["0108","אלדד שי"],
    ["0134","אלדד שלומי ונעה"],["0143","אלירז ליאורה"],["0112","אלירז שמואל ועפרה"],
    ["0151","אמיר יצחק"],["0149","אמיר מורן"],["0111","אמיר מיכה ותמר"],
    ["0109","אמיתי אליעזר ופרדי"],["0118","אריאל אסף ואלישבע"],["0106","אריאל חנן וענת"],
    ["0130","אריאל יאיר ואילת"],["0130","אריאל יאיר ואילת"],
    ["0142","אריאל יונתן"],["0120","אריאל נעמה"],
    ["0144","אריה צוריאל ואורלי"],["0144","אריה צוריאל ואורלי"],["0144","אריה צוריאל ואורלי"],
    ["2125","בוהרון אלירם והדס"],["0256","בירנבאום זמיר"],["0212","בירנבאום צביקה ואורה"],
    ["0252","בן אהרון ערן ודפנה"],["0214","בן חמו סרג` ורחל"],["0218","בן טל רפי ושושנה"],
    ["0206","בן יעקב שאולה"],["0250","בן עמי ירדן ודנה"],["0220","בן עמי צבי והדסה"],
    ["0222","בר יתיר"],["0226","בר מאור ושלי"],["0216","בר פלד יואב וחנה"],
    ["0237","ברבן אבי ותמי"],["0258","ברבן גיא"],["0224","ברבן יונתן"],
    ["0223","ברבן נועם"],["0255","ברבן עידו"],["0217","ברודי אלחנן ורחל"],
    ["0202","ברודי אמנון אתי"],["0228","ברודי גיא"],["0239","ברודי ניתאי"],
    ["0211","ברודי נעם וקרן"],["0227","ברודי עודד ואביבית"],["0219","בשן בנימין ורחל"],
    ["0315","גביר אביה"],["0311","גביר אוריה"],["0310","גביר אלון ואור"],
    ["0308","גביר ארז ונטע"],["0313","גביר אשרת"],["0304","גביר שמואל ואילה"],
    ["0813","גדסי מיכאל ותמר"],["1714","גוב ארי מוטי ואורטל"],["0306","גוזלנד שמעון ומוריה"],
    ["0301","גוטליב דב ונעמי"],["0318","גוטליב טנא"],["0307","גוטליב ידידיה ואהבה"],
    ["0314","גוטליב נעם"],["6132","גופר משיי ואפרת"],["0317","גורי יעקב ונעמי"],
    ["0302","גלבוע חנה"],["0320","גלבוע נעה"],["0309","גלבוע נעם"],
    ["1607","גרוס אלעד ואביב"],["0305","גרייסמן אורי וחנה"],["0303","גרינבלט משה ורותי"],
    ["0411","דבורקין דגן ואופיר"],["0407","דבורקין שמעון ורחל"],["0413","דורון אסף"],
    ["0403","דורון גבי וברנדה"],["0406","דורון יצחק ואילנה"],["0404","דורון מור"],
    ["0408","דורון מירב"],["2118","דורון רותם"],["2101","דימנט דביר ורננה"],
    ["0523","הבר נעם ושירה"],
    ["6134","הדר שי ורחל"],["6134","הדר שי ורחל"],
    ["0516","הולצר דור"],["0510","הולצר מוטי ולאה"],["0507","הופמן אבי ושולי"],
    ["0514","הופמן אוריה וגל"],["0511","הופמן אלעד ואלדר"],["1213","הורן יהודה ויעל"],
    ["0522","המר אלמוג"],["0504","המר בועז ודליה"],["0520","המר גל"],
    ["0519","המר נופר"],["0505","המר נילי"],["0509","המר שחף"],
    ["6122","הרב נהוראי"],["0506","הרטוב חגי וניצה"],["0521","הרטוב כרמל"],
    ["0502","הרטוב שרה"],["0603","וולברג מרים"],["2041","וולווביק עידו ומטר"],
    ["0609","וייס גיל"],["0609","וייס גיל"],["0609","וייס גיל"],
    ["0604","וייס יזהר"],["0604","וייס יזהר"],["0604","וייס יזהר"],
    ["0620","וייס מתן"],["0606","וייס שלמה ותמי"],["0605","וילדשטיין דוד ורותי"],
    ["0617","וילדשטיין ורדית"],["0614","וילק נדב ואורטל"],["0608","וילק שרגא ואילנה"],
    ["0613","ויסטוך משה ונעה"],["0705","זיו עמית ואסתי"],["0702","זיסק דביר"],
    ["0701","זיסק ישראל וגלית"],["0706","זיסק שלומציון"],["0708","זיסק תפארת"],
    ["0803","חורש אבנר וחני"],["0809","חורש אחינועם"],["0804","חורש גדי ושרי"],
    ["0806","חורש יהונתן"],["0805","חורש עופר ולידור"],["0815","חסון טל וחגית"],
    ["0816","חסין משה ושלומית"],["1014","יוגב אור"],["1011","יוגב מינו"],
    ["1007","יוגב מעין"],
    ["1004","יוגב ענת"],["1004","יוגב ענת"],
    ["1013","יוגב רועי"],["1008","יורקביץ בר יוחאי"],["1002","יקיר גדעון ומרים"],
    ["1005","יקיר הראל ואורית"],["1012","יקיר נועם"],["1006","יקיר עילי"],
    ["1001","יקיר שחר"],["1003","ישורון שמשון ורותי"],["1109","כהן אלדד והודיה"],
    ["1112","כהן בועז ותמר"],["1104","כהן דוד ונחמי"],["1113","כהן הראל עוזיה"],
    ["1116","כהן חושן"],["1107","כהן יוני וטלי"],["1110","כהן יזרעאל"],
    ["1120","כהן נהוראי"],["1119","כהן שרון ושמחה"],["1103","כלפה רותי"],
    ["1102","כפיר קלי ויהודית"],["0312","כרמל איתמר ולימור"],["1215","לאונגר משה ודבורה"],
    ["1224","לאופר יובל ואורנית"],["1224","לאופר יובל ואורנית"],["1224","לאופר יובל ואורנית"],
    ["1235","לאופר שחר ועדי"],["1208","לאופר שמעון ותמר"],["1205","לבבי אליהו ונעמי"],
    ["1228","לבבי אלישב"],["1204","לבבי הלל"],["1239","לבבי יוסף וליאור"],
    ["1225","לבבי מלאכי"],["1212","לבבי מתנאל"],["1223","לבבי נחום ושלומית"],
    ["1219","לבבי נחומי ושני"],["1202","לבבי נטע"],["1207","לבבי צבי וחנה"],
    ["1229","לבבי רותם"],["1203","לבנה מרים"],
    ["1261","לבקוביץ ירון ועטרה"],["1261","לבקוביץ ירון ועטרה"],["1261","לבקוביץ ירון ועטרה"],["1261","לבקוביץ ירון ועטרה"],
    ["1262","לבקוביץ` רואי"],["2031","לוי נדב ואביב (רגב)"],["1222","לזר איתמר וליאורה"],
    ["1218","לזר מיקי וריקי"],["1211","לזר מרים"],["1232","לזר עידן"],
    ["1209","ליבוביץ משה ושורי"],["1230","לייקוב בתיה"],["1210","לייקוב חיים ולאה"],
    ["1214","ליפטשר אבינועם ועופרה"],["1216","ליפטשר דוד ואלישבע"],["1304","מור יוסף אליה ושילת"],
    ["1301","מידב כפיר ורחל"],["1305","מידב לביא"],["1303","מידב לשם"],
    ["1306","מנשאוף שלומית ויאיר"],["1401","נדיבי רבקה"],["6137","סאלאמא יהודה ושרון"],
    ["1503","סהר אבשלום ונעמה"],["1512","סהר דולב"],["1510","סהר תהל"],
    ["1502","סולומון אייזיק וקלר"],["1513","סולומון אנאבל"],["1511","סולומון נתנאל"],
    ["1501","סוקל רחל"],["2033","סיידנר יהודה ועומר (רגב)"],["1931","ספיר תומר ונעמה"],
    ["1602","עובדיה ישראל ווונדי"],["0249","עובדיה לוטם"],["2042","עמיאל בראל ורון"],
    ["1703","פורת אסתר"],["1724","פז יצחק"],["1726","פז רננה"],
    ["1701","פז שירה"],["1708","פז תמי"],["1706","פטרסון אליהו וג`נט"],
    ["1115","פלג יואב ורוני (כהן)"],["1707","פליישמן ברוך ואסי"],["1712","פליישמן דורי ודינה"],
    ["1725","פרג`ון אפרת"],["1710","פרג`ון מוטי ואורית"],["1722","פרג`ון נוה ושקד"],
    ["0601","פרץ עומר וצופיה"],["1506","קדוש נסאל ואליענה"],["0129","קדמון נועם וצליל"],
    ["1906","קלוש אריה ושלומית"],["1923","קליין דן וחדוה"],["1935","קליין יוחאי ושלומית"],
    ["1907","קליין משה ונאוה"],
    ["0199","קפלן שמואל וחני (אלדד)"],["0119","קפלן שמואל וחני (אלדד)"],
    ["1908","קראוס נחמיה ושלומית"],
    ["1911","קרליבך דוד ומיכל"],["1911","קרליבך דוד ומיכל"],["1911","קרליבך דוד ומיכל"],
    ["1924","קרליבך הילה"],["1932","קרליבך ידידיה"],["1904","קרליבך יובל"],
    ["1914","קרליבך יצחק וורד"],["1922","קרליבך ישי ונועה"],["1933","קרליבך נעמה"],
    ["1915","קרליבך עדי"],["1910","קרליבך רועי ועינב"],["1905","קרן אסתר"],
    ["1913","קרן בני ורחלי"],["1926","קרן הדר"],["1912","קרן טליה"],
    ["1901","קרן יהונתן"],["1918","קרן מוריה"],["1917","קרן נויה"],
    ["2030","ראבינסאן דגן ומירית"],["2036","רביב אוהד"],["2049","רביב אורי"],
    ["2044","רביב גילי"],["2005","רביב דבורה"],["2032","רביב טליה"],
    ["2016","רביב יגאל ומירב"],["2034","רביב יובל"],["2011","רביב יצחק ויעל"],
    ["2028","רביב כתי ולאה"],["2023","רביב רותם"],["2039","רביב שי"],
    ["2027","רגב רביד"],["2012","רגב שמוליק ודפי"],["2006","רוזנברג יעקב ועפרה"],
    ["2043","רוט אפרת"],["2017","רוט צבי ונורית"],["2004","רוט קרן"],
    ["2037","רוט רועי"],["2001","רוט שירה"],["2003","רון אירית"],
    ["2009","רון יואב ומרים"],["2047","רחמים הודיה"],["2014","רחמים יהושוע ושרה (איצק`)"],
    ["2040","רחמים שירה"],["2045","רחמים תהילה"],["2007","רייך גלעד ויפעת"],
    ["2010","רייך מיכאל ובלה"],["2022","רייך ענת"],["2046","רייך שגיא"],
    ["2038","רייך שיאל"],["2035","רייך שני"],
    ["0405","ריינר הראל ומעין"],["0405","ריינר הראל ומעין"],
    ["2050","ריינר שירה ואריאל"],["2024","רימון אופיר"],["2020","רימון ארנון וסימי"],
    ["2048","רימון דור"],["2008","רימון שלמה וסלבי"],["2113","שאול איתי ויעל"],
    ["2110","שאול אריה ואמירה"],["2112","שוורץ כרמל"],["2115","שוורץ רוני ושיראל"],
    ["0148","שושן-המר אדווה"],["6138","שטרמר אפק ומיכל"],["2111","שי ישראל ורחל"],
    ["2117","שי רועי"],["2126","שיין המיה"],["2109","שיין ורדה"],
    ["2102","שיין טליה"],["2119","שיין נפתלי וגילה"],["2120","שילה נתנאל וסיון"],
    ["2123","שלום ששון ותמר"],["0136","שפר אלדד מעיין"],["2122","שרעבי אביאל ואסנת"],
    ["2203","תורג`מן דורון וכרמל"],["2201","תורג`מן מיכאל ומוניק"],
    ["2209","תורג`מן עמיאור"],["2202","תורג`מן תהל"]
  ];

  const seen = new Set();
  allData.forEach(([code, name]) => {
    if (!seen.has(code)) {
      seen.add(code);
      sheet.appendRow([code, name]);
    }
  });
}
