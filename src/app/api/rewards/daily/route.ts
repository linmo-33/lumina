import { randomInt, randomUUID } from "crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dailyRewards, quotaLogs, user } from "@/lib/schema";
import { getRewardDate, getRewardPolicies } from "@/lib/reward-policy";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { daily: policy } = await getRewardPolicies();
  if (!policy.enabled) {
    return NextResponse.json({ error: "每日灵感补给当前未开放" }, { status: 403 });
  }

  const rewardDate = getRewardDate();
  const now = new Date();

  try {
    const result = db.transaction((tx) => {
      const existing = tx
        .select({ reward: dailyRewards.reward })
        .from(dailyRewards)
        .where(
          and(
            eq(dailyRewards.userId, session.user.id),
            eq(dailyRewards.rewardDate, rewardDate),
          ),
        )
        .get();

      if (existing) {
        const current = tx
          .select({ quota: user.quota })
          .from(user)
          .where(eq(user.id, session.user.id))
          .get();
        return { reward: existing.reward, balance: current?.quota ?? 0, claimed: true };
      }

      const current = tx
        .select({ quota: user.quota, isActive: user.isActive })
        .from(user)
        .where(eq(user.id, session.user.id))
        .get();
      if (!current?.isActive) throw new Error("账号当前不可用");

      const reward = randomInt(policy.minimum, policy.maximum + 1);
      tx.insert(dailyRewards)
        .values({
          id: randomUUID(),
          userId: session.user.id,
          rewardDate,
          reward,
          minimumSnapshot: policy.minimum,
          maximumSnapshot: policy.maximum,
          createdAt: now,
        })
        .run();
      tx.update(user)
        .set({ quota: sql`${user.quota} + ${reward}`, updatedAt: now })
        .where(eq(user.id, session.user.id))
        .run();
      tx.insert(quotaLogs)
        .values({
          id: randomUUID(),
          userId: session.user.id,
          change: reward,
          reason: "daily_reward",
          operatorId: null,
          createdAt: now,
        })
        .run();

      return { reward, balance: current.quota + reward, claimed: false };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (caught) {
    const [existing, current] = await Promise.all([
      db
        .select({ reward: dailyRewards.reward })
        .from(dailyRewards)
        .where(
          and(
            eq(dailyRewards.userId, session.user.id),
            eq(dailyRewards.rewardDate, rewardDate),
          ),
        )
        .limit(1),
      db
        .select({ quota: user.quota })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1),
    ]);
    if (existing[0]) {
      return NextResponse.json({
        success: true,
        data: {
          reward: existing[0].reward,
          balance: current[0]?.quota ?? 0,
          claimed: true,
        },
      });
    }
    const message = caught instanceof Error ? caught.message : "领取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
