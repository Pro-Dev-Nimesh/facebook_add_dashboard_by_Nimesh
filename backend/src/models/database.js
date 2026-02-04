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

    // Ad Country Daily Metrics table (per-ad, per-country, per-day from Facebook insights)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ad_country_daily_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            ad_id INTEGER NOT NULL,
            country_code TEXT NOT NULL,
            country_name TEXT,
            date DATE NOT NULL,
            spend REAL DEFAULT 0,
            revenue REAL DEFAULT 0,
            sales INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ad_id, country_code, date),
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

    // Webhooks table - check if old schema exists and migrate
    const webhookTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='webhooks'").get();
    if (webhookTableExists) {
        const cols = db.pragma('table_info(webhooks)').map(c => c.name);
        if (cols.includes('url') && !cols.includes('webhook_url')) {
            // Old schema detected - rebuild table
            db.exec(`ALTER TABLE webhooks RENAME TO webhooks_old`);
            db.exec(`
                CREATE TABLE webhooks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    webhook_url TEXT NOT NULL,
                    secret_key TEXT,
                    type TEXT DEFAULT 'revenue' CHECK(type IN ('revenue', 'leads', 'alerts')),
                    target_url TEXT,
                    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                    last_triggered DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
                )
            `);
            db.exec(`
                INSERT INTO webhooks (id, account_id, name, webhook_url, status, last_triggered, created_at)
                SELECT id, account_id, name, url, status, last_triggered, created_at FROM webhooks_old
            `);
            db.exec(`DROP TABLE webhooks_old`);
            console.log('Webhooks table migrated to new schema');
        } else if (cols.includes('url') && cols.includes('webhook_url')) {
            // Mixed schema (ALTER added columns but old url NOT NULL still present) - rebuild
            db.exec(`ALTER TABLE webhooks RENAME TO webhooks_old`);
            db.exec(`
                CREATE TABLE webhooks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    webhook_url TEXT NOT NULL DEFAULT '',
                    secret_key TEXT,
                    type TEXT DEFAULT 'revenue' CHECK(type IN ('revenue', 'leads', 'alerts')),
                    target_url TEXT,
                    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                    last_triggered DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
                )
            `);
            db.exec(`
                INSERT INTO webhooks (id, account_id, name, webhook_url, secret_key, type, target_url, status, last_triggered, created_at, updated_at)
                SELECT id, account_id, name, COALESCE(webhook_url, url, ''), secret_key, COALESCE(type, 'revenue'), target_url, status, last_triggered, created_at, updated_at
                FROM webhooks_old
            `);
            db.exec(`DROP TABLE webhooks_old`);
            console.log('Webhooks table rebuilt with clean schema');
        }
    } else {
        db.exec(`
            CREATE TABLE IF NOT EXISTS webhooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                webhook_url TEXT NOT NULL,
                secret_key TEXT,
                type TEXT DEFAULT 'revenue' CHECK(type IN ('revenue', 'leads', 'alerts')),
                target_url TEXT,
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                last_triggered DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
            )
        `);
    }

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
        // No sample campaigns/adsets/ads/metrics - all data comes from Facebook sync
        // No sample revenue/leads - data comes from manual entry or Pabbly automation

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

    console.log('Account defaults inserted (sync Facebook data to populate campaigns/ads)');
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
