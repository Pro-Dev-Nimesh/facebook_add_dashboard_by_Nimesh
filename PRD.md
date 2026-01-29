# Product Requirements Document (PRD)
# Facebook Ads Dashboard - Pabbly

**Version:** 1.0
**Last Updated:** January 29, 2026
**Status:** Frontend Complete - Backend Development Required

---

## Table of Contents
1. [Product Overview](#1-product-overview)
2. [User Authentication](#2-user-authentication)
3. [Navigation Structure](#3-navigation-structure)
4. [Dashboard Pages & Features](#4-dashboard-pages--features)
5. [Data Tables Specification](#5-data-tables-specification)
6. [Forms & Modals](#6-forms--modals)
7. [Settings & Configuration](#7-settings--configuration)
8. [Data Models](#8-data-models)
9. [API Endpoints Required](#9-api-endpoints-required)
10. [Webhook System](#10-webhook-system)
11. [Alert System](#11-alert-system)
12. [User Roles & Permissions](#12-user-roles--permissions)
13. [Technical Specifications](#13-technical-specifications)
14. [Facebook Data Sync Strategy](#14-facebook-data-sync-strategy)
15. [Rate Limiting & API Protection](#15-rate-limiting--api-protection)

---

## 1. Product Overview

### 1.1 Description
A comprehensive Facebook Ads Dashboard that integrates with Pabbly products to provide real-time analytics, revenue tracking, lead management, and performance alerts for Facebook advertising campaigns.

### 1.2 Key Features
- Multi-account management (4 Pabbly products)
- Real-time campaign, ad set, and ad performance tracking
- Revenue and leads data management from Pabbly Subscription Billing
- Automated alerts for performance issues and opportunities
- Webhook integrations for external notifications
- API access for programmatic data retrieval
- User management with role-based access control

### 1.3 Supported Ad Accounts
| Account | Type | Description |
|---------|------|-------------|
| Pabbly Connect | Primary | Main Facebook Ads account |
| Pabbly Chatflow | Secondary | Chatflow product ads |
| Pabbly Email Marketing | Secondary | Email marketing product ads |
| Pabbly PSB | Secondary | Subscription billing product ads |

---

## 2. User Authentication

### 2.1 Login System
- **Email/Password Authentication**
- **Default Admin Account:** `admin@pabbly.com` / `Admin@123`
- **Session Persistence:** localStorage-based (requires backend JWT implementation)

### 2.2 Signup System
| Field | Type | Validation |
|-------|------|------------|
| Full Name | Text | Required |
| Email | Email | Required, unique |
| Password | Password | Required, min 6 characters |
| Confirm Password | Password | Required, must match |

### 2.3 Google SSO (Placeholder)
- UI implemented, requires OAuth 2.0 backend integration

### 2.4 Sign Out
- User avatar dropdown in header
- Clears session and redirects to login

---

## 3. Navigation Structure

### 3.1 Sidebar Menu

```
MENU
├── Dashboard (Expandable)
│   ├── Overview Metrics      → metrics-section
│   ├── Campaigns             → campaigns-section
│   ├── Ad Sets               → adsets-section
│   ├── Ads                   → ads-section
│   ├── Country Performance   → country-section
│   └── Sales by Ad Creative  → sales-creative-section
│
├── Alerts                    → alerts-section
│
├── Data Management (Expandable)
│   ├── Sales Data            → pabbly-revenue-section
│   └── Leads Data            → leads-data-section
│
└── Settings (Expandable)
    ├── Facebook Connection   → facebook-connection-section
    ├── Webhook and API       → webhooks-section
    ├── Alert & Budget Settings → alert-thresholds-section
    └── User Management       → user-management-section

HELP
└── Best Practices (SOP)      → External link
```

### 3.2 Header Components
- Account Switcher Dropdown (4 accounts)
- Notification Bell (with badge)
- Help Icon
- User Avatar Menu (Sign Out)

---

## 4. Dashboard Pages & Features

### 4.1 Overview Metrics (`metrics-section`)

#### 4.1.1 KPI Cards (5 cards)
| Card | Value Type | Icon | Color |
|------|------------|------|-------|
| Total Ad Spend | Currency | Dollar | Blue |
| Total Revenue | Currency | Chart | Green |
| ROAS | Decimal | Trending | Orange/Green/Red |
| Total Leads | Integer | Users | Purple |
| Pixel Status | Active/Inactive | Dot | Green/Red |

#### 4.1.2 Custom Date Range Report
- Time Range Selector: Today, Last 7 Days, Last 30 Days, Last 90 Days, This Month, Last Month
- Refresh Button with "Last synced" timestamp

#### 4.1.3 Quick Performance Snapshot
| Period | Date Display | Metrics |
|--------|--------------|---------|
| Today | Current date | Spend, Revenue, ROAS, Leads, CPL |
| This Week | Date range | Spend, Revenue, ROAS, Leads, CPL |
| This Month | Date range | Spend, Revenue, ROAS, Leads, CPL |

---

### 4.2 Campaigns Page (`campaigns-section`)

#### 4.2.1 Features
- Status Filter: Active / Paused / All
- Search: By campaign name
- Sortable Columns
- Pagination

#### 4.2.2 Table Columns
| Column | Type | Sortable | Notes |
|--------|------|----------|-------|
| Status | Badge | No | Active (green) / Paused (orange) |
| Campaign Name | Text | No | Bold |
| Budget | Currency | Yes | |
| Spent | Currency | Yes | Default sort |
| Sales | Integer | Yes | |
| Revenue | Currency | Yes | |
| ROAS | Decimal | Yes | Color-coded |
| Frequency | Decimal | Yes | |
| Outbound Clicks | Integer | Yes | Comma-formatted |
| Reach | Integer | Yes | Comma-formatted |
| Impressions | Integer | Yes | Comma-formatted |

#### 4.2.3 ROAS Color Coding
- **Green:** >= 1.5 (Good)
- **Orange:** 1.0 - 1.49 (Warning)
- **Red:** < 1.0 (Bad)
- **Dark Red Row:** < 0.5 (Critical)
- **Light Red Row:** 0.5 - 0.99 (Warning)

---

### 4.3 Ad Sets Page (`adsets-section`)

#### 4.3.1 Features
- Status Filter: Active / Paused / All
- Campaign Filter: Dropdown (filters ad sets by parent campaign)
- Search: By ad set name
- Same columns as Campaigns

---

### 4.4 Ads Page (`ads-section`)

#### 4.4.1 Features
- Status Filter: Active / Paused / All
- Campaign Filter: Dropdown
- Ad Set Filter: Dropdown (cascading - filtered by selected campaign)
- Search: By ad name
- Same columns as Campaigns

---

### 4.5 Country Performance (`country-section`)

#### 4.5.1 Features
- Search: By country name
- Data Source: Pabbly Subscription Billing (not Facebook Pixel)

#### 4.5.2 Table Columns
| Column | Type | Notes |
|--------|------|-------|
| Country | Text + Flag | Flag icon from flagcdn.com |
| Ad Spend | Currency | |
| Sales | Integer | |
| Revenue | Currency | |
| ROAS | Decimal | Color-coded |

---

### 4.6 Sales by Ad Creative (`sales-creative-section`)

#### 4.6.1 Features
- Time Period Filter: All Time / Today / This Week / This Month
- Search: By ad name, campaign, ad set
- Creative Preview Modal (click thumbnail)

#### 4.6.2 Table Columns
| Column | Type | Notes |
|--------|------|-------|
| Creative | Thumbnail | Clickable for preview |
| Ad Name | Text | |
| Campaign | Text | |
| Ad Set | Text | |
| Country | Text + Flag | |
| Amount | Currency | |
| Date & Time | Timestamp | |

---

### 4.7 Alerts Page (`alerts-section`)

#### 4.7.1 Tab Structure
- **Needs Action:** Critical & Warning alerts
- **Opportunities:** Growth opportunities

#### 4.7.2 Alert Types
| Type | Priority | Example Trigger |
|------|----------|-----------------|
| Low ROAS Campaign | Critical | ROAS < threshold with high spend |
| Zero Sales Ad Set | Critical | $0 revenue with significant spend |
| High Frequency | Warning | Frequency > 3.5 |
| Country Overspend | Warning | Spend > budget with low ROAS |
| High ROAS Campaign | Opportunity | ROAS significantly above target |
| Scaling Potential | Opportunity | High performance at low spend |

#### 4.7.3 Alert Card Structure
- Priority Badge (Critical/Warning/Opportunity)
- Task Type & Level (Campaign/Ad Set/Ad/Country)
- Item Name
- Metrics: Spend, Sales, ROAS
- Status Dropdown: Investigating, In Progress, Resolved, Dismissed
- Expandable Details:
  - Threshold Information
  - Comment System (with author & timestamp)
  - Action Buttons

#### 4.7.4 Alert Actions
| Action | Description |
|--------|-------------|
| Pause Campaign/Ad | Pause in Facebook Ads Manager |
| View in Facebook | Open Facebook Ads Manager |
| Adjust Targeting | Modify targeting settings |
| Increase Budget | Scale budget |
| Mark Resolved | Close alert |
| Dismiss | Ignore alert |

---

### 4.8 Sales Data (`pabbly-revenue-section`)

#### 4.8.1 Features
- Add Entry Button (opens modal)
- Time Filter: All Time / Today / This Week / This Month / Last 30 Days / Last 90 Days
- Country Filter: Dropdown
- Search: By Transaction ID

#### 4.8.2 Table Columns
| Column | Type | Notes |
|--------|------|-------|
| Date & Time | Timestamp | Single line format |
| Email | Email | Customer email |
| Transaction ID | Code | Monospace font |
| Plan | Text | Product name |
| Country | Text + Flag | |
| Amount | Currency | Green color |
| Action | Menu | Edit / Delete |

---

### 4.9 Leads Data (`leads-data-section`)

#### 4.9.1 Features
- Add Lead Button (opens modal)
- Time Filter: All Time / Today / This Week / This Month / Last 30 Days / Last 90 Days
- Source Filter: All Sources / Facebook Ads / Google Ads / Organic / Referral / Direct
- Search: By lead data

#### 4.9.2 Table Columns
| Column | Type | Notes |
|--------|------|-------|
| Date | Date | |
| Lead Count | Integer | Bold |
| Action | Menu | Edit / Delete |

---

## 5. Data Tables Specification

### 5.1 Common Table Features
| Feature | Implementation |
|---------|----------------|
| Search | Real-time filtering on keyup |
| Status Filter | Dropdown with color-coded left border |
| Sorting | Click column header, toggle asc/desc |
| Pagination | Rows per page (10/25/50/100), page navigation |
| Empty State | "No data" message with icon |
| Row Hover | Background color change |
| Action Menu | Three-dot button with dropdown |

### 5.2 Pagination Controls
- Rows per page selector
- "Page X of Y" display
- Jump to page input
- Previous/Next arrows (disabled at boundaries)

### 5.3 Default Sort
- All performance tables: ROAS ascending (low to high) to surface problems first

---

## 6. Forms & Modals

### 6.1 Add/Edit Revenue Modal
| Field | Type | Validation |
|-------|------|------------|
| Date & Time | datetime-local | Required |
| Customer Email | Email | Required |
| Transaction ID | Text | Required |
| Product/Plan | Text | Required |
| Country | Select | Optional |
| Amount | Number | Required |
| Source | Select | Webhook/Manual/API |
| Notes | Textarea | Optional |

### 6.2 Add/Edit Lead Modal
| Field | Type | Validation |
|-------|------|------------|
| Date | Date | Required |
| Source | Select | Required |
| Lead Count | Number | Required |
| Campaign Name | Text | Optional |
| Notes | Textarea | Optional |

### 6.3 Add/Edit Webhook Modal
| Field | Type | Validation |
|-------|------|------------|
| Webhook Name | Text | Required |
| Webhook URL | URL | Required |

### 6.4 Add/Edit User Modal
| Field | Type | Validation |
|-------|------|------------|
| First Name | Text | Required |
| Last Name | Text | Required |
| Email | Email | Required |
| Access Type | Radio | Full Access / Read Access |
| Ad Accounts | Checkboxes | Multi-select |

### 6.5 Delete Confirmation Modal
- Warning icon and message
- Cancel / Confirm Delete buttons
- "This action cannot be undone" notice

### 6.6 Creative Preview Modal
- Full-size image display
- Close on X button, outside click, or ESC key

---

## 7. Settings & Configuration

### 7.1 Facebook Connection (`facebook-connection-section`)

#### 7.1.1 Connected Accounts Tab
| Column | Description |
|--------|-------------|
| Ad Account Name | Account display name |
| Account ID | Facebook account ID |
| Status | Active indicator |
| Last Sync | Timestamp |
| Actions | View, Edit, Refresh, Disconnect |

#### 7.1.2 Connection Settings Tab
| Setting | Type | Options |
|---------|------|---------|
| Data Sync Frequency | Dropdown | 5 min, 15 min, 30 min, 1 hour, Manual |
| Auto-pause Low ROAS | Toggle | On/Off |
| Sync Pixel Events | Toggle | On/Off |
| Daily Summary Email | Toggle | On/Off |

#### 7.1.3 Webhook Events Tab
| Event | Description |
|-------|-------------|
| New Sales | Triggered on sale |
| New Leads | Triggered on lead |
| Overspend Alerts | Budget exceeded |
| Low ROAS Alerts | ROAS below threshold |
| High Frequency Alerts | Ad fatigue |
| Daily Reports | Daily summary |
| Pixel Status Changes | Pixel up/down |
| Campaign Status Changes | Pause/activate |

---

### 7.2 Webhook and API (`webhooks-section`)

#### 7.2.1 Webhooks Tab
- Add Webhook button
- Webhook cards with Test/Edit/Delete actions
- Empty state when no webhooks

#### 7.2.2 API Tab
- API Key display (masked with show/hide toggle)
- Copy to clipboard button
- Regenerate key button
- API Documentation:
  - Endpoint table (Method, URL, Description)
  - Code examples for Sales and Leads endpoints
  - Authentication instructions

---

### 7.3 Alert & Budget Settings (`alert-thresholds-section`)

#### 7.3.1 Spend Thresholds
| Setting | Type | Default |
|---------|------|---------|
| Campaign Overspend | Currency | $500 |
| Ad Set Overspend | Currency | $200 |
| Daily Account Limit | Currency | $1,000 |

#### 7.3.2 ROAS Thresholds
| Setting | Type | Default |
|---------|------|---------|
| Minimum Campaign ROAS | Decimal | 1.0 |
| Minimum Ad Set ROAS | Decimal | 0.8 |
| Critical ROAS Level | Decimal | 0.5 |

#### 7.3.3 Frequency Thresholds
| Setting | Type | Default |
|---------|------|---------|
| High Frequency Warning | Decimal | 3.0 |
| Critical Frequency | Decimal | 4.0 |

#### 7.3.4 Time Windows
| Setting | Options |
|---------|---------|
| Alert Evaluation Period | 24 hours, 3 days, 7 days, 30 days |
| Auto-resolve After | 24 hours, 3 days, 7 days, Never |

#### 7.3.5 Alert Type Toggles
- Overspend alerts
- Low ROAS alerts
- High frequency alerts
- Zero sales alerts
- Daily summary
- Opportunity alerts

---

### 7.4 User Management (`user-management-section`)

#### 7.4.1 User Table
| Column | Description |
|--------|-------------|
| User | Name + Avatar |
| Email | User email |
| Access Type | Admin/Editor/Viewer |
| Ad Accounts | Assigned accounts |
| Page Access | Full/Limited |
| Last Active | Timestamp |
| Actions | Edit/Remove |

---

## 8. Data Models

### 8.1 Account Data Structure
```javascript
{
  name: String,              // "Pabbly Connect"
  icon: String,              // Font Awesome class
  color: String,             // CSS gradient
  accountId: String,         // "act_123456789"

  metrics: {
    totalSpend: String,      // "$12,345.67"
    totalRevenue: String,    // "$16,100"
    roas: String,            // "1.31"
    totalLeads: String,      // "234"
    costPerLead: String,     // "$52.76"
    pixelStatus: String,     // "Active"
    totalSales: Number       // 27
  },

  timeBasedMetrics: {
    daily: { spend, revenue, roas, leads, cpl },
    weekly: { ... },
    monthly: { ... }
  },

  campaigns: [{
    name, status, budget, spend, sales, revenue,
    roas, frequency, outboundClicks, reach, impressions
  }],

  adSets: [{
    name, campaignName, status, budget, spend, sales,
    revenue, roas, frequency, outboundClicks, reach, impressions
  }],

  ads: [{
    name, campaignName, adSetName, status, budget, spend,
    sales, revenue, roas, frequency, outboundClicks, reach, impressions
  }],

  countries: [{
    name, flag, sales, revenue, spend, roas
  }],

  alerts: [{
    type, level, name, spend, roas, threshold
  }],

  recentSales: [{
    time, campaign, adSet, adName, country, amount
  }],

  revenueTransactions: [{
    date, txnId, customer, product, country, flag, amount, source
  }],

  leads: [{
    date, source, count, campaign, notes
  }]
}
```

---

## 9. API Endpoints Required

### 9.1 Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/signup` | User registration |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/google` | Google OAuth callback |
| POST | `/api/auth/refresh` | Refresh JWT token |

### 9.2 Dashboard Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/metrics/:accountId` | KPI metrics |
| GET | `/api/dashboard/campaigns/:accountId` | Campaigns list |
| GET | `/api/dashboard/adsets/:accountId` | Ad sets list |
| GET | `/api/dashboard/ads/:accountId` | Ads list |
| GET | `/api/dashboard/countries/:accountId` | Country data |
| GET | `/api/dashboard/sales/:accountId` | Sales by creative |

### 9.3 Revenue Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/revenue/:accountId` | List transactions |
| POST | `/api/revenue` | Create transaction |
| PUT | `/api/revenue/:id` | Update transaction |
| DELETE | `/api/revenue/:id` | Delete transaction |

### 9.4 Leads Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leads/:accountId` | List leads |
| POST | `/api/leads` | Create lead entry |
| PUT | `/api/leads/:id` | Update lead entry |
| DELETE | `/api/leads/:id` | Delete lead entry |

### 9.5 Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts/:accountId` | List alerts |
| PUT | `/api/alerts/:id/status` | Update status |
| POST | `/api/alerts/:id/comment` | Add comment |
| DELETE | `/api/alerts/:id` | Delete alert |

### 9.6 Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/:accountId` | List webhooks |
| POST | `/api/webhooks` | Create webhook |
| PUT | `/api/webhooks/:id` | Update webhook |
| DELETE | `/api/webhooks/:id` | Delete webhook |
| POST | `/api/webhooks/:id/test` | Test webhook |

### 9.7 Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/thresholds/:accountId` | Get thresholds |
| PUT | `/api/settings/thresholds/:accountId` | Update thresholds |
| GET | `/api/settings/sync/:accountId` | Get sync settings |
| PUT | `/api/settings/sync/:accountId` | Update sync settings |

### 9.8 User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

### 9.9 Facebook Integration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/facebook/accounts` | List connected accounts |
| POST | `/api/facebook/connect` | Connect new account |
| DELETE | `/api/facebook/disconnect/:id` | Disconnect account |
| POST | `/api/facebook/sync/:id` | Trigger manual sync |

---

## 10. Webhook System

### 10.1 Supported Events
| Event | Trigger | Payload |
|-------|---------|---------|
| `sale.created` | New sale recorded | Sale details |
| `lead.created` | New lead recorded | Lead details |
| `alert.overspend` | Budget exceeded | Alert details |
| `alert.low_roas` | ROAS below threshold | Alert details |
| `alert.high_frequency` | Frequency above threshold | Alert details |
| `report.daily` | Daily summary | Summary data |
| `pixel.status_changed` | Pixel status change | Status details |
| `campaign.status_changed` | Campaign paused/activated | Campaign details |

### 10.2 Webhook Payload Structure
```json
{
  "event": "sale.created",
  "timestamp": "2026-01-29T10:15:00Z",
  "account_id": "act_123456789",
  "data": {
    // Event-specific data
  }
}
```

---

## 11. Alert System

### 11.1 Alert Evaluation Rules
| Alert Type | Condition | Priority |
|------------|-----------|----------|
| Low ROAS | ROAS < threshold AND spend > $100 | Critical |
| Zero Sales | Revenue = $0 AND spend > $50 | Critical |
| High Frequency | Frequency > threshold | Warning |
| Overspend | Spend > budget threshold | Warning |
| High ROAS | ROAS > 2x target | Opportunity |

### 11.2 Alert Lifecycle
1. **Created**: Alert triggered by evaluation
2. **Investigating**: User reviewing
3. **In Progress**: Action being taken
4. **Resolved**: Issue fixed
5. **Dismissed**: Alert ignored

---

## 12. User Roles & Permissions

### 12.1 Access Levels
| Role | Dashboard | Edit Data | Settings | Users |
|------|-----------|-----------|----------|-------|
| Admin | Full | Yes | Yes | Yes |
| Editor | Full | Yes | Limited | No |
| Viewer | Read-only | No | No | No |

### 12.2 Page Access
| Level | Available Sections |
|-------|-------------------|
| Full Access | All sections |
| Dashboard Only | Dashboard, Alerts |
| Reports Only | Dashboard (read-only) |

---

## 13. Technical Specifications

### 13.1 Frontend Stack
- **HTML5** single-page application
- **CSS3** with CSS Variables for theming
- **Vanilla JavaScript** (no frameworks)
- **Font Awesome 6.4.0** for icons
- **Google Fonts (Inter)** for typography

### 13.2 Design Tokens
```css
--primary-color: #1877f2
--success-color: #00a67e
--warning-color: #f5a623
--danger-color: #e74c3c
--bg-color: #f0f2f5
--card-bg: #ffffff
--text-primary: #1c1e21
--text-secondary: #65676b
--border-color: #dddfe2
--sidebar-width: 260px
```

### 13.3 Backend Requirements
- **Authentication**: JWT with refresh tokens
- **Database**: PostgreSQL or MongoDB
- **Cache**: Redis for session storage
- **Queue**: Bull/RabbitMQ for background jobs
- **External APIs**: Facebook Marketing API, Google OAuth

### 13.4 Background Jobs Required
| Job | Frequency | Description |
|-----|-----------|-------------|
| Data Sync | 5-60 min | Fetch Facebook Ads data |
| Alert Evaluation | 15 min | Check thresholds |
| Webhook Dispatch | Real-time | Send webhook events |
| Daily Summary | Daily 9 AM | Generate reports |
| Token Refresh | Before expiry | Refresh Facebook tokens |

---

## Appendix A: Database Schema

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'editor', 'viewer') DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Ad Accounts Table
```sql
CREATE TABLE ad_accounts (
  id SERIAL PRIMARY KEY,
  facebook_account_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  status ENUM('active', 'disconnected') DEFAULT 'active',
  last_synced TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Campaigns Table
```sql
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES ad_accounts(id),
  facebook_campaign_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  status ENUM('active', 'paused') DEFAULT 'active',
  budget DECIMAL(10,2),
  spend DECIMAL(10,2),
  sales INTEGER DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  roas DECIMAL(5,2),
  frequency DECIMAL(5,2),
  outbound_clicks INTEGER,
  reach INTEGER,
  impressions INTEGER,
  synced_at TIMESTAMP
);
```

### Revenue Transactions Table
```sql
CREATE TABLE revenue_transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES ad_accounts(id),
  transaction_id VARCHAR(50) UNIQUE,
  customer_email VARCHAR(255),
  product VARCHAR(255),
  country VARCHAR(100),
  country_code VARCHAR(2),
  amount DECIMAL(10,2),
  source ENUM('webhook', 'manual', 'api'),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Leads Table
```sql
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES ad_accounts(id),
  date DATE NOT NULL,
  source VARCHAR(50),
  count INTEGER NOT NULL,
  campaign_name VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Alerts Table
```sql
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES ad_accounts(id),
  type ENUM('low_roas', 'zero_sales', 'high_frequency', 'overspend', 'opportunity'),
  priority ENUM('critical', 'warning', 'opportunity'),
  level ENUM('campaign', 'adset', 'ad', 'country'),
  item_name VARCHAR(255),
  spend DECIMAL(10,2),
  roas DECIMAL(5,2),
  threshold_info TEXT,
  status ENUM('investigating', 'in_progress', 'resolved', 'dismissed') DEFAULT 'investigating',
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
```

### Webhooks Table
```sql
CREATE TABLE webhooks (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES ad_accounts(id),
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL,
  events JSONB,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Appendix B: Sample API Responses

### GET /api/dashboard/metrics/:accountId
```json
{
  "success": true,
  "data": {
    "totalSpend": 12345.67,
    "totalRevenue": 16100.00,
    "roas": 1.31,
    "totalLeads": 234,
    "costPerLead": 52.76,
    "pixelStatus": "active",
    "totalSales": 27,
    "changes": {
      "spend": 12.5,
      "revenue": 8.2,
      "leads": 5.0
    }
  }
}
```

### GET /api/dashboard/campaigns/:accountId
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "USA - Lifetime Deal",
      "status": "active",
      "budget": 1200.00,
      "spend": 4523.45,
      "sales": 8,
      "revenue": 5600.00,
      "roas": 1.24,
      "frequency": 1.8,
      "outboundClicks": 3245,
      "reach": 125400,
      "impressions": 225720
    }
  ],
  "pagination": {
    "page": 1,
    "perPage": 10,
    "total": 6,
    "totalPages": 1
  }
}
```

---

## 14. Facebook Data Sync Strategy

### 14.1 Overview
To minimize Facebook API calls and prevent account blocking, we implement a **two-phase data fetching strategy**:
1. **Initial Historical Sync** - One-time fetch of 1 year historical data
2. **Incremental Daily Sync** - Daily fetch of only the previous day's data

### 14.2 Initial Historical Sync (One-Time)

#### When Triggered
- First time an ad account is connected
- Manual "Full Resync" requested by admin (rare)

#### Data Range
- **Period:** Last 365 days (1 year)
- **Granularity:** Daily breakdown

#### Process Flow
```
1. User connects Facebook Ad Account
2. System queues "Historical Sync" job
3. Job fetches data in chunks (30 days per request)
4. Data stored in local database
5. Mark account as "initial_sync_complete = true"
6. Enable incremental sync schedule
```

#### Chunked Fetching Strategy
| Chunk | Date Range | API Calls |
|-------|------------|-----------|
| 1 | Day 1-30 | 1 call per level |
| 2 | Day 31-60 | 1 call per level |
| ... | ... | ... |
| 12 | Day 331-365 | 1 call per level |

**Total API Calls for Historical Sync:**
- Campaigns: ~12 calls
- Ad Sets: ~12 calls
- Ads: ~12 calls
- **Total: ~36 calls** (spread over time with delays)

### 14.3 Incremental Daily Sync

#### Schedule
- **Frequency:** Once per day
- **Time:** 2:00 AM - 4:00 AM (low traffic hours)
- **Data Range:** Previous day only (yesterday)

#### Process Flow
```
1. Cron job triggers at 2:00 AM
2. For each connected account:
   a. Fetch yesterday's campaign data
   b. Fetch yesterday's ad set data
   c. Fetch yesterday's ad data
   d. Update/insert records in database
   e. Recalculate aggregated metrics
3. Log sync completion
```

#### API Calls Per Day
| Data Level | Calls | Notes |
|------------|-------|-------|
| Account Insights | 1 | Overall metrics |
| Campaigns | 1 | All campaigns, 1 day |
| Ad Sets | 1 | All ad sets, 1 day |
| Ads | 1 | All ads, 1 day |
| **Total** | **4 calls/account/day** | |

### 14.4 Data Storage Strategy

#### Local Database Tables
```sql
-- Store daily snapshots
CREATE TABLE campaign_daily_metrics (
  id SERIAL PRIMARY KEY,
  account_id INTEGER,
  campaign_id VARCHAR(50),
  date DATE,
  spend DECIMAL(10,2),
  revenue DECIMAL(10,2),
  sales INTEGER,
  leads INTEGER,
  impressions INTEGER,
  reach INTEGER,
  clicks INTEGER,
  frequency DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(account_id, campaign_id, date)
);

-- Similar tables for ad_set_daily_metrics, ad_daily_metrics
```

#### Aggregation Queries
Dashboard displays aggregated data from local database:
```sql
-- Example: Last 30 days campaign performance
SELECT
  campaign_id,
  SUM(spend) as total_spend,
  SUM(revenue) as total_revenue,
  SUM(sales) as total_sales,
  ROUND(SUM(revenue) / NULLIF(SUM(spend), 0), 2) as roas
FROM campaign_daily_metrics
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY campaign_id;
```

### 14.5 Sync Status Tracking

#### Account Sync Status Table
```sql
CREATE TABLE account_sync_status (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES ad_accounts(id),
  initial_sync_complete BOOLEAN DEFAULT FALSE,
  initial_sync_started_at TIMESTAMP,
  initial_sync_completed_at TIMESTAMP,
  last_daily_sync_at TIMESTAMP,
  last_sync_status ENUM('success', 'failed', 'in_progress'),
  last_sync_error TEXT,
  next_scheduled_sync TIMESTAMP,
  total_api_calls_today INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 14.6 Manual Refresh Behavior

When user clicks "Refresh" button:
- **Does NOT** trigger Facebook API call
- Refreshes data from local database
- Shows "Last synced: X hours ago" timestamp
- Option to force sync (admin only, with warning)

---

## 15. Rate Limiting & API Protection

### 15.1 Facebook API Rate Limits

#### Facebook's Official Limits
| Tier | Calls/Hour | Notes |
|------|------------|-------|
| Development | 200 | Testing only |
| Standard | 200 + 200*users | Per ad account |
| Marketing API | Based on spend | Higher for big spenders |

#### Our Conservative Limits (To Prevent Blocking)
| Operation | Max Calls | Period | Notes |
|-----------|-----------|--------|-------|
| Historical Sync | 5 | Per minute | With 15s delay between |
| Daily Sync | 10 | Per hour | Per account |
| Manual Sync | 1 | Per 15 minutes | Per account |
| Total Daily | 50 | Per day | Per account |

### 15.2 Rate Limiter Implementation

#### Redis-Based Rate Limiter
```javascript
// Rate limiter configuration
const rateLimits = {
  facebook_api: {
    // Per account limits
    per_minute: 5,
    per_hour: 20,
    per_day: 50,

    // Global limits (all accounts combined)
    global_per_minute: 10,
    global_per_hour: 100,
    global_per_day: 500
  }
};

// Check before each Facebook API call
async function canMakeFacebookApiCall(accountId) {
  const keys = {
    minute: `fb_rate:${accountId}:${getCurrentMinute()}`,
    hour: `fb_rate:${accountId}:${getCurrentHour()}`,
    day: `fb_rate:${accountId}:${getCurrentDay()}`,
    globalMinute: `fb_rate:global:${getCurrentMinute()}`,
    globalHour: `fb_rate:global:${getCurrentHour()}`,
    globalDay: `fb_rate:global:${getCurrentDay()}`
  };

  // Check all limits
  const [min, hour, day, gMin, gHour, gDay] = await redis.mget(Object.values(keys));

  if (min >= rateLimits.facebook_api.per_minute) return false;
  if (hour >= rateLimits.facebook_api.per_hour) return false;
  if (day >= rateLimits.facebook_api.per_day) return false;
  if (gMin >= rateLimits.facebook_api.global_per_minute) return false;
  if (gHour >= rateLimits.facebook_api.global_per_hour) return false;
  if (gDay >= rateLimits.facebook_api.global_per_day) return false;

  return true;
}
```

### 15.3 Request Queue System

#### Queue Architecture
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Sync Request   │────▶│   Redis Queue   │────▶│  Worker Process │
│  (API/Cron)     │     │  (Bull/BullMQ)  │     │  (Rate Limited) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  Facebook API   │
                                               │  (With Delays)  │
                                               └─────────────────┘
```

#### Queue Job Configuration
```javascript
// Bull queue configuration
const facebookSyncQueue = new Queue('facebook-sync', {
  limiter: {
    max: 5,           // Max 5 jobs
    duration: 60000   // Per minute
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000    // Start with 1 minute delay on retry
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
});

// Job processing with delay between calls
facebookSyncQueue.process(async (job) => {
  const { accountId, dataType, dateRange } = job.data;

  // Check rate limit before processing
  if (!await canMakeFacebookApiCall(accountId)) {
    throw new Error('Rate limit exceeded, will retry');
  }

  // Make API call
  const result = await fetchFacebookData(accountId, dataType, dateRange);

  // Increment rate counters
  await incrementRateCounters(accountId);

  // Add delay before next job can process
  await sleep(12000); // 12 second delay between calls

  return result;
});
```

### 15.4 Backoff Strategy

#### On Rate Limit Error (Error Code 17)
```javascript
const backoffStrategy = {
  initial_delay: 60,      // 1 minute
  multiplier: 2,          // Double each time
  max_delay: 3600,        // Max 1 hour
  max_retries: 5          // Then fail permanently
};

// Retry delays: 1min → 2min → 4min → 8min → 16min → fail
```

#### On Other Errors
| Error Type | Action |
|------------|--------|
| 429 Too Many Requests | Backoff + retry |
| 500 Server Error | Retry after 5 min |
| 401 Unauthorized | Refresh token, retry |
| 400 Bad Request | Log error, don't retry |

### 15.5 Dashboard API Rate Limits

#### Internal API Protection
| Endpoint Type | Limit | Period | Notes |
|---------------|-------|--------|-------|
| Dashboard Read | 100 | Per minute | Per user |
| Data Export | 10 | Per hour | Per user |
| Settings Write | 20 | Per minute | Per user |
| Webhook Test | 5 | Per minute | Per account |

#### Implementation
```javascript
// Express rate limiter middleware
const rateLimit = require('express-rate-limit');

const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: 'Too many requests, please try again later',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/dashboard', dashboardLimiter);
```

### 15.6 Monitoring & Alerts

#### Rate Limit Monitoring
```javascript
// Track and alert on rate limit usage
const monitorRateLimits = async () => {
  const usage = await getRateLimitUsage();

  // Alert if approaching limits
  if (usage.daily_percentage > 80) {
    await sendAlert({
      type: 'rate_limit_warning',
      message: `Facebook API usage at ${usage.daily_percentage}% of daily limit`,
      level: 'warning'
    });
  }

  if (usage.daily_percentage > 95) {
    await sendAlert({
      type: 'rate_limit_critical',
      message: 'Facebook API daily limit nearly exhausted',
      level: 'critical'
    });
  }
};
```

#### Rate Limit Dashboard (Admin)
Display in Settings:
- API calls used today: 35/50
- API calls this hour: 8/20
- Next scheduled sync: 2:00 AM
- Rate limit status: Healthy/Warning/Critical

### 15.7 Summary: API Call Budget

#### Per Account Per Day
| Sync Type | Calls | When |
|-----------|-------|------|
| Daily Incremental | 4 | 2:00 AM |
| Buffer for Retries | 6 | As needed |
| Manual Refresh | 0 | From DB only |
| **Total Reserved** | **10** | |
| **Safety Buffer** | **40** | For edge cases |

#### Total Daily Budget: 50 calls per account

This ensures:
- Account will never be blocked
- Sufficient buffer for errors/retries
- Room for occasional manual syncs by admin

---

**End of PRD Document**

*This document serves as the complete specification for backend development of the Facebook Ads Dashboard application.*
