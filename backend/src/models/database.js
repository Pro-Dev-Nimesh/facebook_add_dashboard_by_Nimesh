const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../database.sqlite');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function initializeDatabase() {
    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'viewer' CHECK(role IN ('admin', 'editor', 'viewer')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    `);

    // Ad Accounts table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ad_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            facebook_account_id TEXT,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'connect' CHECK(type IN ('connect', 'chatflow', 'email', 'psb')),
            access_token TEXT,
            refresh_token TEXT,
            token_expires_at DATETIME,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disconnected', 'error')),
            last_synced DATETIME,
            initial_sync_complete INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Campaigns table
    db.exec(`
        CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            facebook_campaign_id TEXT,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused')),
            budget REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // Campaign Daily Metrics table
    db.exec(`
        CREATE TABLE IF NOT EXISTS campaign_daily_metrics (
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
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE,
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        )
    `);

    // Ad Sets table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ad_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            campaign_id INTEGER NOT NULL,
            facebook_adset_id TEXT,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused')),
            budget REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE,
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        )
    `);

    // Ad Set Daily Metrics table
    db.exec(`
        CREATE TABLE IF NOT EXISTS adset_daily_metrics (
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
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE,
            FOREIGN KEY (adset_id) REFERENCES ad_sets(id) ON DELETE CASCADE
        )
    `);

    // Ads table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            campaign_id INTEGER NOT NULL,
            adset_id INTEGER NOT NULL,
            facebook_ad_id TEXT,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused')),
            creative_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE,
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (adset_id) REFERENCES ad_sets(id) ON DELETE CASCADE
        )
    `);

    // Ad Daily Metrics table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ad_daily_metrics (
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
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE,
            FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
        )
    `);

    // Country Performance table
    db.exec(`
        CREATE TABLE IF NOT EXISTS country_performance (
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
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // Revenue Transactions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS revenue_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            transaction_id TEXT UNIQUE,
            customer_email TEXT,
            product TEXT,
            country TEXT,
            country_code TEXT,
            amount REAL NOT NULL,
            source TEXT DEFAULT 'manual' CHECK(source IN ('webhook', 'manual', 'api')),
            campaign_id INTEGER,
            adset_id INTEGER,
            ad_id INTEGER,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // Leads table
    db.exec(`
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            date DATE NOT NULL,
            source TEXT DEFAULT 'facebook',
            count INTEGER DEFAULT 1,
            campaign_name TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // Alerts table
    db.exec(`
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            priority TEXT DEFAULT 'warning' CHECK(priority IN ('critical', 'warning', 'opportunity')),
            level TEXT DEFAULT 'campaign' CHECK(level IN ('campaign', 'adset', 'ad', 'country')),
            item_name TEXT,
            item_id INTEGER,
            spend REAL,
            roas REAL,
            threshold_info TEXT,
            status TEXT DEFAULT 'investigating' CHECK(status IN ('investigating', 'in_progress', 'resolved', 'dismissed')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // Alert Comments table
    db.exec(`
        CREATE TABLE IF NOT EXISTS alert_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Webhooks table
    db.exec(`
        CREATE TABLE IF NOT EXISTS webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            events TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
            last_triggered DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // Alert Thresholds table
    db.exec(`
        CREATE TABLE IF NOT EXISTS alert_thresholds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL UNIQUE,
            campaign_overspend REAL DEFAULT 500,
            adset_overspend REAL DEFAULT 200,
            daily_limit REAL DEFAULT 1000,
            min_campaign_roas REAL DEFAULT 1.0,
            min_adset_roas REAL DEFAULT 0.8,
            critical_roas REAL DEFAULT 0.5,
            high_frequency REAL DEFAULT 3.0,
            critical_frequency REAL DEFAULT 4.0,
            time_window TEXT DEFAULT '7days',
            alert_types TEXT DEFAULT '["overspend","low_roas","high_frequency","zero_sales","daily_summary","opportunity"]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // Sync Status table
    db.exec(`
        CREATE TABLE IF NOT EXISTS sync_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL UNIQUE,
            initial_sync_complete INTEGER DEFAULT 0,
            initial_sync_started_at DATETIME,
            initial_sync_completed_at DATETIME,
            last_daily_sync_at DATETIME,
            last_sync_status TEXT DEFAULT 'pending' CHECK(last_sync_status IN ('success', 'failed', 'in_progress', 'pending')),
            last_sync_error TEXT,
            next_scheduled_sync DATETIME,
            total_api_calls_today INTEGER DEFAULT 0,
            api_calls_reset_at DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // User Permissions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            access_level TEXT DEFAULT 'read' CHECK(access_level IN ('full', 'read')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, account_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // API Keys table
    db.exec(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            key_hash TEXT NOT NULL,
            key_prefix TEXT NOT NULL,
            name TEXT DEFAULT 'Default API Key',
            last_used DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
        )
    `);

    // Create default admin user if not exists
    const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@pabbly.com');
    if (!adminExists) {
        const hashedPassword = bcrypt.hashSync('Admin@123', 10);
        db.prepare(`
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, ?)
        `).run('Admin', 'admin@pabbly.com', hashedPassword, 'admin');
        console.log('Default admin user created: admin@pabbly.com / Admin@123');
    }

    // Create default ad accounts for the admin
    const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@pabbly.com');
    if (adminUser) {
        const accountsExist = db.prepare('SELECT id FROM ad_accounts WHERE user_id = ?').get(adminUser.id);
        if (!accountsExist) {
            const accounts = [
                { name: 'Pabbly Connect', type: 'connect' },
                { name: 'Pabbly Chatflow', type: 'chatflow' },
                { name: 'Pabbly Email Marketing', type: 'email' },
                { name: 'Pabbly PSB', type: 'psb' }
            ];

            const insertAccount = db.prepare(`
                INSERT INTO ad_accounts (user_id, name, type, status)
                VALUES (?, ?, ?, 'active')
            `);

            accounts.forEach(acc => {
                insertAccount.run(adminUser.id, acc.name, acc.type);
            });
            console.log('Default ad accounts created');

            // Insert sample data for each account
            insertSampleData(adminUser.id);
        }
    }

    console.log('Database tables created successfully');
}

function insertSampleData(userId) {
    const accounts = db.prepare('SELECT id, type FROM ad_accounts WHERE user_id = ?').all(userId);

    accounts.forEach(account => {
        // Insert sample campaigns
        const campaignData = getSampleCampaigns(account.type);
        const insertCampaign = db.prepare(`
            INSERT INTO campaigns (account_id, name, status, budget)
            VALUES (?, ?, ?, ?)
        `);

        campaignData.forEach(camp => {
            insertCampaign.run(account.id, camp.name, camp.status, camp.budget);
        });

        // Get inserted campaigns
        const campaigns = db.prepare('SELECT id, name FROM campaigns WHERE account_id = ?').all(account.id);

        // Insert sample ad sets for each campaign
        const insertAdSet = db.prepare(`
            INSERT INTO ad_sets (account_id, campaign_id, name, status, budget)
            VALUES (?, ?, ?, ?, ?)
        `);

        campaigns.forEach(campaign => {
            const adSets = getSampleAdSets(campaign.name);
            adSets.forEach(adSet => {
                insertAdSet.run(account.id, campaign.id, adSet.name, adSet.status, adSet.budget);
            });
        });

        // Get inserted ad sets
        const adSets = db.prepare('SELECT id, campaign_id, name FROM ad_sets WHERE account_id = ?').all(account.id);

        // Insert sample ads for each ad set
        const insertAd = db.prepare(`
            INSERT INTO ads (account_id, campaign_id, adset_id, name, status)
            VALUES (?, ?, ?, ?, ?)
        `);

        adSets.forEach(adSet => {
            const ads = getSampleAds(adSet.name);
            ads.forEach(ad => {
                insertAd.run(account.id, adSet.campaign_id, adSet.id, ad.name, ad.status);
            });
        });

        // Insert sample daily metrics for the last 30 days
        insertSampleMetrics(account.id);

        // Insert sample revenue transactions
        insertSampleRevenue(account.id);

        // Insert sample leads
        insertSampleLeads(account.id);

        // Insert sample alerts
        insertSampleAlerts(account.id);

        // Insert default alert thresholds
        db.prepare(`
            INSERT OR IGNORE INTO alert_thresholds (account_id)
            VALUES (?)
        `).run(account.id);

        // Insert sync status
        db.prepare(`
            INSERT OR IGNORE INTO sync_status (account_id)
            VALUES (?)
        `).run(account.id);
    });

    console.log('Sample data inserted');
}

function getSampleCampaigns(accountType) {
    return [
        { name: 'USA - Lifetime Deal', status: 'active', budget: 1200 },
        { name: 'EU - Subscription Q1', status: 'active', budget: 850 },
        { name: 'India - Growth', status: 'active', budget: 600 },
        { name: 'Global - Retargeting', status: 'active', budget: 200 },
        { name: 'UK - Brand Awareness', status: 'active', budget: 500 },
        { name: 'LATAM - Cold Outreach', status: 'active', budget: 750 }
    ];
}

function getSampleAdSets(campaignName) {
    return [
        { name: `${campaignName} - Interests`, status: 'active', budget: 300 },
        { name: `${campaignName} - Lookalike`, status: 'active', budget: 400 }
    ];
}

function getSampleAds(adSetName) {
    return [
        { name: `${adSetName} - Video Ad`, status: 'active' },
        { name: `${adSetName} - Image Ad`, status: 'active' },
        { name: `${adSetName} - Carousel Ad`, status: 'paused' }
    ];
}

function insertSampleMetrics(accountId) {
    const campaigns = db.prepare('SELECT id FROM campaigns WHERE account_id = ?').all(accountId);
    const adSets = db.prepare('SELECT id FROM ad_sets WHERE account_id = ?').all(accountId);
    const ads = db.prepare('SELECT id FROM ads WHERE account_id = ?').all(accountId);

    const insertCampaignMetric = db.prepare(`
        INSERT OR REPLACE INTO campaign_daily_metrics
        (account_id, campaign_id, date, spend, revenue, sales, leads, impressions, reach, clicks, frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAdSetMetric = db.prepare(`
        INSERT OR REPLACE INTO adset_daily_metrics
        (account_id, adset_id, date, spend, revenue, sales, leads, impressions, reach, clicks, frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAdMetric = db.prepare(`
        INSERT OR REPLACE INTO ad_daily_metrics
        (account_id, ad_id, date, spend, revenue, sales, leads, impressions, reach, clicks, frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert metrics for last 30 days
    for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        campaigns.forEach((campaign, idx) => {
            const baseSpend = 100 + Math.random() * 200;
            const roas = 0.3 + Math.random() * 2.5;
            const revenue = baseSpend * roas;
            const sales = Math.floor(revenue / 700);

            insertCampaignMetric.run(
                accountId,
                campaign.id,
                dateStr,
                baseSpend.toFixed(2),
                revenue.toFixed(2),
                sales,
                Math.floor(Math.random() * 15) + 5,
                Math.floor(Math.random() * 10000) + 5000,
                Math.floor(Math.random() * 8000) + 3000,
                Math.floor(Math.random() * 500) + 100,
                (1 + Math.random() * 2).toFixed(2)
            );
        });

        adSets.forEach(adSet => {
            const baseSpend = 50 + Math.random() * 100;
            const roas = 0.3 + Math.random() * 2.5;
            const revenue = baseSpend * roas;
            const sales = Math.floor(revenue / 700);

            insertAdSetMetric.run(
                accountId,
                adSet.id,
                dateStr,
                baseSpend.toFixed(2),
                revenue.toFixed(2),
                sales,
                Math.floor(Math.random() * 8) + 2,
                Math.floor(Math.random() * 5000) + 2000,
                Math.floor(Math.random() * 4000) + 1500,
                Math.floor(Math.random() * 250) + 50,
                (1 + Math.random() * 2).toFixed(2)
            );
        });

        ads.forEach(ad => {
            const baseSpend = 20 + Math.random() * 50;
            const roas = 0.3 + Math.random() * 2.5;
            const revenue = baseSpend * roas;
            const sales = Math.floor(revenue / 700);

            insertAdMetric.run(
                accountId,
                ad.id,
                dateStr,
                baseSpend.toFixed(2),
                revenue.toFixed(2),
                sales,
                Math.floor(Math.random() * 5) + 1,
                Math.floor(Math.random() * 2500) + 1000,
                Math.floor(Math.random() * 2000) + 750,
                Math.floor(Math.random() * 125) + 25,
                (1 + Math.random() * 2).toFixed(2)
            );
        });
    }

    // Insert country performance
    const countries = [
        { name: 'United States', code: 'us' },
        { name: 'India', code: 'in' },
        { name: 'United Kingdom', code: 'gb' },
        { name: 'Germany', code: 'de' },
        { name: 'Canada', code: 'ca' }
    ];

    const insertCountry = db.prepare(`
        INSERT OR REPLACE INTO country_performance
        (account_id, country_name, country_code, date, spend, revenue, sales)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        countries.forEach(country => {
            const spend = 50 + Math.random() * 200;
            const roas = 0.5 + Math.random() * 2;
            const revenue = spend * roas;
            const sales = Math.floor(revenue / 700);

            insertCountry.run(
                accountId,
                country.name,
                country.code,
                dateStr,
                spend.toFixed(2),
                revenue.toFixed(2),
                sales
            );
        });
    }
}

function insertSampleRevenue(accountId) {
    const products = ['Lifetime Deal', 'Annual Plan', 'Monthly Plan', 'Enterprise'];
    const countries = [
        { name: 'United States', code: 'us' },
        { name: 'India', code: 'in' },
        { name: 'United Kingdom', code: 'gb' },
        { name: 'Germany', code: 'de' }
    ];

    const insertRevenue = db.prepare(`
        INSERT INTO revenue_transactions
        (account_id, transaction_id, customer_email, product, country, country_code, amount, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 15; i++) {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 30));
        const country = countries[Math.floor(Math.random() * countries.length)];
        const product = products[Math.floor(Math.random() * products.length)];

        insertRevenue.run(
            accountId,
            `TXN_${accountId}_${Date.now()}_${i}`,
            `customer${i}@example.com`,
            product,
            country.name,
            country.code,
            product === 'Lifetime Deal' ? 700 : product === 'Annual Plan' ? 299 : product === 'Enterprise' ? 999 : 29,
            ['webhook', 'manual', 'api'][Math.floor(Math.random() * 3)],
            date.toISOString()
        );
    }
}

function insertSampleLeads(accountId) {
    const sources = ['Facebook Ads', 'Google Ads', 'Organic', 'Referral'];

    const insertLead = db.prepare(`
        INSERT INTO leads (account_id, date, source, count, campaign_name)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 14; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        insertLead.run(
            accountId,
            dateStr,
            sources[Math.floor(Math.random() * sources.length)],
            Math.floor(Math.random() * 20) + 5,
            'USA - Lifetime Deal'
        );
    }
}

function insertSampleAlerts(accountId) {
    const insertAlert = db.prepare(`
        INSERT INTO alerts (account_id, type, priority, level, item_name, spend, roas, threshold_info, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Critical alert
    insertAlert.run(
        accountId,
        'low_roas',
        'critical',
        'campaign',
        'EU - Subscription Q1',
        850,
        0.34,
        'ROAS below 0.5 threshold',
        'investigating'
    );

    // Warning alert
    insertAlert.run(
        accountId,
        'high_frequency',
        'warning',
        'ad',
        'USA - Lifetime Deal - Video Ad',
        450,
        1.2,
        'Frequency above 3.0',
        'investigating'
    );

    // Opportunity alert
    insertAlert.run(
        accountId,
        'high_roas',
        'opportunity',
        'campaign',
        'India - Growth',
        600,
        4.2,
        'ROAS significantly above target - consider scaling',
        'investigating'
    );
}

module.exports = {
    db,
    initializeDatabase
};
