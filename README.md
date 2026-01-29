# Facebook Ads Dashboard

A comprehensive dashboard for tracking Facebook Ads performance with real-time metrics, campaign management, and revenue tracking.

## Features

- **Quick Performance Snapshot**: Total spend, revenue, ROAS, leads, sales
- **Campaign/Ad Set/Ad Management**: View and filter by status (Active/Paused)
- **Country Performance**: Breakdown of metrics by country
- **Sales by Ad Creative**: Track revenue by ad
- **Data Management**: Add revenue and leads data locally
- **Automated Sync**: Daily sync from Facebook API to local database

## Tech Stack

- **Frontend**: Single HTML file with vanilla JavaScript
- **Backend**: Node.js + Express.js
- **Database**: SQLite (better-sqlite3)
- **API**: Facebook Marketing API v21.0

## Setup Instructions

### Prerequisites

- Node.js v18 or higher
- npm
- Facebook Developer Account with Marketing API access

### 1. Clone the Repository

```bash
git clone https://github.com/Pro-Dev-Nimesh/facebook_add_dashboard_by_Nimesh.git
cd facebook_add_dashboard_by_Nimesh
```

### 2. Backend Setup

```bash
cd backend
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your-secure-jwt-secret-key
JWT_EXPIRES_IN=7d
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_ACCESS_TOKEN=your-facebook-access-token
FRONTEND_URL=http://localhost:5500
```

### 4. Start the Backend

```bash
npm start
```

The server will run on http://localhost:3001

### 5. Open the Frontend

Open `index.html` in a browser or use Live Server extension in VS Code.

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/signup` - Register
- `GET /api/auth/me` - Get current user

### Facebook Data (from local database)
- `GET /api/fb/accounts` - Get ad accounts
- `GET /api/fb/campaigns/:accountId` - Get campaigns
- `GET /api/fb/adsets/:accountId` - Get ad sets
- `GET /api/fb/ads/:accountId` - Get ads
- `GET /api/fb/insights/:accountId` - Get insights
- `GET /api/fb/countries/:accountId` - Get country data
- `GET /api/fb/sales/:accountId` - Get sales data

### Sync
- `POST /api/sync/:accountId` - Trigger full sync
- `POST /api/sync/:accountId/campaigns` - Sync campaigns only
- `POST /api/sync/:accountId/adsets` - Sync ad sets only
- `POST /api/sync/:accountId/ads` - Sync ads only

### Data Management
- `POST /api/revenue` - Add revenue transaction
- `GET /api/revenue` - Get revenue transactions
- `POST /api/leads` - Add lead
- `GET /api/leads` - Get leads

## Data Sources

| Metric | Source |
|--------|--------|
| Spend | Facebook API |
| Impressions | Facebook API |
| Clicks | Facebook API |
| Reach | Facebook API |
| **Revenue** | Local database (Data Management) |
| **Leads** | Local database (Data Management) |
| **ROAS** | Calculated (Revenue / Spend) |

## Default Admin Account

- **Email**: admin@pabbly.com
- **Password**: Admin@123

## Ad Accounts Configured

1. Pabbly Connect One Time (act_883912415611751)
2. Pabbly Chatflow (act_1304022760826324)
3. Pabbly Billing One Time (act_505099201137104)

## License

ISC
