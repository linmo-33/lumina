import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import {
  dailyRewardPolicySchema,
  getRewardPolicies,
  lotteryPolicySchema,
} from "@/lib/reward-policy";
import { LOTTERY_PROBABILITY_SCALE } from "@/lib/lottery-prizes";

const lotteryPolicyUpdateSchema = lotteryPolicySchema.superRefine(
  (policy, context) => {
    const enabledWeight = policy.prizes.reduce(
      (sum, prize) => sum + (prize.enabled ? prize.weight : 0),
      0,
    );
    if (enabledWeight !== LOTTERY_PROBABILITY_SCALE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prizes"],
        message: "已启用奖池项的抽取概率合计必须为 100%",
      });
    }
  },
);

const updateSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("daily"), policy: dailyRewardPolicySchema }),
  z.object({ strategy: z.literal("lottery"), policy: lotteryPolicyUpdateSchema }),
]);

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return NextResponse.json({ success: true, data: await getRewardPolicies() });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "策略格式不正确" },
      { status: 400 },
    );
  }

  const key = parsed.data.strategy === "daily" ? "dailyRewardPolicy" : "lotteryPolicy";
  const now = new Date();
  db
    .insert(systemSettings)
    .values({
      key,
      value: JSON.stringify(parsed.data.policy),
      updatedBy: session.user.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: JSON.stringify(parsed.data.policy),
        updatedBy: session.user.id,
        updatedAt: now,
      },
    })
    .run();

  await writeAdminAudit({
    operatorId: session.user.id,
    action: "reward_strategy_updated",
    detail:
      parsed.data.strategy === "daily"
        ? "更新每日灵点补给策略"
        : `更新灵光机策略（${parsed.data.policy.prizes.length} 个奖项）`,
  });

  return NextResponse.json({ success: true, data: await getRewardPolicies() });
}
