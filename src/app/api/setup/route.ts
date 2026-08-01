import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEmailServiceStatus } from "@/lib/email";
import { quotaLogs, user } from "@/lib/schema";

export const dynamic = "force-dynamic";

const setupSchema = z.object({
  name: z.string().trim().min(2, "管理员名称至少需要 2 个字符").max(40),
  email: z.string().trim().email("请输入有效的邮箱地址"),
  password: z.string().min(8, "密码至少需要 8 位").max(128),
  initialQuota: z.number().int().min(1).max(100_000).default(100),
});

function hasConfiguredSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  return Boolean(
    secret &&
      secret.length >= 32 &&
      secret !== "please-change-me-to-a-long-random-string",
  );
}

async function getSetupState() {
  let databaseReady = false;
  let adminCount = 0;

  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(user)
      .where(eq(user.role, "admin"));
    adminCount = Number(result[0]?.count || 0);
    databaseReady = true;
  } catch {
    databaseReady = false;
  }

  const emailService = getEmailServiceStatus();
  const checks = {
    database: databaseReady,
    authSecret: hasConfiguredSecret(),
    appUrl: Boolean(process.env.BETTER_AUTH_URL),
    emailApiKey: emailService.apiKey,
    emailFrom: emailService.from,
    imageApiUrl: Boolean(process.env.CHATGPT2API_BASE_URL),
    imageApiKey: Boolean(
      process.env.CHATGPT2API_KEY &&
        process.env.CHATGPT2API_KEY !== "your-auth-key",
    ),
  };

  return {
    configured: databaseReady && adminCount > 0,
    adminExists: adminCount > 0,
    canInitialize:
      databaseReady &&
      checks.authSecret &&
      checks.emailApiKey &&
      checks.emailFrom,
    checks,
  };
}

export async function GET() {
  const state = await getSetupState();
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const state = await getSetupState();

  if (state.configured) {
    return NextResponse.json(
      {
        success: true,
        alreadyConfigured: true,
        message: "项目已经完成初始化",
      },
      { status: 200 },
    );
  }

  if (!state.checks.database) {
    return NextResponse.json(
      { error: "数据库自动迁移失败，请检查 data 目录的写入权限" },
      { status: 503 },
    );
  }

  if (!state.checks.authSecret) {
    return NextResponse.json(
      { error: "请先配置长度不少于 32 位的 BETTER_AUTH_SECRET" },
      { status: 503 },
    );
  }

  if (!state.checks.emailApiKey || !state.checks.emailFrom) {
    return NextResponse.json(
      { error: "请先配置 Resend API 密钥和已验证的发件人地址" },
      { status: 503 },
    );
  }

  try {
    const input = setupSchema.parse(await req.json());
    const result = await auth.api.signUpEmail({
      body: {
        name: input.name,
        email: input.email.toLowerCase(),
        password: input.password,
      },
    });
    const [createdUser] = await db
      .select({ quota: user.quota })
      .from(user)
      .where(eq(user.id, result.user.id))
      .limit(1);
    const initialQuotaChange = input.initialQuota - (createdUser?.quota ?? 0);

    db.transaction((tx) => {
      tx
        .update(user)
        .set({
          role: "admin",
          emailVerified: true,
          quota: input.initialQuota,
          updatedAt: new Date(),
        })
        .where(eq(user.id, result.user.id))
        .run();

      if (initialQuotaChange !== 0) {
        tx
          .insert(quotaLogs)
          .values({
            id: randomUUID(),
            userId: result.user.id,
            change: initialQuotaChange,
            reason: "initial_setup",
            operatorId: result.user.id,
            createdAt: new Date(),
          })
          .run();
      }
    });

    return NextResponse.json({
      success: true,
      message: "管理员账号创建成功",
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "设置参数不正确" },
        { status: 400 },
      );
    }

    console.error("[setup] initialization failed", error);
    const message = error instanceof Error ? error.message : "初始化失败";
    const latestState = await getSetupState();

    if (latestState.configured) {
      return NextResponse.json({
        success: true,
        recovered: true,
        message: "初始化已经完成",
      });
    }

    return NextResponse.json(
      {
        error: message,
        code: "SETUP_INITIALIZATION_FAILED",
      },
      { status: 500 },
    );
  }
}
