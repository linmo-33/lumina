import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  PASSWORD_RESET_EXPIRES_IN_SECONDS,
  sendPasswordResetEmail,
  sendVerificationCodeEmail,
  VERIFICATION_CODE_EXPIRES_IN_SECONDS,
} from "./email";
import * as schema from "./schema";
import { getSystemSettings } from "./system-settings";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: PASSWORD_RESET_EXPIRES_IN_SECONDS,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, url }) {
      await sendPasswordResetEmail({ email: user.email, url });
    },
  },
  rateLimit: {
    customRules: {
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        required: false,
        input: false,
      },
      quota: {
        type: "number",
        defaultValue: 10, // 数据库配置不可用时的安全回退值
        required: false,
        input: false,
      },
      used: {
        type: "number",
        defaultValue: 0,
        required: false,
        input: false,
      },
      isActive: {
        type: "boolean",
        defaultValue: true,
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const settings = await getSystemSettings();
          return {
            data: {
              ...newUser,
              quota: settings.defaultUserQuota,
            },
          };
        },
      },
    },
    session: {
      create: {
        before: async (newSession) => {
          const [currentUser] = await db
            .select({ isActive: schema.user.isActive })
            .from(schema.user)
            .where(eq(schema.user.id, newSession.userId))
            .limit(1);

          if (currentUser && !currentUser.isActive) {
            throw new APIError("FORBIDDEN", {
              message: "账号已被管理员封禁",
            });
          }
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 天
    updateAge: 60 * 60 * 24, // 每天更新一次
  },
  plugins: [
    emailOTP({
      disableSignUp: true,
      expiresIn: VERIFICATION_CODE_EXPIRES_IN_SECONDS,
      allowedAttempts: 5,
      storeOTP: "hashed",
      rateLimit: {
        window: 60,
        max: 3,
      },
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "email-verification") {
          throw new Error("当前仅支持注册邮箱验证");
        }
        await sendVerificationCodeEmail({ email, code: otp, type });
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
