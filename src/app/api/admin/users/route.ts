import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "better-auth/crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import {
  account,
  adminAuditLogs,
  imageHistory,
  quotaLogs,
  session as sessionTable,
  user,
} from "@/lib/schema";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("quota"),
    userId: z.string().min(1),
    delta: z.number().int().min(-100000).max(100000).refine(Boolean),
  }),
  z.object({
    action: z.literal("status"),
    userId: z.string().min(1),
    isActive: z.boolean(),
  }),
  z.object({
    action: z.literal("password"),
    userId: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  }),
]);

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const userId = new URL(req.url).searchParams.get("userId");
  if (userId) {
    const [target] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        quota: user.quota,
        used: user.used,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const [recentQuotaLogs, recentUsage, audits] = await Promise.all([
      db
        .select()
        .from(quotaLogs)
        .where(eq(quotaLogs.userId, userId))
        .orderBy(desc(quotaLogs.createdAt))
        .limit(20),
      db
        .select({
          id: imageHistory.id,
          type: imageHistory.type,
          model: imageHistory.model,
          prompt: imageHistory.prompt,
          size: imageHistory.size,
          quality: imageHistory.quality,
          cost: imageHistory.cost,
          status: imageHistory.status,
          createdAt: imageHistory.createdAt,
        })
        .from(imageHistory)
        .where(eq(imageHistory.userId, userId))
        .orderBy(desc(imageHistory.createdAt))
        .limit(12),
      db
        .select({
          id: adminAuditLogs.id,
          operatorId: adminAuditLogs.operatorId,
          action: adminAuditLogs.action,
          detail: adminAuditLogs.detail,
          createdAt: adminAuditLogs.createdAt,
        })
        .from(adminAuditLogs)
        .where(eq(adminAuditLogs.targetUserId, userId))
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(20),
    ]);

    return NextResponse.json({
      success: true,
      data: { target, recentQuotaLogs, recentUsage, audits },
    });
  }

  const searchParams = new URL(req.url).searchParams;
  const requestedPage = Number(searchParams.get("page"));
  const requestedPageSize = Number(searchParams.get("pageSize"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const pageSize =
    Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
      ? Math.min(100, requestedPageSize)
      : 10;

  const [users, summaryRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        quota: user.quota,
        used: user.used,
        isActive: user.isActive,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({
        total: count(),
        active: sql<number>`sum(case when ${user.isActive} = 1 then 1 else 0 end)`,
        totalQuota: sql<number>`coalesce(sum(${user.quota}), 0)`,
      })
      .from(user),
  ]);

  const summary = summaryRows[0];
  const normalizedSummary = {
    total: Number(summary?.total ?? 0),
    active: Number(summary?.active ?? 0),
    totalQuota: Number(summary?.totalQuota ?? 0),
  };

  return NextResponse.json({
    success: true,
    page,
    pageSize,
    total: normalizedSummary.total,
    summary: normalizedSummary,
    data: users,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsed = actionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "操作参数不正确" },
      { status: 400 },
    );
  }

  const [target] = await db
    .select()
    .from(user)
    .where(eq(user.id, parsed.data.userId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  if (parsed.data.action === "quota") {
    const nextQuota = Math.max(0, target.quota + parsed.data.delta);
    const actualDelta = nextQuota - target.quota;
    if (actualDelta === 0) {
      return NextResponse.json({ error: "灵点已经为 0" }, { status: 400 });
    }

    db.transaction((tx) => {
      tx
        .update(user)
        .set({ quota: nextQuota, updatedAt: new Date() })
        .where(eq(user.id, target.id))
        .run();
      tx
        .insert(quotaLogs)
        .values({
          id: randomUUID(),
          userId: target.id,
          change: actualDelta,
          reason: actualDelta > 0 ? "admin_recharge" : "admin_deduct",
          operatorId: session.user.id,
          createdAt: new Date(),
        })
        .run();
    });

    await writeAdminAudit({
      operatorId: session.user.id,
      targetUserId: target.id,
      action: actualDelta > 0 ? "quota_added" : "quota_deducted",
      detail: `灵点 ${actualDelta > 0 ? "+" : ""}${actualDelta}，余额 ${nextQuota}`,
    });

    return NextResponse.json({ success: true, data: { quota: nextQuota } });
  }

  if (parsed.data.action === "status") {
    const nextIsActive = parsed.data.isActive;
    if (target.id === session.user.id && !nextIsActive) {
      return NextResponse.json(
        { error: "不能封禁当前登录的管理员账号" },
        { status: 400 },
      );
    }

    db.transaction((tx) => {
      tx
        .update(user)
        .set({ isActive: nextIsActive, updatedAt: new Date() })
        .where(eq(user.id, target.id))
        .run();
      if (!nextIsActive) {
        tx.delete(sessionTable).where(eq(sessionTable.userId, target.id)).run();
      }
    });

    await writeAdminAudit({
      operatorId: session.user.id,
      targetUserId: target.id,
      action: nextIsActive ? "user_unblocked" : "user_blocked",
      detail: nextIsActive ? "恢复账号访问" : "封禁账号并撤销全部会话",
    });

    return NextResponse.json({ success: true });
  }

  const [credentialAccount] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, target.id), eq(account.providerId, "credential")),
    )
    .limit(1);

  if (!credentialAccount) {
    return NextResponse.json(
      { error: "该用户没有邮箱密码账号" },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  db.transaction((tx) => {
    tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(account.id, credentialAccount.id))
      .run();
    tx.delete(sessionTable).where(eq(sessionTable.userId, target.id)).run();
  });

  await writeAdminAudit({
    operatorId: session.user.id,
    targetUserId: target.id,
    action: "password_reset",
    detail: "重置密码并撤销全部会话",
  });

  return NextResponse.json({ success: true });
}
