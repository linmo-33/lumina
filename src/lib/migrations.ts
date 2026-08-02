import type Database from "better-sqlite3";

interface Migration {
  id: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        quota INTEGER NOT NULL DEFAULT 10,
        used INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user (email);

      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY NOT NULL,
        expires_at INTEGER NOT NULL,
        token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        user_id TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS session_token_unique ON session (token);

      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at INTEGER,
        refresh_token_expires_at INTEGER,
        scope TEXT,
        password TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS account_user_id_index ON account (user_id);

      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY NOT NULL,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS image_history (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'gpt-image-2',
        prompt TEXT NOT NULL,
        size TEXT,
        quality TEXT,
        image_path TEXT,
        cost INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'success',
        error_msg TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS image_history_user_id_index
        ON image_history (user_id);

      CREATE TABLE IF NOT EXISTS quota_logs (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        change INTEGER NOT NULL,
        reason TEXT NOT NULL,
        operator_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS quota_logs_user_id_index
        ON quota_logs (user_id);
    `,
  },
  {
    id: 2,
    name: "admin_console_and_system_settings",
    sql: `
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_by TEXT,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (updated_by) REFERENCES user(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        operator_id TEXT NOT NULL,
        target_user_id TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (operator_id) REFERENCES user(id) ON DELETE CASCADE,
        FOREIGN KEY (target_user_id) REFERENCES user(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS admin_audit_logs_operator_id_index
        ON admin_audit_logs (operator_id);

      CREATE INDEX IF NOT EXISTS admin_audit_logs_target_user_id_index
        ON admin_audit_logs (target_user_id);

      CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_index
        ON admin_audit_logs (created_at);

      CREATE INDEX IF NOT EXISTS image_history_created_at_index
        ON image_history (created_at);

      INSERT OR IGNORE INTO system_settings (key, value, updated_by, updated_at)
        VALUES
          ('defaultModel', '"gpt-image-2"', NULL, unixepoch() * 1000),
          ('allowedModels', '["gpt-image-2","codex-gpt-image-2"]', NULL, unixepoch() * 1000),
          ('defaultSize', '"1024x1024"', NULL, unixepoch() * 1000),
          ('allowedSizes', '["1024x1024","1024x1536","1536x1024","1024x1365","1365x1024","1088x1920","1920x1088","2048x2048","2560x1440","1440x2560","3840x2160","2160x3840","auto"]', NULL, unixepoch() * 1000),
          ('defaultQuality', '"auto"', NULL, unixepoch() * 1000),
          ('allowedQualities', '["auto","low","medium","high"]', NULL, unixepoch() * 1000),
          ('maxImagesPerRequest', '10', NULL, unixepoch() * 1000),
          ('promptMaxLength', '4000', NULL, unixepoch() * 1000),
          ('defaultUserQuota', '10', NULL, unixepoch() * 1000);
    `,
  },
  {
    id: 3,
    name: "align_chatgpt2api_image_options",
    sql: `
      UPDATE system_settings
      SET value = '["1024x1024","1024x1536","1536x1024","1024x1365","1365x1024","1088x1920","1920x1088","2048x2048","2560x1440","1440x2560","3840x2160","2160x3840","auto"]',
          updated_at = unixepoch() * 1000
      WHERE key = 'allowedSizes'
        AND updated_by IS NULL
        AND value IN (
          '["1024x1024","1536x1024","1024x1536","auto"]',
          '["1024x1024","1024x1536","1536x1024","auto"]'
        );

      UPDATE system_settings
      SET value = '10',
          updated_at = unixepoch() * 1000
      WHERE key = 'maxImagesPerRequest'
        AND updated_by IS NULL
        AND value = '4';
    `,
  },
  {
    id: 4,
    name: "reward_center_and_lottery",
    sql: `
      CREATE TABLE IF NOT EXISTS daily_rewards (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        reward_date TEXT NOT NULL,
        reward INTEGER NOT NULL,
        minimum_snapshot INTEGER NOT NULL,
        maximum_snapshot INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS daily_rewards_user_date_unique
        ON daily_rewards (user_id, reward_date);

      CREATE INDEX IF NOT EXISTS daily_rewards_created_at_index
        ON daily_rewards (created_at);

      CREATE TABLE IF NOT EXISTS lottery_draws (
        id TEXT PRIMARY KEY NOT NULL,
        request_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        cost INTEGER NOT NULL,
        prize_id TEXT NOT NULL,
        prize_name_snapshot TEXT NOT NULL,
        icon_key_snapshot TEXT,
        reel_icons_snapshot TEXT NOT NULL,
        multiplier_snapshot INTEGER NOT NULL,
        reward INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS lottery_draws_request_id_unique
        ON lottery_draws (request_id);

      CREATE INDEX IF NOT EXISTS lottery_draws_user_id_index
        ON lottery_draws (user_id);

      CREATE INDEX IF NOT EXISTS lottery_draws_created_at_index
        ON lottery_draws (created_at);

      INSERT OR IGNORE INTO system_settings (key, value, updated_by, updated_at)
        VALUES
          ('dailyRewardPolicy', '{"enabled":true,"minimum":1,"maximum":3}', NULL, unixepoch() * 1000),
          ('lotteryPolicy', '{"enabled":true,"minimumBet":1,"maximumBet":100,"prizes":[{"id":"none","name":"未中奖","iconKey":null,"weight":55,"multiplier":0,"enabled":true},{"id":"return","name":"灵点返还","iconKey":"item-020","weight":28,"multiplier":1,"enabled":true},{"id":"flash","name":"灵光闪现","iconKey":"item-200","weight":12,"multiplier":2,"enabled":true},{"id":"bloom","name":"灵感绽放","iconKey":"item-371","weight":4,"multiplier":3,"enabled":true},{"id":"miracle","name":"灵感奇迹","iconKey":"item-476","weight":1,"multiplier":10,"enabled":true}]}', NULL, unixepoch() * 1000);
    `,
  },
];

export function runDatabaseMigrations(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _lumina_migrations (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = sqlite
    .prepare("SELECT id FROM _lumina_migrations")
    .all() as Array<{ id: number }>;
  const applied = new Set(appliedRows.map((row) => row.id));
  const insertMigration = sqlite.prepare(
    "INSERT INTO _lumina_migrations (id, name, applied_at) VALUES (?, ?, ?)",
  );

  const migrate = sqlite.transaction(() => {
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      sqlite.exec(migration.sql);
      insertMigration.run(migration.id, migration.name, Date.now());
    }
  });

  migrate();
}
