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
