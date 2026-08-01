import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ==================== Better Auth 核心表 ====================

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // 扩展字段
  role: text("role").notNull().default("user"), // user | admin
  quota: integer("quota").notNull().default(10),
  used: integer("used").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ==================== 业务表 ====================

export const imageHistory = sqliteTable("image_history", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // generate | edit
  model: text("model").notNull().default("gpt-image-2"),
  prompt: text("prompt").notNull(),
  size: text("size"),
  quality: text("quality"),
  imagePath: text("image_path"), // 相对路径，如 uploads/xxx.png
  cost: integer("cost").notNull().default(1),
  status: text("status").notNull().default("success"), // success | failed
  errorMsg: text("error_msg"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const quotaLogs = sqliteTable("quota_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  change: integer("change").notNull(), // +10 或 -1
  reason: text("reason").notNull(), // register | generate | edit | admin_recharge | admin_deduct
  operatorId: text("operator_id"), // 管理员 id，系统操作为 null
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
