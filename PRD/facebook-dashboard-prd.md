# Product Requirements Document (PRD)
# Facebook Ads Dashboard - Unified Analytics Platform

---

## 1. Executive Summary

### 1.1 Product Name
**Facebook Ads Dashboard** - A unified analytics platform for Facebook advertising performance tracking with real payment integration.

### 1.2 Problem Statement
Currently, the team manages **two separate dashboards**:
1. **Facebook Ads Manager** - For campaign/ad set/ad performance, pixel tracking, and country-wise spending
2. **Pabbly Subscription Billing Dashboard** - For actual sales and revenue tracking

**Key Pain Points:**
- Facebook Pixel doesn't capture all sales (e.g., 10 actual sales but pixel shows only 6)
- Manual effort to calculate true ROAS by combining data from both platforms
- No automated alerts for overspending campaigns/ad sets
- Inefficient workflow switching between dashboards

### 1.3 Solution
Build a **unified dashboard** that:
- Pulls Facebook Ads data via API
- Receives actual sales data from Pabbly via integration
- Calculates true ROAS based on real revenue
- Provides configurable alerts with Google Chat notifications
- Monitors pixel health status

---

## 2. Business Structure

### 2.1 Account Hierarchy
```
Facebook Business Account
├── Ad Account 1: Pabbly Connect
├── Ad Account 2: Pabbly Chatflow
└── Ad Account 3: PSB (Pabbly Subscription Billing)
```

### 2.2 Key Principle
- Each ad account = One product
- Each ad account gets its own dashboard section with separate:
  - Data APIs (Sales & Leads)
  - Webhook configurations
  - Alert thresholds
  - Pixel monitoring

---

## 3. Functional Requirements

### 3.1 Dashboard Views (Per Ad Account)

#### 3.1.1 Facebook Ads Data (From Facebook API)
| Metric | Source | Notes |
|--------|--------|-------|
| Campaigns | Facebook API | Exact replication |
| Ad Sets | Facebook API | Exact replication |
| Ads | Facebook API | Exact replication |
| Frequency | Facebook API | Exact replication |
| Ad Spend | Facebook API | Exact replication |
| Impressions | Facebook API | Exact replication |
| Clicks | Facebook API | Exact replication |
| CTR | Facebook API | Exact replication |

#### 3.1.2 Sales & Revenue Data (From Pabbly Integration)
| Metric | Source | Notes |
|--------|--------|-------|
| Total Sales Count | Pabbly API/Webhook | Actual sales |
| Revenue | Pabbly API/Webhook | Actual revenue |
| Country-wise Sales | Pabbly API/Webhook | Overrides Facebook country data |

#### 3.1.3 Leads Data (From CRM Integration)
| Metric | Source | Notes |
|--------|--------|-------|
| Lead Count | API Endpoint | Via integration |
| Lead Source | API Endpoint | Organic/Other sources |

#### 3.1.4 Calculated Metrics
| Metric | Formula |
|--------|---------|
| **ROAS** | Pabbly Revenue ÷ Facebook Ad Spend |
| **Cost per Lead (CPL)** | Facebook Ad Spend ÷ Total Leads |
| **Cost per Acquisition (CPA)** | Facebook Ad Spend ÷ Total Sales |

---

### 3.2 Data Entry Sections

#### 3.2.1 Sales Data Section
- **Table View**: Display all sales entries
- **Fields**: Date, Amount, Country, Product, Notes
- **Actions**: Add, Edit, Delete entries
- **API Endpoint**: `POST /api/{ad_account}/sales` for integration
- **Webhook Support**: Receive data from Pabbly Connect

#### 3.2.2 Leads Data Section
- **Table View**: Display all leads entries
- **Fields**: Date, Count, Source, Notes
- **Actions**: Add, Edit, Delete entries
- **API Endpoint**: `POST /api/{ad_account}/leads` for integration
- **Webhook Support**: Receive data from CRM

---

### 3.3 Alert System

#### 3.3.1 Alert Levels
Configurable thresholds at:
1. **Campaign Level**
2. **Ad Set Level**
3. **Ad Level**
4. **Country Level**
5. **Frequency Level**

#### 3.3.2 Alert Conditions
| Condition Type | Description |
|----------------|-------------|
| Spend Threshold + ROAS | Alert when spend ≥ threshold AND ROAS < target |
| ROAS Threshold | Alert when ROAS < X (e.g., below 1.0) after threshold reached |
| Frequency Threshold | Alert when frequency > X |
| Pixel Inactive | Alert when pixel is not active on landing page |

#### 3.3.3 Alert Trigger Logic (CRITICAL)

**Phase-Based Monitoring:**
```
Phase 1: PRE-THRESHOLD (No alerts)
├── Spend = $700, ROAS = 0 → NO ALERT (below threshold)
├── Wait until spend reaches configured threshold
└── Example: Threshold = $1,400

Phase 2: AT THRESHOLD (First evaluation)
├── Spend ≥ $1,400
├── Check: Is ROAS < 1.0 (or target)?
├── YES → ALERT triggered
└── NO → Continue monitoring

Phase 3: POST-THRESHOLD (Continuous monitoring)
├── Spend = $2,000, ROAS = 0.8 → ALERT
├── Spend = $3,500, ROAS = 0.6 → ALERT
└── Any time ROAS drops below threshold → ALERT
```

**Time Window**: **Lifetime Cumulative** (total spend/revenue since ad started, not rolling 30-day)

#### 3.3.4 Alert Configuration Example
```
Campaign: "Pabbly Connect - USA"
├── Spend Threshold: $1,400 (minimum spend before alerts)
│   └── Based on: 2x product price ($700 × 2)
├── ROAS Threshold: 1.0 (alert if below this)
├── Frequency Threshold: 2.0 (alert if above this)
├── Time Window: Lifetime cumulative
├── Conditions:
│   ├── If spend ≥ $1,400 AND ROAS < 1.0 → ALERT
│   └── If frequency > 2.0 → ALERT (ad fatigue warning)
└── Action: Send webhook to Google Chat + In-App notification
```

**Default Threshold Settings (Recommended):**
| Parameter | Recommended Value | Reasoning |
|-----------|------------------|-----------|
| Spend Threshold | 2x product price | Give ad fair chance before judging |
| ROAS Threshold | 1.0 | Below 1.0 = losing money |
| Frequency Threshold | 2.0 | Above 2.0 = audience fatigue |
| Budget Increase ROAS | 2.0 | Above 2.0 = scale opportunity |

#### 3.3.5 Alert Lifecycle & Resolution System

**Alert States:**
```
┌─────────────┐         ┌────────────┐
│   ACTIVE    │────────▶│  RESOLVED  │
│  (New alert)│         │  (Closed)  │
└─────────────┘         └────────────┘
       │                      ▲
       │    ┌──────────────┐  │
       └───▶│ AUTO-RESOLVED│──┘
            │(System closed)│
            └──────────────┘
```

**Alert Lifecycle Flow:**
```
1. TRIGGER: Spend ≥ Threshold AND ROAS < Target
       ↓
2. ALERT #1 sent (Google Chat + In-App)
       ↓
3. User marks as "Resolved" with:
   - Action taken (dropdown)
   - Comment (text)
       ↓
4. SYSTEM RE-CHECKS after 24 hours:
   │
   ├── Ad PAUSED or ROAS ≥ Target
   │   └── ✅ Issue truly resolved, no further alerts
   │
   └── Ad STILL RUNNING and ROAS < Target
       └── 🚨 ALERT #2 sent ("Issue persists - Alert #2")
              ↓
       5. Cycle repeats (Alert #3, #4...) every 24 hours
          until issue is truly resolved
```

#### 3.3.6 Alert Resolution Form
```
┌─────────────────────────────────────────────┐
│ Resolve Alert                               │
├─────────────────────────────────────────────┤
│ Action Taken: [Dropdown]                    │
│   ○ Paused the ad/campaign                 │
│   ○ Reduced budget                          │
│   ○ Changed targeting                       │
│   ○ Changed creative                        │
│   ○ No action needed (monitoring)           │
│   ○ Other                                   │
│                                             │
│ Comment: [________________________________] │
│          [________________________________] │
│                                             │
│ [Mark as Resolved]                          │
└─────────────────────────────────────────────┘
```

#### 3.3.7 Auto-Resolution Conditions
Alert automatically resolves (no user action needed) when:
- Ad/Campaign/Ad Set is **paused** → "Auto-resolved: Ad paused"
- ROAS **improves** above threshold → "Auto-resolved: ROAS improved to X.XX"

#### 3.3.8 Alert History & Tracking
- All alerts stored with full history
- Trackable data:
  - Alert number (#1, #2, #3...)
  - When triggered
  - Who resolved
  - What action was taken
  - Resolution comment
  - Time to resolution
- Dashboard shows: Active alerts, Resolved today, Recurring alerts

#### 3.3.9 Notification Channel
- **Google Chat Webhook**: Send alerts to internal team group
- Webhook URL configurable per ad account
- Alert message includes:
  - Alert number (e.g., "Alert #2 - Issue Persists")
  - Campaign/Ad Set/Ad name
  - Current spend (lifetime)
  - Current revenue (lifetime)
  - Current ROAS
  - Threshold values
  - Previous resolution action (if recurring)

---

### 3.4 Positive Alerts (Budget Increase Recommendations)

#### 3.4.1 Purpose
When campaigns are performing well, proactively notify the team to increase budget and scale successful ads. This helps maximize revenue from high-performing campaigns.

#### 3.4.2 Trigger Conditions
| Condition | Description |
|-----------|-------------|
| **High ROAS** | Campaign/Ad Set ROAS exceeds configurable target (e.g., > 2.0) |
| **Best Performer** | Identify the highest ROAS campaign among all active campaigns |
| **Spend Threshold Met** | Only recommend after minimum spend (e.g., $500) to ensure data reliability |

#### 3.4.3 Configuration
```
Budget Increase Alert Settings:
├── ROAS Target: [Configurable] (default: 2.0)
├── Minimum Spend: $500 (before recommendations)
├── Minimum Duration: 3 days running
└── Notification: Google Chat + In-App
```

#### 3.4.4 Recommendation Logic
```
Daily Analysis:
├── Calculate ROAS for all active campaigns
├── Identify BEST PERFORMER (highest ROAS)
├── Compare to other campaigns
│
└── If Best Performer ROAS > Target (e.g., 2.0):
    └── Send Notification:
        "Campaign A is your best performer with ROAS 2.5
         Consider increasing budget from $1,000 to $1,500"
```

#### 3.4.5 Sample Notification (Google Chat)
```
📈 OPPORTUNITY: Budget Increase Recommended

Ad Account: Pabbly Connect
Best Performer: Campaign "USA - Lifetime Deal"

📊 Performance (Last 30 Days):
• ROAS: 2.5 ⭐ (Target: 2.0)
• Spend: $2,000
• Revenue: $5,000
• Sales: 7

💡 Recommendation:
Consider increasing daily budget by 20-30%
Current: $100/day → Suggested: $130/day

📉 Underperformers for reference:
• Campaign B: ROAS 0.8 (consider pausing)
• Campaign C: ROAS 1.2 (monitor)
```

#### 3.4.6 Budget Reallocation Suggestions
When multiple campaigns exist:
- Show which campaign is performing best
- Suggest shifting budget FROM low ROAS TO high ROAS campaigns
- Example: "Shift $500 from Campaign B (ROAS 0.8) to Campaign A (ROAS 2.5)"

---

### 3.5 Knowledge Base & SOP Integration

#### 3.5.1 Purpose
Provide guidance for new team members who may not know how to run ads. Built-in documentation helps maintain best practices and reduces onboarding time.

#### 3.5.2 Components

**1. Info Tooltips ("i" buttons)**
- Small info icons next to every configurable parameter
- Hover/click to see explanation
- Example placements:
  - Next to "Spend Threshold" → "Set this to 2x your product price. For $700 product, set $1,400"
  - Next to "ROAS Threshold" → "ROAS below 1.0 means you're losing money. Target at least 1.5+"
  - Next to "Frequency" → "Keep below 2.0. Higher frequency = ad fatigue"

**2. Dedicated Help Page**
```
Help & Documentation
├── Getting Started
│   ├── How to connect Facebook account
│   ├── Understanding the dashboard
│   └── Setting up your first alert
│
├── Best Practices (SOP)
│   ├── Recommended threshold settings
│   ├── When to pause an ad
│   ├── When to increase budget
│   ├── Frequency management
│   └── Country targeting tips
│
├── Alert Guidelines
│   ├── What each alert means
│   ├── Recommended actions per alert type
│   └── Resolution best practices
│
└── Glossary
    ├── ROAS, CPL, CPA definitions
    ├── Frequency explained
    └── Attribution explained
```

#### 3.5.3 SOP Content Examples

**When to Pause an Ad:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🛑 WHEN TO PAUSE AN AD                                      │
├─────────────────────────────────────────────────────────────┤
│ PAUSE immediately if:                                       │
│ • Spend > 2x product price with ZERO sales                 │
│   (e.g., $1,400+ spent for $700 product, 0 sales)          │
│                                                             │
│ • ROAS < 0.5 after significant spend ($500+)               │
│                                                             │
│ • Frequency > 3.0 (audience is seeing ad too often)        │
│                                                             │
│ • Multiple alerts triggered for same ad (Alert #3+)        │
└─────────────────────────────────────────────────────────────┘
```

**When to Increase Budget:**
```
┌─────────────────────────────────────────────────────────────┐
│ 📈 WHEN TO INCREASE BUDGET                                  │
├─────────────────────────────────────────────────────────────┤
│ INCREASE budget if:                                         │
│ • ROAS > 2.0 consistently for 3+ days                      │
│                                                             │
│ • Campaign is your best performer among all active         │
│                                                             │
│ • Frequency < 2.0 (room to show ad to more people)         │
│                                                             │
│ HOW MUCH to increase:                                       │
│ • Safe: 20% increase every 3-5 days                        │
│ • Aggressive: 30-50% if ROAS > 3.0                         │
│                                                             │
│ ⚠️ Never increase budget for underperforming ads!          │
└─────────────────────────────────────────────────────────────┘
```

**Frequency Guidelines:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔄 FREQUENCY GUIDELINES                                     │
├─────────────────────────────────────────────────────────────┤
│ Frequency = How many times same person sees your ad        │
│                                                             │
│ • 1.0 - 1.5: Excellent (fresh audience)                    │
│ • 1.5 - 2.0: Good (healthy reach)                          │
│ • 2.0 - 2.5: Warning (consider new creative)               │
│ • 2.5 - 3.0: High (audience fatigue starting)              │
│ • 3.0+: Critical (pause or refresh creative)               │
│                                                             │
│ ACTION when frequency > 2.0:                                │
│ 1. Create new ad creative (different image/video)          │
│ 2. Expand audience targeting                                │
│ 3. If both fail, pause and restart after 2 weeks           │
└─────────────────────────────────────────────────────────────┘
```

#### 3.5.4 Contextual Help
- When alert triggers, show relevant SOP section
- Example: Frequency alert → Link to "Frequency Guidelines"
- Example: Low ROAS alert → Link to "When to Pause an Ad"

#### 3.5.5 New User Onboarding
- First-time login shows welcome modal
- Quick tour of key features (optional, can skip)
- Checklist: "Set up your first threshold" → "Connect ad account" → "Configure webhook"

---

### 3.6 Real-Time Sale Notifications

#### 3.4.1 Purpose
When a sale is captured, notify the team (especially designers) that a specific ad has generated a sale. This motivates designers by showing their creative work is performing well.

#### 3.4.2 Notification Channels
| Channel | Description |
|---------|-------------|
| **In-App Notifications** | Bell icon with notification panel in dashboard |
| **Google Chat Webhook** | Real-time message to team group |

#### 3.4.3 Notification Content
```
🎉 NEW SALE GENERATED!

Ad Account: Pabbly Connect
Campaign: "USA - Lifetime Deal"
Ad Set: "Interests - Tech"
Ad Name: "Video Ad - Feature Showcase"

💰 Sale Amount: $700
🌍 Country: United States

Designer Credit: [Ad Creative Performed Well!]
```

#### 3.4.4 In-App Notification Panel
- **Location**: Top-right bell icon in header
- **Features**:
  - Real-time updates (WebSocket/SSE)
  - Unread count badge
  - Click to view sale details
  - Mark as read/Mark all as read
  - Filter by ad account
- **Retention**: Last 100 notifications or 30 days

---

### 3.7 Ad Creative Preview (Image on Hover)

#### 3.5.1 Functionality
- When user hovers over an ad name in the dashboard, show the ad creative (image/video thumbnail)
- Display in a tooltip/popover format
- Show: Image, Ad Name, Ad ID, Creation Date

#### 3.5.2 CRITICAL: Facebook API Rate Limiting Strategy

**Priority: Account Safety First**

Facebook has strict rate limits. Exceeding them can result in temporary blocks or permanent bans. We implement a **conservative caching strategy**:

| Strategy | Implementation |
|----------|----------------|
| **Pre-fetch on Sync** | Fetch ad creatives during regular 15-30 min sync (NOT on hover) |
| **Local Cache** | Store images in database/CDN, never fetch on-demand |
| **Rate Limit Buffer** | Use only 50% of allowed API quota |
| **Batch Requests** | Combine multiple ad creative requests into single batch calls |
| **Stale Data Acceptable** | Creatives update only every 6-12 hours (not real-time) |

#### 3.5.3 API Rate Limit Configuration
```
Facebook Marketing API Limits (approximate):
- Standard: ~200 calls per hour per ad account
- Our usage: MAX 100 calls per hour (50% safety buffer)

Implementation:
├── Sync Frequency: Every 30 minutes (not 15)
├── Creatives Sync: Every 6 hours only
├── Batch Size: Max 50 ads per request
├── Retry Strategy: Exponential backoff (1min, 5min, 15min, 1hr)
└── Circuit Breaker: Stop all calls if rate limit warning received
```

#### 3.5.4 Creative Storage
- Download and store ad images locally (database BLOB or cloud storage like S3)
- Serve from local storage, NOT from Facebook CDN on each hover
- This eliminates API calls during user interaction

#### 3.5.5 Fallback Behavior
- If image not cached: Show placeholder with "Image loading..."
- If image fetch fails: Show generic ad icon
- Never block UI waiting for Facebook API

---

### 3.8 Pixel Health Monitoring

#### 3.6.1 Functionality
- Check pixel status every **1 hour**
- Verify pixel is active on designated landing pages
- Each ad account has its own pixel configuration

#### 3.6.2 Alerts
- Send notification if pixel becomes inactive
- Dashboard indicator showing pixel status (Active/Inactive)
- Last checked timestamp

---

### 3.9 Filters & Time Range

#### 3.7.1 Ad Status Filter
| Filter Option | Description |
|---------------|-------------|
| **Active** (Default) | Show only active campaigns/ad sets/ads |
| **Paused** | Show only paused items |
| **All** | Show both active and paused |

- Default view: **Active ads only**
- Filter available at Campaign, Ad Set, and Ad levels
- Filter state persists during session

#### 3.7.2 Time Range - 30 Days Default
**All data and metrics displayed based on 30-day window by default**

| Time Range Options | Description |
|-------------------|-------------|
| **Last 30 Days** (Default) | Primary decision-making window |
| Last 7 Days | Quick recent performance check |
| Last 14 Days | Two-week trend analysis |
| Last 60 Days | Extended trend analysis |
| Last 90 Days | Quarterly view |
| Custom Range | User-defined date range |

**Why 30 Days?**
- Avoid knee-jerk reactions to daily fluctuations
- Get statistically meaningful data for decisions
- Alerts and thresholds evaluated on 30-day spend/ROAS
- Example: An ad showing good ROAS on Day 1 shouldn't trigger action - wait for 30-day data

#### 3.7.3 Alert Evaluation Period
- All alert thresholds (spend, ROAS) evaluated on **30-day rolling window**
- Prevents false alerts from daily variations
- Example: Spend threshold of $1,400 means $1,400 spent in last 30 days, not today

---

### 3.10 Sorting & Table Controls

#### 3.8.1 Sorting Feature
All tables support sorting by clicking column headers:

| Table | Sortable Columns |
|-------|-----------------|
| **Campaigns** | Spend, Sales, Revenue, ROAS, Frequency, Impressions, Clicks |
| **Ad Sets** | Spend, Sales, Revenue, ROAS, Frequency, Impressions, Clicks |
| **Ads** | Spend, Sales, Revenue, ROAS, Frequency, Impressions, Clicks |
| **Countries** | Spend, Sales, Revenue, ROAS |
| **Frequency** | Frequency value, Impressions, Reach |

**Sort Options:**
- Click column header once → Sort Highest to Lowest (Descending)
- Click again → Sort Lowest to Highest (Ascending)
- Visual indicator (↑↓) shows current sort direction

---

### 3.11 ROAS Calculation Logic (CRITICAL)

**Three Different ROAS Calculations Based on Context:**

#### 3.9.1 Overview ROAS (Top Metrics Cards)
```
Overview ROAS = Total Pabbly Revenue ÷ Total Facebook Ad Spend
```
| Data Point | Source |
|------------|--------|
| Revenue | Pabbly Subscription Billing (actual sales) |
| Ad Spend | Facebook Marketing API |

**Purpose**: Shows TRUE business ROAS - actual money received vs money spent on ads.

**Example**:
- Pabbly shows: $7,000 total revenue (10 sales × $700)
- Facebook spent: $5,000 total ad spend
- **Overview ROAS = 1.4**

---

#### 3.9.2 Campaign / Ad Set / Ad ROAS (Performance Tables)
```
Table ROAS = Facebook Attributed Revenue ÷ Facebook Ad Spend
```
| Data Point | Source |
|------------|--------|
| Revenue | Facebook Pixel Attribution (exactly as FB reports) |
| Sales Count | Facebook Pixel Attribution (exactly as FB reports) |
| Ad Spend | Facebook Marketing API |

**Purpose**: Use Facebook's attribution for optimization decisions. Shows what Facebook thinks is working.

**IMPORTANT**: Do NOT modify Facebook data with Pabbly data in these tables.

**Example**:
- Facebook shows Campaign A: Revenue $3,000, Spend $2,000
- **Campaign ROAS = 1.5** (as Facebook calculates it)
- Even if Pabbly has different numbers, show Facebook's numbers here

---

#### 3.9.3 Country ROAS (Country Section)
```
Country ROAS = Pabbly Revenue (by country) ÷ Facebook Spend (by country)
```
| Data Point | Source |
|------------|--------|
| Revenue | Pabbly Subscription Billing (actual sales by country) |
| Sales Count | Pabbly Subscription Billing (actual count by country) |
| Ad Spend | Facebook Marketing API (spend by country) |

**Purpose**: Shows actual performance by country. Uses Pabbly because pixel misses sales but we know real country from payment data.

**Example**:
- USA: Pabbly shows $1,500 revenue, Facebook spent $1,000
- **USA ROAS = 1.5** (based on actual Pabbly sales)
- Even if Facebook shows only $500 revenue for USA, use Pabbly's $1,500

---

#### 3.9.4 Summary Table

| Section | Revenue Source | Spend Source | Use Case |
|---------|---------------|--------------|----------|
| **Overview Cards** | Pabbly (actual) | Facebook | True business ROAS |
| **Campaigns Table** | Facebook (pixel) | Facebook | Campaign optimization |
| **Ad Sets Table** | Facebook (pixel) | Facebook | Ad set optimization |
| **Ads Table** | Facebook (pixel) | Facebook | Ad creative optimization |
| **Country Section** | Pabbly (actual) | Facebook | Geographic performance |

---

### 3.12 Data Display Logic

#### 3.10.1 Facebook Data (Exact Replication)
The following data should be displayed **exactly as Facebook reports** in Campaign/Ad Set/Ad tables:
- Campaign performance metrics
- Ad Set performance metrics
- Ad performance metrics
- Frequency data
- Ad spend data
- **Revenue and Sales attribution** (do not modify with Pabbly data)

#### 3.10.2 Country Data (From Pabbly)
- **Override Facebook's country attribution** in Country section only
- Use actual country from Pabbly sales data
- Example: If Pabbly shows 4 USA sales but Facebook shows 2, display **4 USA sales** in Country section

---

## 4. User Management

### 4.1 Roles & Permissions

| Role | View Dashboard | Edit Data | Configure Alerts | Manage Users | Access Settings |
|------|---------------|-----------|------------------|--------------|-----------------|
| Admin | All | All | All | Yes | Yes |
| Manager | Assigned | Assigned | Assigned | No | No |
| Viewer | Assigned | No | No | No | No |

### 4.2 Ad Account Access Control
- Users can be restricted to specific ad accounts
- Example: User A → Only Pabbly Connect dashboard
- Example: User B → Pabbly Connect + Pabbly Chatflow

---

## 5. Technical Requirements

### 5.1 Technology Stack (Recommended)
| Component | Technology | Reason |
|-----------|------------|--------|
| Frontend | Next.js 14 (React) | Modern, fast, SSR support |
| Backend | Next.js API Routes | Unified codebase |
| Database | PostgreSQL | Robust, relational data |
| ORM | Prisma | Type-safe database access |
| Authentication | NextAuth.js | Flexible auth solution |
| Charts | Recharts / Chart.js | Data visualization |
| Hosting | Vercel / AWS | Auto-scaling, reliable |

### 5.2 External Integrations

#### 5.2.1 Facebook Marketing API
- **Purpose**: Fetch campaigns, ad sets, ads, metrics
- **Authentication**: OAuth 2.0 with Facebook Login
- **Sync Frequency**: Every 30 minutes (configurable)

#### 5.2.2 Pabbly Subscription Billing
- **Webhook**: Receive real-time sale notifications
- **API**: Fetch historical sales data
- **Data**: Amount, country, date, product

#### 5.2.3 Google Chat Webhook
- **Purpose**: Send alert notifications
- **Format**: Incoming webhook URL per ad account

### 5.3 API Endpoints

#### Public APIs (For Integrations)
```
POST /api/v1/{ad_account_id}/sales     - Add sale entry
POST /api/v1/{ad_account_id}/leads     - Add lead entry
POST /api/v1/webhook/pabbly            - Pabbly webhook receiver
```

#### Internal APIs
```
GET  /api/v1/dashboard/{ad_account_id} - Get dashboard data
GET  /api/v1/campaigns/{ad_account_id} - Get campaigns list
GET  /api/v1/alerts/{ad_account_id}    - Get alert configurations
POST /api/v1/alerts/{ad_account_id}    - Create/Update alert
```

### 5.4 Data Sync Schedule
| Data Type | Frequency | Method |
|-----------|-----------|--------|
| Facebook Ads Data | Every 30 min | Cron job + Facebook API |
| Ad Creatives/Images | Every 6 hours | Batch fetch + Local storage |
| Sales Data | Real-time | Webhook + API |
| Leads Data | Real-time | Webhook + API |
| Pixel Health | Every 1 hour | Cron job + Page check |

### 5.5 Facebook API Rate Limiting (Critical)

**Account Safety is Priority #1**

| Protection Layer | Implementation |
|-----------------|----------------|
| **50% Quota Buffer** | Never exceed 50% of allowed API calls |
| **Exponential Backoff** | On rate limit warning: wait 1min → 5min → 15min → 1hr |
| **Circuit Breaker** | If rate limit error received, pause ALL calls for 1 hour |
| **Request Batching** | Combine up to 50 items per batch request |
| **Local Caching** | Store all data locally, never fetch on-demand |
| **Stale Data OK** | Accept 30-min old data rather than risk rate limit |

```
Safe API Usage Pattern:
├── Metrics Sync: Every 30 min (not 15)
├── Creatives Sync: Every 6 hours only
├── Max Calls: 100/hour per ad account (50% of ~200 limit)
├── Batch Size: 50 ads max per request
└── On Rate Limit Warning: STOP immediately, wait 1 hour
```

---

## 6. Dashboard UI Sections

### 6.1 Main Navigation
```
├── Dashboard (Per Ad Account)
│   ├── Pabbly Connect
│   ├── Pabbly Chatflow
│   └── PSB
├── Notifications (Bell Icon - Top Right)
│   └── Real-time sale alerts + Budget recommendations
├── Alerts
│   ├── Active Alerts
│   ├── Resolved Alerts
│   └── Alert History
├── Settings
│   ├── Facebook Connection
│   ├── Webhook Configuration
│   ├── Alert Thresholds
│   ├── Budget Recommendation Settings
│   └── User Management
├── Data Management
│   ├── Sales Data
│   └── Leads Data
└── Help & Documentation (? icon)
    ├── Getting Started
    ├── Best Practices (SOP)
    ├── Alert Guidelines
    └── Glossary
```

**Info Tooltips ("i" icons):**
- Present on all configurable parameters
- Hover to see explanation and recommended values
- Links to relevant Help section

### 6.2 Dashboard Page Layout

#### Filter Bar (Top)
```
┌─────────────────────────────────────────────────────────────┐
│ Status: [Active ▼]  │  Time Range: [Last 30 Days ▼]  │ 🔄  │
└─────────────────────────────────────────────────────────────┘
```
- **Status Filter**: Active (default) / Paused / All
- **Time Range**: Last 30 Days (default) / 7 / 14 / 60 / 90 / Custom
- **Refresh Button**: Manual data refresh

#### Top Section - Key Metrics Cards (30-Day Data)
- Total Ad Spend (Last 30 Days)
- Total Revenue (From Pabbly - Last 30 Days)
- ROAS (30-Day)
- Total Leads (Last 30 Days)
- Cost per Lead (30-Day)
- Pixel Status (Active/Inactive)

#### Middle Section - Performance Tables (Facebook Data - Sortable)
- **Campaigns Table**: Name, Spend, Sales (Facebook), Revenue, ROAS, Frequency, Status
- **Ad Sets Table**: Name, Campaign, Spend, Sales, Revenue, ROAS, Actions
- **Ads Table**: Name, Ad Set, Spend, Sales, Revenue, ROAS, Actions (hover for image)

*Note: Data and ROAS from Facebook pixel attribution.*

#### Bottom Section - Country Performance (Pabbly Data - Sortable)
- Country-wise breakdown (Sales & Revenue from Pabbly)
- Columns: Country, Sales Count, Revenue, Ad Spend, ROAS
- ROAS calculated: Pabbly Revenue ÷ Facebook Spend per country

#### Charts Section
- Spend vs Revenue over time
- ROAS trend graph
- Leads trend graph
- Country distribution pie chart

---

## 7. Alert Configuration UI

### 7.1 Alert Creation Form
```
┌─────────────────────────────────────────────┐
│ Create New Alert                            │
├─────────────────────────────────────────────┤
│ Level: [Campaign ▼] [Ad Set ▼] [Ad ▼]      │
│        [Country ▼] [Frequency ▼]            │
│                                             │
│ Select: [Dropdown with items]               │
│                                             │
│ Conditions:                                 │
│ ☑ Spend exceeds: [$____]                   │
│ ☑ ROAS below: [____]                       │
│ ☑ Sales equal to: [0]                      │
│ ☑ Frequency above: [____]                  │
│                                             │
│ Notify via:                                 │
│ ☑ Google Chat Webhook                      │
│                                             │
│ [Save Alert]                                │
└─────────────────────────────────────────────┘
```

---

## 8. Data Import Requirements

### 8.1 Historical Data
- Import **last 3-6 months** of data
- Sources:
  - Facebook Ads: Campaign history, spend, metrics
  - Pabbly: Sales history with country data

### 8.2 Data Migration Steps
1. Connect Facebook Business Account
2. Select Ad Accounts to import
3. Specify date range (3-6 months)
4. Import Facebook campaign data
5. Import Pabbly sales data via API
6. Map sales to appropriate ad accounts

---

## 9. Security Requirements

### 9.1 Authentication
- Email/Password login
- Optional: Google OAuth
- Session-based authentication

### 9.2 Authorization
- Role-based access control (RBAC)
- Ad account level permissions

### 9.3 API Security
- API keys for external integrations
- Rate limiting on public endpoints
- HTTPS only

### 9.4 Data Protection
- Encrypted database connections
- No storage of Facebook access tokens (use refresh flow)
- Audit logs for data modifications

---

## 10. Success Metrics

### 10.1 Primary Goals
1. **Single Dashboard**: All data accessible in one place
2. **Accurate ROAS**: Based on actual Pabbly sales
3. **Proactive Alerts**: Notify before significant overspend
4. **Time Saved**: Reduce manual data correlation effort

### 10.2 Key Performance Indicators
- Dashboard load time < 3 seconds
- Data sync accuracy: 99.9%
- Alert delivery latency < 1 minute
- System uptime: 99.5%

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Project setup (Next.js, PostgreSQL, Prisma)
- [ ] User authentication system
- [ ] Database schema design
- [ ] Basic UI layout and navigation

### Phase 2: Facebook Integration (Week 3-4)
- [ ] Facebook OAuth integration
- [ ] Facebook Marketing API connection
- [ ] Campaign/Ad Set/Ad data fetching
- [ ] Data sync scheduler (30 min)

### Phase 3: Data Management (Week 5-6)
- [ ] Sales data section (CRUD + API)
- [ ] Leads data section (CRUD + API)
- [ ] Pabbly webhook receiver
- [ ] Historical data import

### Phase 4: Dashboard & Analytics (Week 7-8)
- [ ] Dashboard UI with key metrics
- [ ] ROAS & CPL calculations
- [ ] Performance tables
- [ ] Charts and visualizations
- [ ] Country-wise breakdown (Pabbly data)
- [ ] Ad creative preview on hover (with local caching)

### Phase 5: Alert & Notification System (Week 9-10)
- [ ] Alert configuration UI
- [ ] Threshold monitoring engine
- [ ] Google Chat webhook integration (alerts)
- [ ] Pixel health monitoring
- [ ] Real-time sale notifications (in-app + webhook)
- [ ] Notification panel UI (bell icon)
- [ ] WebSocket/SSE for real-time updates

### Phase 6: Polish & Launch (Week 11-12)
- [ ] User management & roles
- [ ] Facebook API rate limiting safeguards
- [ ] Testing & bug fixes
- [ ] Documentation
- [ ] Deployment to production

---

## 12. Project Structure

```
facebook-dashboard/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Auth pages
│   │   ├── (dashboard)/       # Dashboard pages
│   │   ├── api/               # API routes
│   │   └── layout.tsx
│   ├── components/            # React components
│   │   ├── dashboard/
│   │   ├── alerts/
│   │   ├── data/
│   │   └── ui/
│   ├── lib/                   # Utilities
│   │   ├── facebook.ts       # Facebook API client
│   │   ├── pabbly.ts         # Pabbly integration
│   │   ├── alerts.ts         # Alert engine
│   │   └── db.ts             # Database client
│   └── types/                 # TypeScript types
├── prisma/
│   └── schema.prisma          # Database schema
├── public/
└── package.json
```

---

## 13. Verification & Testing Plan

### 13.1 Testing Checklist
- [ ] Facebook OAuth flow works correctly
- [ ] Campaign data syncs every 30 minutes
- [ ] Sales API endpoint receives data correctly
- [ ] Leads API endpoint receives data correctly
- [ ] **Overview ROAS** calculates correctly (Pabbly Revenue / FB Spend)
- [ ] **Campaign/Ad Set/Ad ROAS** shows Facebook's exact data (not modified)
- [ ] **Country ROAS** calculates correctly (Pabbly Revenue / FB Spend per country)
- [ ] Country sales count shows from Pabbly (not Facebook)
- [ ] Alerts trigger when thresholds exceeded
- [ ] Google Chat receives webhook notifications
- [ ] Pixel health check runs hourly
- [ ] Role-based access works correctly
- [ ] Data can be edited/deleted manually
- [ ] Ad creative images display on hover
- [ ] Real-time sale notifications appear in notification panel
- [ ] Sale notifications sent to Google Chat with ad attribution
- [ ] API rate limiting stays within safe limits (50% of quota)
- [ ] **Sorting works** on all tables (Campaigns, Ad Sets, Ads, Countries)
- [ ] Sort toggles between ascending and descending on column click

### 13.2 Integration Testing
- [ ] End-to-end: Add sale via API → See in dashboard → ROAS updates
- [ ] End-to-end: Add sale via API → Notification appears → Google Chat receives sale message with ad info
- [ ] End-to-end: Spend exceeds threshold → Alert triggers → Google Chat receives message
- [ ] End-to-end: Pixel goes inactive → Alert triggers within 1 hour
- [ ] Rate limit test: Verify API calls never exceed 100/hour per ad account

---

## 14. Open Questions / Decisions Needed

1. **Domain Name**: What domain will host this application?
2. **Facebook App**: Do you have a Facebook Developer App created, or should we create one?
3. **Pabbly API Access**: Do you have Pabbly API credentials ready?
4. **Google Chat Webhook**: Is the webhook URL already configured?
5. **Hosting Budget**: Any constraints on hosting costs?

---

## 15. Appendix

### 15.1 Sample Alert Message (Google Chat) - First Alert
```
🚨 ALERT #1: Low ROAS Detected

Ad Account: Pabbly Connect
Level: Campaign
Name: "USA - Lifetime Deal"

📊 Lifetime Performance:
• Total Spend: $1,523.45
• Total Revenue: $0
• ROAS: 0.00

⚠️ Threshold Breached:
• Spend Threshold: $1,400 ✓ (exceeded)
• ROAS Threshold: 1.0 ✗ (below target)

Action Required: Review and optimize campaign.
```

### 15.2 Sample Alert Message (Google Chat) - Recurring Alert
```
🚨 ALERT #2: Issue Persists (24 hours later)

Ad Account: Pabbly Connect
Level: Campaign
Name: "USA - Lifetime Deal"

📊 Lifetime Performance:
• Total Spend: $1,847.20 (+$323.75 since last alert)
• Total Revenue: $0
• ROAS: 0.00

⚠️ Previous Resolution:
• Action: "Changed targeting"
• Comment: "Narrowed audience to tech professionals"
• Resolved by: John Doe
• When: Jan 23, 2026 - 4:30 PM

❌ Issue still persists after 24 hours.
Action Required: Consider pausing this campaign.
```

### 15.3 Sample Budget Increase Notification (Google Chat)
```
📈 OPPORTUNITY: Budget Increase Recommended

Ad Account: Pabbly Connect
Best Performer: Campaign "USA - Lifetime Deal"

📊 Performance (Lifetime):
• ROAS: 2.5 ⭐ (Target: 2.0)
• Spend: $3,200
• Revenue: $8,000
• Sales: 11

💡 Recommendation:
Consider increasing daily budget by 20-30%
Current: $150/day → Suggested: $195/day

📉 Comparison with other campaigns:
• Campaign B: ROAS 0.8 ⚠️ (consider pausing)
• Campaign C: ROAS 1.3 (monitor)

💰 Potential: Increasing budget could generate ~$1,500 more revenue
```

### 15.4 Sample Sale Notification (Google Chat) - Designer Motivation
```
🎉 NEW SALE GENERATED!

━━━━━━━━━━━━━━━━━━━━━━━━━━
Ad Account: Pabbly Connect
Campaign: "USA - Lifetime Deal"
Ad Set: "Interests - Tech Entrepreneurs"
Ad Name: "Video Ad v3 - Feature Demo"
━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Sale Amount: $700
🌍 Country: United States
📅 Time: Jan 24, 2026 - 3:45 PM

🎨 Great job team! This ad creative is performing well!
```

### 15.5 Data Flow Diagram
```
┌──────────────┐     ┌──────────────────────┐     ┌─────────────┐
│   Facebook   │────▶│  Facebook Dashboard  │────▶│  Database   │
│  Marketing   │     │      (Next.js)       │     │ (PostgreSQL)│
│     API      │     │                      │     │             │
└──────────────┘     │  ┌────────────────┐  │     └─────────────┘
                     │  │ Sync Scheduler │  │           │
┌──────────────┐     │  │   (30 min)     │  │           │
│    Pabbly    │────▶│  └────────────────┘  │           ▼
│   Webhook    │     │                      │     ┌─────────────┐
└──────────────┘     │  ┌────────────────┐  │     │ Local Image │
                     │  │ Alert Engine   │  │     │   Storage   │
┌──────────────┐     │  └────────────────┘  │     └─────────────┘
│  Leads API   │────▶│                      │
│  (CRM Data)  │     │  ┌────────────────┐  │     ┌─────────────┐
└──────────────┘     │  │ Notification   │──┼────▶│ Google Chat │
                     │  │ Engine         │  │     │  (Alerts +  │
                     │  └────────────────┘  │     │   Sales)    │
                     └──────────────────────┘     └─────────────┘
```

---

**Document Version**: 1.0
**Created**: January 24, 2026
**Status**: Approved
