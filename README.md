# Bar Tab Manager

A billing dashboard for bar bartenders, hosted on GitHub Pages with Google Sheets as the database.

## Setup (one time, ~15 minutes)

### 1. Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it **Bar Tab Manager**
3. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**YOUR_SHEET_ID**/edit`

### 2. Deploy the Apps Script

1. In the Sheet, go to **Extensions → Apps Script**
2. Delete any existing code and paste the full contents of `Code.gs` from this repo
3. Change `const PASSWORD = "bar2024"` to your desired password
4. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Access: **Anyone**
5. Click **Deploy**, authorize when prompted, then **copy the Web App URL**

### 3. Configure the app

Edit `config.js` and fill in both values:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/YOUR_ID/exec",
  SHEET_ID: "YOUR_SHEET_ID",
};
```

### 4. Seed customer data

In the Apps Script editor, run the `seedCustomers()` function once (select it from the function dropdown and click ▶ Run). This adds 20 sample customers so the app works immediately. Replace them later by editing the **Customers** tab in the Sheet directly.

### 5. Push to GitHub and enable Pages

1. Create a new GitHub repository (e.g. `bar-tab-manager`)
2. Push this folder to the `main` branch
3. Go to repo **Settings → Pages → Source: GitHub Actions**
4. The workflow deploys automatically — your app URL appears in the Pages settings

## Usage

- Open the GitHub Pages URL → enter your password
- **Submit Bill tab:**
  - Type an account number → customer name auto-appears
  - If unknown: a name field appears — fill it in to add the customer and bill at once
  - Enter amount + description → **Submit Bill**
- **View Table tab:**
  - See all bills for the current month, grouped by account number
  - Click any account row to expand its full billing history
  - Use the month dropdown to view previous months
  - **Export CSV** downloads the current view as a spreadsheet file
  - **Open in Sheets ↗** opens the raw Google Sheet

## Switching to real customer data

Replace the sample data by editing the **Customers** tab in your Google Sheet directly. Columns: `AccountNumber` | `Name`. No spaces in account numbers recommended.
