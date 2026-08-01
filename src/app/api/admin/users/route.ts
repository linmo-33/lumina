import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, quotaLogs } from "@/lib/schema";
import { eq, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

async function requireAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) return null;

  const u = session.user as typeof session.user & { role: string };
  if (u.role !== "admin") return null;
  return session.user;
}

/** 获取用户列表 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = await db
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
    .orderBy(desc(user.createdAt));

  return NextResponse.json({ success: true, data: users });
}

/** 充值 / 修改额度、启用禁用 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, quotaDelta, isActive } = body;

  if (!userId) {
    return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
  }

  const target = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!target.length) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    const updates: Partial<typeof user.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof quotaDelta === "number" && quotaDelta !== 0) {
      updates.quota = sql`${user.quota} + ${quotaDelta}`;
      await tx.insert(quotaLogs).values({
        id: randomUUID(),
        userId,
        change: quotaDelta,
        reason: quotaDelta > 0 ? "admin_recharge" : "admin_deduct",
        operatorId: admin.id,
        createdAt: new Date(),
      });
    }

    if (typeof isActive === "boolean") {
      updates.isActive = isActive;
    }

    if (Object.keys(updates).length > 1) {
      await tx.update(user).set(updates).where(eq(user.id, userId));
    }
  });

  return NextResponse.json({ success: true });
}
