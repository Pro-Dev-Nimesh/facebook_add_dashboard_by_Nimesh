# Product Requirements Document (PRD)
# Facebook Ads Dashboard for Pabbly

**Version:** 2.0
**Date:** January 29, 2026
**Status:** Ready for Development

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Ad Accounts Configuration](#2-ad-accounts-configuration)
3. [Data Source Architecture](#3-data-source-architecture)
4. [Dashboard Sections](#4-dashboard-sections)
5. [Data Management](#5-data-management)
6. [Alerts System](#6-alerts-system)
7. [Settings](#7-settings)
8. [API Endpoints](#8-api-endpoints)
9. [Database Schema](#9-database-schema)
10. [Data Sync Strategy](#10-data-sync-strategy)
11. [Authentication & Security](#11-authentication--security)
12. [Technical Stack](#12-technical-stack)
13. [Setup Instructions](#13-setup-instructions)

---

## 1. Executive Summary

### 1.1 Purpose
A unified dashboard to track Facebook Ads performance across Pabbly product accounts. The dashboard combines Facebook advertising metrics with locally-managed revenue and lead data to provide complete business insights.

### 1.2 Key Features
- Multi-account management (3 Pabbly ad accounts)
- Real-time campaign, ad set, and ad performance tracking
- Revenue tracking from Pabbly Subscription Billing (not Facebook)
- Lead management from various sources
- Automated alerts for performance issues
- Webhook integration for external data
- API access for programmatic data retrieval
- User management with role-based access

### 1.3 Target Users
- Marketing Team (view performance, manage alerts)
- Finance Team (track revenue, generate reports)
- Developers (API integration, webhook setup)
- Administrators (user management, settings)

---

## 2. Ad Accounts Configuration

### 2.1 Configured Accounts

| Account Name | Facebook Account ID | Internal ID | Type |
|-------------|---------------------|-------------|------|
| Pabbly Connect One Time | act_883912415611751 | 1 | connect |
| Pabbly Chatflow | act_1304022760826324 | 2 | chatflow |
| Pabbly Billing One Time | act_505099201137104 | 3 | psb |

### 2.2 Account Switching
- Users can switch between accounts using the dropdown in the header
- Each account has its own set of campaigns, metrics, and data
- Data is stored separately per account in the database

---

## 3. Data Source Architecture

### 3.1 Critical Data Sources

This is the most important section. Each metric has a specific source:

| Metric | Source | How It's Obtained |
|--------|--------|-------------------|
| **Spend** | Facebook API | Synced from Facebook Marketing API |
| **Impressions** | Facebook API | Synced from Facebook Marketing API |
| **Clicks** | Facebook API | Synced from Facebook Marketing API |
| **Reach** | Facebook API | Synced from Facebook Marketing API |
| **Frequency** | Facebook API | Synced from Facebook Marketing API |
| **Revenue** | Local Database | Added via Data Management or Webhook |
| **Leads** | Local Database | Added via Data Management or Webhook |
| **Sales Count** | Local Database | Counted from revenue_transactions table |
| **ROAS** | Calculated | Formula: Revenue / Spend |
| **Cost Per Lead** | Calculated | Formula: Spend / Leads |

### 3.2 Important Rules

1. **Revenue is NOT from Facebook**
   - Revenue comes from the `revenue_transactions` table
   - Users add revenue manually or via webhooks
   - Facebook does not provide revenue data

2. **Leads are NOT from Facebook**
   - Leads come from the `leads` table
   - Users add leads manually or via webhooks
   - Facebook lead forms are NOT integrated

3. **ROAS Calculation**
   - ROAS = Total Revenue (from local DB) / Total Spend (from Facebook)
   - If no revenue data exists, ROAS = 0

4. **Zero Values**
   - If no revenue/leads data exists for a campaign/ad, show 0
   - Do not fetch from Facebook for revenue/leads

---

## 4. Dashboard Sections

### 4.1 Overview Section

**Location:** Dashboard > Overview

**KPI Cards (5 cards at top):**

| Card | Value | Source | Format |
|------|-------|--------|--------|
| Total Ad Spend | Sum of all spend | Facebook API | $XX,XXX.XX |
| Total Revenue | Sum of all revenue | Local DB | $XX,XXX.XX |
| ROAS | Revenue / Spend | Calculated | X.XX |
| Total Leads | Sum of lead counts | Local DB | XXX |
| Pixel Status | Active/Inactive | Facebook API | Green/Red dot |

**Quick Performance Snapshot:**

| Period | Date Display | Metrics Shown |
|--------|--------------|---------------|
| Today | Current date | Spend, Revenue, ROAS, Leads, CPL |
| This Week | Mon-Sun range | Spend, Revenue, ROAS, Leads, CPL |
| This Month | 1st to current | Spend, Revenue, ROAS, Leads, CPL |

### 4.2 Campaigns Section

**Location:** Dashboard > Campaigns

**Filters:**
- Status: Active / Paused / All
- Search: By campaign name

**Table Columns:**

| Column | Type | Source | Sortable |
|--------|------|--------|----------|
| Status | Badge | Facebook | No |
| Campaign Name | Text | Facebook | No |
| Budget | Currency | Facebook | Yes |
| Spent | Currency | Facebook | Yes (Default) |
| Sales | Integer | Local DB | Yes |
| Revenue | Currency | Local DB | Yes |
| ROAS | Decimal | Calculated | Yes |
| Frequency | Decimal | Facebook | Yes |
| Clicks | Integer | Facebook | Yes |
| Reach | Integer | Facebook | Yes |
| Impressions | Integer | Facebook | Yes |

**ROAS Color Coding:**
- Green: >= 1.5 (Profitable)
- Orange: 1.0 - 1.49 (Break-even)
- Red: < 1.0 (Losing money)
- Dark Red Row: < 0.5 (Critical)

### 4.3 Ad Sets Section

**Location:** Dashboard > Ad Sets

**Additional Filter:**
- Campaign Filter: Dropdown to filter ad sets by parent campaign

**Table Columns:** Same as Campaigns, plus:
- Campaign Name (parent campaign)

### 4.4 Ads Section

**Location:** Dashboard > Ads

**Additional Filters:**
- Campaign Filter: Dropdown
- Ad Set Filter: Dropdown (cascading - filtered by selected campaign)

**Table Columns:** Same as Ad Sets, plus:
- Ad Set Name (parent ad set)
- Creative Thumbnail (clickable for preview)

### 4.5 Country Performance Section

**Location:** Dashboard > Country Performance

**Table Columns:**

| Column | Type | Source |
|--------|------|--------|
| Country | Text + Flag | Facebook API |
| Ad Spend | Currency | Facebook API |
| Sales | Integer | Local DB (matched by country) |
| Revenue | Currency | Local DB (matched by country) |
| ROAS | Decimal | Calculated |

**Note:** Country data for revenue/sales comes from the `country_code` field in `revenue_transactions` table.

### 4.6 Sales by Ad Creative Section

**Location:** Dashboard > Sales by Ad Creative

**Purpose:** Shows individual sales transactions with the ad that generated them.

**Table Columns:**

| Column | Type | Source |
|--------|------|--------|
| Date & Time | Timestamp | revenue_transactions |
| Ad Name | Text | Linked from ads table |
| Campaign | Text | Linked from campaigns table |
| Ad Set | Text | Linked from ad_sets table |
| Country | Text + Flag | revenue_transactions |
| Amount | Currency | revenue_transactions |
| Transaction ID | Text | revenue_transactions |
| Customer Email | Text | revenue_transactions |

**Time Filters:** Today, This Week, This Month, All Time

---

## 5. Data Management

### 5.1 Sales Data Entry

**Location:** Data Management > Sales Data

**Purpose:** Manually add revenue/sales transactions

**Form Fields:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Date & Time | datetime-local | Yes | Cannot be future date |
| Customer Email | Email | Yes | Valid email format |
| Transaction ID | Text | Yes | Unique |
| Product/Plan | Text | Yes | - |
| Country | Dropdown | No | Country list |
| Amount | Number | Yes | > 0 |
| Source | Dropdown | Yes | Manual/Webhook/API |
| Notes | Textarea | No | - |

**Actions:**
- Add Entry: Opens form modal
- Edit: Update existing entry
- Delete: Remove entry (with confirmation)

### 5.2 Leads Data Entry

**Location:** Data Management > Leads Data

**Purpose:** Track lead counts by date and source

**Form Fields:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Date | Date | Yes | Cannot be future |
| Source | Dropdown | Yes | Facebook Ads, Google Ads, Organic, etc. |
| Lead Count | Number | Yes | >= 1 |
| Campaign Name | Text | No | - |
| Notes | Textarea | No | - |

### 5.3 Webhook Integration

**Incoming Webhooks for Revenue:**

```
POST /api/webhooks/incoming/{webhookId}

Request Body:
{
  "amount": 99.99,
  "transaction_id": "TXN123456",
  "customer_email": "customer@example.com",
  "product": "Pabbly Connect Lifetime",
  "country": "India",
  "country_code": "IN",
  "created_at": "2024-01-15T10:30:00Z"
}

Response:
{
  "success": true,
  "message": "Revenue recorded",
  "id": 123
}
```

**Incoming Webhooks for Leads:**

```
POST /api/webhooks/incoming/{webhookId}

Request Body:
{
  "date": "2024-01-15",
  "count": 5,
  "source": "facebook",
  "campaign_name": "Q1 Campaign",
  "email": "lead@example.com"
}

Response:
{
  "success": true,
  "message": "Leads recorded",
  "id": 456
}
```

---

## 6. Alerts System

### 6.1 Alert Types

| Type | Priority | Trigger Condition |
|------|----------|-------------------|
| Low ROAS | Critical | ROAS < min_campaign_roas AND spend > $100 |
| Zero Sales | Critical | Revenue = $0 AND spend > $50 |
| High Frequency | Warning | Frequency > high_frequency threshold |
| Overspend | Warning | Daily spend > daily_limit |
| High ROAS | Opportunity | ROAS > 2.0 |

### 6.2 Alert Thresholds (Configurable)

| Setting | Default Value | Description |
|---------|---------------|-------------|
| campaign_overspend | $500 | Alert when campaign spend exceeds |
| adset_overspend | $200 | Alert when ad set spend exceeds |
| daily_limit | $1,000 | Alert when daily account spend exceeds |
| min_campaign_roas | 1.0 | Alert when campaign ROAS below |
| min_adset_roas | 0.8 | Alert when ad set ROAS below |
| critical_roas | 0.5 | Mark as critical when ROAS below |
| high_frequency | 3.0 | Alert when frequency above |
| critical_frequency | 4.0 | Mark as critical when frequency above |

### 6.3 Alert Lifecycle

```
Created (status: investigating)
    ↓
In Progress (status: in_progress)
    ↓
Resolved (status: resolved) OR Dismissed (status: dismissed)
```

### 6.4 Alert Features

- **Comments:** Users can add comments to track investigation
- **Status Updates:** Track who changed status and when
- **Auto-regeneration:** Alerts regenerate after data sync
- **Tabs:** "Needs Action" (Critical/Warning) and "Opportunities" (High performers)

---

## 7. Settings

### 7.1 Facebook Connection

**Location:** Settings > Facebook Connection

**Features:**
- View connected ad accounts
- See last sync timestamp
- Connection status (Active/Error/Disconnected)
- Manual sync trigger

### 7.2 Webhooks & API

**Location:** Settings > Webhooks & API

**Webhook Management:**
- Create webhook with unique URL
- Configure webhook type (Revenue/Leads/Alerts)
- Generate secret key for signature verification
- Test webhook functionality
- Enable/disable webhooks

**API Key Management:**
- Generate API keys for external access
- View key prefix (e.g., fb_abc123...)
- Set permissions per key
- Revoke/regenerate keys

### 7.3 Alert & Budget Settings

**Location:** Settings > Alert & Budget Settings

**Configurable Thresholds:**
- Spend thresholds (campaign, ad set, daily)
- ROAS thresholds (minimum, critical)
- Frequency thresholds (warning, critical)
- Time window for evaluation (7 days, 30 days)
- Alert type toggles (enable/disable each type)

### 7.4 User Management

**Location:** Settings > User Management

**User Roles:**

| Role | Dashboard | Edit Data | Settings | Users |
|------|-----------|-----------|----------|-------|
| Admin | Full | Yes | Yes | Yes |
| Editor | Full | Yes | Limited | No |
| Viewer | Read-only | No | No | No |

**User Actions:**
- Add new user
- Update role
- Remove user
- View last login

---

## 8. API Endpoints

### 8.1 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/logout` | Logout (client-side) |
| GET | `/api/auth/me` | Get current user profile |
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/auth/google` | Start Google OAuth |
| GET | `/api/auth/google/callback` | OAuth callback |

**Login Request:**
```json
POST /api/auth/login
{
  "email": "admin@pabbly.com",
  "password": "Admin@123"
}
```

**Login Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "Admin",
      "email": "admin@pabbly.com",
      "role": "admin"
    },
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "accounts": [
      { "id": 1, "name": "Pabbly Connect", "type": "connect", "status": "active" }
    ]
  }
}
```

### 8.2 Facebook Data Endpoints

All endpoints require `Authorization: Bearer {token}` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fb/accounts` | List all ad accounts |
| GET | `/api/fb/insights/:accountId` | Account-level metrics |
| GET | `/api/fb/campaigns/:accountId` | List campaigns |
| GET | `/api/fb/adsets/:accountId` | List ad sets |
| GET | `/api/fb/ads/:accountId` | List ads |
| GET | `/api/fb/countries/:accountId` | Country breakdown |
| GET | `/api/fb/sales/:accountId` | Sales by ad creative |
| GET | `/api/fb/time-metrics/:accountId` | Today/Week/Month data |

**Query Parameters:**
- `status`: 'active', 'paused', 'all'
- `startDate`: YYYY-MM-DD
- `endDate`: YYYY-MM-DD
- `campaignId`: Filter by campaign
- `adsetId`: Filter by ad set

**Campaigns Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "120209933455360486",
      "name": "TOFU Campaign",
      "status": "active",
      "budget": 1100,
      "spend": 33702.9,
      "sales": 0,
      "revenue": 0,
      "roas": "0.00",
      "impressions": 12259695,
      "clicks": 291328,
      "reach": 4240856,
      "frequency": 2.9
    }
  ]
}
```

**Insights Response:**
```json
{
  "success": true,
  "data": {
    "totalSpend": 42918.56,
    "totalRevenue": 6008,
    "roas": "0.14",
    "totalLeads": 194,
    "totalSales": 15,
    "costPerLead": "221.23",
    "impressions": 57678472,
    "clicks": 1605080,
    "reach": 14705954
  }
}
```

### 8.3 Revenue Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/revenue/:accountId` | Add revenue entry |
| GET | `/api/revenue/:accountId` | List transactions |
| GET | `/api/revenue/:accountId/summary` | Revenue summary |
| PUT | `/api/revenue/:accountId/:entryId` | Update entry |
| DELETE | `/api/revenue/:accountId/:entryId` | Delete entry |

**Add Revenue Request:**
```json
POST /api/revenue/1
{
  "transaction_id": "TXN123456",
  "customer_email": "customer@example.com",
  "product": "Pabbly Connect Lifetime",
  "country": "India",
  "country_code": "IN",
  "amount": 299.00,
  "source": "manual",
  "created_at": "2024-01-15T10:30:00Z",
  "notes": "Lifetime deal purchase"
}
```

### 8.4 Leads Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/leads/:accountId` | Add lead entry |
| GET | `/api/leads/:accountId` | List leads |
| GET | `/api/leads/:accountId/summary` | Leads summary |
| PUT | `/api/leads/:accountId/:entryId` | Update entry |
| DELETE | `/api/leads/:accountId/:entryId` | Delete entry |

**Add Lead Request:**
```json
POST /api/leads/1
{
  "date": "2024-01-15",
  "count": 5,
  "source": "facebook",
  "campaign_name": "Q1 Lead Gen Campaign",
  "notes": "From landing page form"
}
```

### 8.5 Sync Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/:fbAccountId` | Full sync (all data) |
| POST | `/api/sync/:fbAccountId/campaigns` | Sync campaigns only |
| POST | `/api/sync/:fbAccountId/adsets` | Sync ad sets only |
| POST | `/api/sync/:fbAccountId/ads` | Sync ads only |

**Sync Response:**
```json
{
  "success": true,
  "message": "Sync completed successfully",
  "data": {
    "campaigns": { "success": true, "count": 51 },
    "adsets": { "success": true, "count": 100 },
    "ads": { "success": true, "count": 100 },
    "countries": { "success": true, "count": 25 }
  }
}
```

### 8.6 Alerts Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts/:accountId` | List alerts |
| POST | `/api/alerts/:accountId/regenerate` | Regenerate alerts |
| PUT | `/api/alerts/:alertId` | Update alert status |
| POST | `/api/alerts/:alertId/comments` | Add comment |
| GET | `/api/alerts/thresholds/:accountId` | Get thresholds |
| POST | `/api/alerts/thresholds/:accountId` | Update thresholds |

### 8.7 Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/manage/:accountId` | List webhooks |
| POST | `/api/webhooks/manage/:accountId` | Create webhook |
| PUT | `/api/webhooks/manage/:webhookId` | Update webhook |
| DELETE | `/api/webhooks/manage/:webhookId` | Delete webhook |
| POST | `/api/webhooks/incoming/:webhookId` | Receive webhook data |

---

## 9. Database Schema

### 9.1 Users Table

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'viewer',  -- 'admin', 'editor', 'viewer'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);
```

### 9.2 Ad Accounts Table

```sql
CREATE TABLE ad_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  facebook_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,  -- 'connect', 'chatflow', 'psb'
  access_token TEXT,
  status TEXT DEFAULT 'active',
  last_synced DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 9.3 Campaigns Table

```sql
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  facebook_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',  -- 'active', 'paused'
  budget REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id)
);
```

### 9.4 Campaign Daily Metrics Table

```sql
CREATE TABLE campaign_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  date DATE NOT NULL,
  spend REAL DEFAULT 0,
  revenue REAL DEFAULT 0,
  sales INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  frequency REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, date),
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);
```

### 9.5 Ad Sets Table

```sql
CREATE TABLE ad_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  facebook_adset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  budget REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);
```

### 9.6 Ad Set Daily Metrics Table

```sql
CREATE TABLE adset_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  adset_id INTEGER NOT NULL,
  date DATE NOT NULL,
  spend REAL DEFAULT 0,
  revenue REAL DEFAULT 0,
  sales INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  frequency REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(adset_id, date),
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id),
  FOREIGN KEY (adset_id) REFERENCES ad_sets(id)
);
```

### 9.7 Ads Table

```sql
CREATE TABLE ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  adset_id INTEGER NOT NULL,
  facebook_ad_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  creative_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (adset_id) REFERENCES ad_sets(id)
);
```

### 9.8 Ad Daily Metrics Table

```sql
CREATE TABLE ad_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  ad_id INTEGER NOT NULL,
  date DATE NOT NULL,
  spend REAL DEFAULT 0,
  revenue REAL DEFAULT 0,
  sales INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  frequency REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ad_id, date),
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id),
  FOREIGN KEY (ad_id) REFERENCES ads(id)
);
```

### 9.9 Revenue Transactions Table

```sql
CREATE TABLE revenue_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  transaction_id TEXT UNIQUE,
  customer_email TEXT,
  product TEXT,
  country TEXT,
  country_code TEXT,
  amount REAL NOT NULL,
  source TEXT DEFAULT 'manual',  -- 'manual', 'webhook', 'api'
  campaign_id INTEGER,
  adset_id INTEGER,
  ad_id INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id)
);
```

### 9.10 Leads Table

```sql
CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  date DATE NOT NULL,
  source TEXT,
  count INTEGER NOT NULL,
  campaign_name TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id)
);
```

### 9.11 Country Performance Table

```sql
CREATE TABLE country_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  country_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  date DATE NOT NULL,
  spend REAL DEFAULT 0,
  revenue REAL DEFAULT 0,
  sales INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, country_code, date),
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id)
);
```

### 9.12 Alerts Table

```sql
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  type TEXT NOT NULL,  -- 'low_roas', 'zero_sales', 'high_frequency', 'overspend', 'high_roas'
  priority TEXT NOT NULL,  -- 'critical', 'warning', 'opportunity'
  level TEXT NOT NULL,  -- 'campaign', 'adset', 'ad', 'country'
  item_name TEXT NOT NULL,
  item_id INTEGER,
  spend REAL,
  roas REAL,
  threshold_info TEXT,
  status TEXT DEFAULT 'investigating',  -- 'investigating', 'in_progress', 'resolved', 'dismissed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id)
);
```

### 9.13 Alert Comments Table

```sql
CREATE TABLE alert_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (alert_id) REFERENCES alerts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 9.14 Alert Thresholds Table

```sql
CREATE TABLE alert_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER UNIQUE NOT NULL,
  campaign_overspend REAL DEFAULT 500,
  adset_overspend REAL DEFAULT 200,
  daily_limit REAL DEFAULT 1000,
  min_campaign_roas REAL DEFAULT 1.0,
  min_adset_roas REAL DEFAULT 0.8,
  critical_roas REAL DEFAULT 0.5,
  high_frequency REAL DEFAULT 3.0,
  critical_frequency REAL DEFAULT 4.0,
  time_window TEXT DEFAULT '7days',
  alert_types TEXT,  -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id)
);
```

### 9.15 Webhooks Table

```sql
CREATE TABLE webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  secret_key TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'revenue', 'leads', 'alerts'
  target_url TEXT,
  status TEXT DEFAULT 'active',
  last_triggered DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id)
);
```

### 9.16 Sync Status Table

```sql
CREATE TABLE sync_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER UNIQUE NOT NULL,
  initial_sync_complete INTEGER DEFAULT 0,
  initial_sync_started_at DATETIME,
  initial_sync_completed_at DATETIME,
  last_daily_sync_at DATETIME,
  last_sync_status TEXT DEFAULT 'pending',
  last_sync_error TEXT,
  next_scheduled_sync DATETIME,
  total_api_calls_today INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES ad_accounts(id)
);
```

---

## 10. Data Sync Strategy

### 10.1 Two-Phase Sync Approach

**Phase 1: Initial Sync (One-Time)**
- Triggered when account is first connected
- Fetches last 30 days of historical data
- Stores campaigns, ad sets, ads, and daily metrics
- Marks `initial_sync_complete = 1`
- Takes 2-5 minutes depending on data volume

**Phase 2: Daily Sync (Automated)**
- Runs every day at 2:00 AM via cron job
- Fetches only yesterday's data
- Updates relevant metric records
- Regenerates alerts with fresh data
- Takes 1-2 minutes

### 10.2 Sync Flow

```
Initial Sync:
1. Fetch all campaigns from Facebook
2. For each campaign, fetch daily metrics
3. Store in campaigns + campaign_daily_metrics tables
4. Repeat for ad sets and ads
5. Fetch country breakdown
6. Mark sync complete

Daily Sync:
1. Get yesterday's date
2. Fetch campaigns/adsets/ads with yesterday's metrics
3. Update or insert into daily_metrics tables
4. Update country_performance table
5. Regenerate alerts
6. Update last_sync timestamp
```

### 10.3 Manual Refresh Behavior

When user clicks "Refresh" button:
- Does NOT call Facebook API
- Loads data from local database
- Shows "Last synced: X hours ago" timestamp
- Instant response (no API delay)

### 10.4 Rate Limit Protection

- Maximum 50 API calls per account per day
- 2-second delay between consecutive API calls
- Exponential backoff on rate limit errors
- Queue system for large syncs

---

## 11. Authentication & Security

### 11.1 JWT Authentication

- Token-based authentication using JSON Web Tokens
- Token expiry: 7 days
- Token stored in frontend localStorage
- All API requests require `Authorization: Bearer {token}` header

### 11.2 User Roles

| Role | Permissions |
|------|-------------|
| Admin | Full access to all features, accounts, and settings |
| Editor | View and edit data within assigned accounts |
| Viewer | Read-only access to assigned accounts |

### 11.3 Default Admin Account

**Email:** admin@pabbly.com
**Password:** Admin@123

### 11.4 Password Security

- Passwords hashed with bcryptjs (10 rounds)
- Minimum password length: 6 characters
- Password change endpoint available

### 11.5 Webhook Security

- Each webhook has unique secret key
- HMAC-SHA256 signature verification (optional)
- Signature sent in `x-webhook-signature` header

### 11.6 Google OAuth (Optional)

- Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- Auto-creates user account on first login
- Assigns 'viewer' role by default

---

## 12. Technical Stack

### 12.1 Frontend

| Component | Technology |
|-----------|------------|
| Structure | Single HTML file |
| Styling | CSS3 with CSS Variables |
| Scripting | Vanilla JavaScript (ES6+) |
| Icons | Font Awesome 6.4.0 |
| Fonts | Google Fonts (Inter) |

### 12.2 Backend

| Component | Technology |
|-----------|------------|
| Runtime | Node.js v18+ |
| Framework | Express.js v5.2.1 |
| Database | SQLite (better-sqlite3) |
| Authentication | JWT + Passport.js |
| HTTP Client | Axios |
| Scheduling | node-cron |
| Password Hashing | bcryptjs |

### 12.3 External APIs

| API | Version | Purpose |
|-----|---------|---------|
| Facebook Marketing API | v22.0 | Fetch ad performance data |
| Google OAuth | 2.0 | Optional SSO |

### 12.4 File Structure

```
project/
├── index.html              (Frontend - single file)
├── README.md               (Setup instructions)
├── PRD.md                  (This document)
└── backend/
    ├── package.json        (Dependencies)
    ├── .env                (Configuration - not in git)
    ├── .env.example        (Template for .env)
    ├── database.sqlite     (SQLite database - not in git)
    └── src/
        ├── index.js        (Express server entry)
        ├── middleware/
        │   └── auth.js     (JWT + role middleware)
        ├── models/
        │   └── database.js (Schema + initialization)
        ├── routes/
        │   ├── auth.js     (Authentication)
        │   ├── facebookData.js (Facebook data endpoints)
        │   ├── revenue.js  (Revenue CRUD)
        │   ├── leads.js    (Leads CRUD)
        │   ├── alerts.js   (Alerts management)
        │   ├── webhooks.js (Webhook endpoints)
        │   ├── sync.js     (Sync triggers)
        │   ├── settings.js (Settings API)
        │   └── users.js    (User management)
        └── services/
            ├── facebookApi.js   (Facebook API service)
            ├── syncService.js   (Sync logic)
            ├── alertGenerator.js (Alert generation)
            └── cronJobs.js      (Scheduled tasks)
```

---

## 13. Setup Instructions

### 13.1 Prerequisites

- Node.js v18 or higher
- npm (comes with Node.js)
- Facebook Developer Account
- Facebook Marketing API access token

### 13.2 Installation Steps

**Step 1: Clone Repository**
```bash
git clone https://github.com/Pro-Dev-Nimesh/facebook_add_dashboard_by_Nimesh.git
cd facebook_add_dashboard_by_Nimesh
```

**Step 2: Install Backend Dependencies**
```bash
cd backend
npm install
```

**Step 3: Configure Environment**
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your-secure-random-secret-key
JWT_EXPIRES_IN=7d
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_ACCESS_TOKEN=your-facebook-access-token
FRONTEND_URL=http://localhost:5500
BACKEND_URL=http://localhost:3001
```

**Step 4: Start Backend Server**
```bash
npm start
```
Server runs at http://localhost:3001

**Step 5: Open Frontend**
- Open `index.html` in browser, OR
- Use VS Code Live Server extension (recommended)
- Frontend accessible at http://localhost:5500

### 13.3 First Login

1. Open the application in browser
2. Login with:
   - Email: `admin@pabbly.com`
   - Password: `Admin@123`
3. Select an ad account from the dropdown
4. Click "Sync" to fetch data from Facebook

### 13.4 Getting Facebook Access Token

1. Go to Facebook Developer Portal
2. Create or select your app
3. Go to Graph API Explorer
4. Select your app
5. Request permissions: `ads_read`, `ads_management`
6. Generate long-lived token
7. Copy token to `.env` file

---

## Appendix A: ROAS Calculation Examples

| Spend | Revenue | ROAS | Color | Meaning |
|-------|---------|------|-------|---------|
| $1,000 | $2,000 | 2.00 | Green | Excellent - 100% profit |
| $1,000 | $1,500 | 1.50 | Green | Good - 50% profit |
| $1,000 | $1,000 | 1.00 | Orange | Break-even |
| $1,000 | $700 | 0.70 | Red | Losing 30% |
| $1,000 | $300 | 0.30 | Dark Red | Critical - losing 70% |

---

## Appendix B: Country Codes

Common country codes used in the system:

| Country | Code | Flag |
|---------|------|------|
| United States | US | 🇺🇸 |
| India | IN | 🇮🇳 |
| United Kingdom | GB | 🇬🇧 |
| Germany | DE | 🇩🇪 |
| Canada | CA | 🇨🇦 |
| Australia | AU | 🇦🇺 |
| Brazil | BR | 🇧🇷 |
| France | FR | 🇫🇷 |

---

## Appendix C: Error Codes

| Code | Message | Action |
|------|---------|--------|
| 401 | Unauthorized | Re-login or refresh token |
| 403 | Forbidden | Check user permissions |
| 404 | Not Found | Check endpoint URL |
| 429 | Too Many Requests | Wait and retry |
| 500 | Server Error | Check server logs |

---

**End of Document**

*Document created for Pabbly development team. For questions, contact the project lead.*
