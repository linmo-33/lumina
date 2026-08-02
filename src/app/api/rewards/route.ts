import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dailyRewards, quotaLogs, user } from "@/lib/schema";
import {
  getPublicLotteryPrizes,
  getRewardDate,
  getRewardPolicies,
} from "@/lib/reward-policy";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const [currentUser] = await db
    .select({ quota: user.quota, isActive: user.isActive })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!currentUser?.isActive) {
    return NextResponse.json({ error: "账号当前不可用" }, { status: 403 });
  }

  const rewardDate = getRewardDate();
  const [policies, claimed, logs] = await Promise.all([
    getRewardPolicies(),
    db
      .select({ reward: dailyRewards.reward, createdAt: dailyRewards.createdAt })
      .from(dailyRewards)
      .where(
        and(
          eq(dailyRewards.userId, session.user.id),
          eq(dailyRewards.rewardDate, rewardDate),
        ),
      )
      .limit(1),
    db
      .select({
        id: quotaLogs.id,
        change: quotaLogs.change,
        reason: quotaLogs.reason,
        createdAt: quotaLogs.createdAt,
      })
      .from(quotaLogs)
      .where(eq(quotaLogs.userId, session.user.id))
      .orderBy(desc(quotaLogs.createdAt))
      .limit(12),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      balance: currentUser.quota,
      daily: {
        enabled: policies.daily.enabled,
        claimed: Boolean(claimed[0]),
        reward: claimed[0]?.reward ?? null,
        claimedAt: claimed[0]?.createdAt ?? null,
      },
      lottery: {
        enabled: policies.lottery.enabled,
        minimumBet: policies.lottery.minimumBet,
        maximumBet: policies.lottery.maximumBet,
        prizes: getPublicLotteryPrizes(policies.lottery),
      },
      logs,
    },
  });
}
