# Facebook Ads Dashboard - Simple PRD

## What is this app?

A dashboard to track Facebook Ads performance for Pabbly products. It shows how much you spend, how much you earn, and helps you find problems with your ads.

---

## Who uses it?

- **Admin**: Can do everything
- **Editor**: Can view and edit data
- **Viewer**: Can only view data

**Default Login**: admin@pabbly.com / Admin@123

---

## Which Ad Accounts?

| Account Name | Facebook ID |
|--------------|-------------|
| Pabbly Connect One Time | act_883912415611751 |
| Pabbly Chatflow | act_1304022760826324 |
| Pabbly Billing One Time | act_505099201137104 |

---

## Main Sections

### 1. Dashboard - Overview

Shows 5 main numbers:
- **Total Spend** - Money spent on ads (from Facebook)
- **Total Revenue** - Money earned (from local database)
- **ROAS** - Return on ad spend (Revenue / Spend)
- **Total Leads** - Number of leads (from local database)
- **Pixel Status** - Is Facebook Pixel working?

Also shows Quick Snapshot:
- Today's numbers
- This Week's numbers
- This Month's numbers

---

### 2. Dashboard - Campaigns

Table showing all campaigns with:
- Status (Active/Paused)
- Campaign Name
- Budget
- Spend
- Sales
- Revenue
- ROAS (color-coded: Green = good, Orange = okay, Red = bad)
- Frequency
- Clicks
- Reach
- Impressions

**Filters**: Active only, Paused only, or All

---

### 3. Dashboard - Ad Sets

Same as campaigns, but for ad sets.
**Extra Filter**: Filter by Campaign

---

### 4. Dashboard - Ads

Same as campaigns, but for individual ads.
**Extra Filters**: Filter by Campaign, Filter by Ad Set

---

### 5. Dashboard - Country Performance

Shows performance by country:
- Country name with flag
- Ad Spend
- Sales
- Revenue
- ROAS

---

### 6. Dashboard - Sales by Ad Creative

Shows recent sales with:
- Ad Name
- Campaign
- Ad Set
- Country
- Amount
- Date & Time

---

### 7. Alerts

Two tabs:
- **Needs Action**: Problems to fix (low ROAS, no sales, etc.)
- **Opportunities**: Good performing ads to scale

---

### 8. Data Management - Sales Data

Add revenue/sales manually:
- Date & Time
- Customer Email
- Transaction ID
- Plan Name
- Country
- Amount

---

### 9. Data Management - Leads Data

Add leads manually:
- Date
- Source (Facebook Ads, Google Ads, etc.)
- Lead Count
- Campaign Name

---

### 10. Settings

- **Facebook Connection**: View connected accounts
- **Webhook & API**: Set up webhooks and get API key
- **Alert Settings**: Set thresholds for alerts
- **User Management**: Add/remove team members

---

## Where Does Data Come From?

| Data | Source |
|------|--------|
| Spend | Facebook API |
| Impressions | Facebook API |
| Clicks | Facebook API |
| Reach | Facebook API |
| Frequency | Facebook API |
| **Revenue** | Local Database (Data Management) |
| **Leads** | Local Database (Data Management) |
| **ROAS** | Calculated (Revenue / Spend) |

**Important**: Revenue and Leads are NOT from Facebook. You add them manually or via webhook/API.

---

## How Data Syncs

### First Time (Historical Sync)
- Fetches last 1 year of data
- Done in chunks to avoid rate limits
- Only happens once per account

### Daily Sync
- Runs every day at 2:00 AM
- Only fetches yesterday's data
- Very few API calls

### Manual Refresh
- Does NOT call Facebook API
- Just refreshes from local database
- Shows "Last synced" timestamp

---

## Tech Stack

| Part | Technology |
|------|------------|
| Frontend | Single HTML file with JavaScript |
| Backend | Node.js + Express.js |
| Database | SQLite |
| API | Facebook Marketing API v21.0 |

---

## API Endpoints

### For Data Display
```
GET /api/fb/campaigns/:accountId    - Get campaigns
GET /api/fb/adsets/:accountId       - Get ad sets
GET /api/fb/ads/:accountId          - Get ads
GET /api/fb/insights/:accountId     - Get overview metrics
GET /api/fb/countries/:accountId    - Get country data
GET /api/fb/sales/:accountId        - Get sales data
```

### For Syncing
```
POST /api/sync/:accountId           - Full sync
POST /api/sync/:accountId/campaigns - Sync campaigns only
POST /api/sync/:accountId/adsets    - Sync ad sets only
POST /api/sync/:accountId/ads       - Sync ads only
```

### For Data Management
```
POST /api/revenue                   - Add revenue
GET  /api/revenue                   - Get revenues
POST /api/leads                     - Add lead
GET  /api/leads                     - Get leads
```

---

## ROAS Color Coding

| ROAS Value | Color | Meaning |
|------------|-------|---------|
| 1.5 or higher | Green | Good! Making profit |
| 1.0 to 1.49 | Orange | Break-even, needs attention |
| Below 1.0 | Red | Losing money |
| Below 0.5 | Dark Red Row | Critical - stop or fix now |

---

## Setup on New Computer

1. Clone repository
2. Go to `backend` folder
3. Run `npm install`
4. Copy `.env.example` to `.env`
5. Add your Facebook credentials to `.env`
6. Run `npm start`
7. Open `index.html` in browser

---

## Files NOT in GitHub (for security)

- `.env` - Contains secret tokens
- `token.json` - Facebook tokens
- `*.sqlite` / `*.db` - Database files
- `node_modules/` - Dependencies (run npm install)

---

**That's it!** The app syncs data from Facebook, stores it locally, and shows it in a nice dashboard. Revenue and leads come from your own data, not Facebook.
