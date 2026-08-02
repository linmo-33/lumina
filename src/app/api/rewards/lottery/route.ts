import { randomInt, randomUUID } from "crypto";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { lotteryDraws, quotaLogs, user } from "@/lib/schema";
import {
  getRewardPolicies,
  SLOT_ICON_KEYS,
  type LotteryPrize,
  type SlotIconKey,
} from "@/lib/reward-policy";

const bodySchema = z.object({
  requestId: z.string().uuid(),
  bet: z.number().int().min(1).max(100000),
});

class LotteryError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function drawPrize(prizes: LotteryPrize[]) {
  const enabled = prizes.filter((prize) => prize.enabled);
  const totalWeight = enabled.reduce((sum, prize) => sum + prize.weight, 0);
  let cursor = randomInt(1, totalWeight + 1);
  for (const prize of enabled) {
    cursor -= prize.weight;
    if (cursor <= 0) return prize;
  }
  return enabled[enabled.length - 1];
}

function drawDistinctReels(): [SlotIconKey, SlotIconKey, SlotIconKey] {
  const pool = [...SLOT_ICON_KEYS];
  const result: SlotIconKey[] = [];
  while (result.length < 3) {
    const index = randomInt(0, pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result as [SlotIconKey, SlotIconKey, SlotIconKey];
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "抽取请求无效" }, { status: 400 });
  }

  const { lottery: policy } = await getRewardPolicies();
  if (!policy.enabled) {
    return NextResponse.json({ error: "灵光机当前未开放" }, { status: 403 });
  }

  try {
    const result = db.transaction((tx) => {
      const previous = tx
        .select()
        .from(lotteryDraws)
        .where(eq(lotteryDraws.requestId, parsed.data.requestId))
        .get();
      if (previous) {
        if (previous.userId !== session.user.id) {
          throw new LotteryError("抽取请求标识冲突", 409);
        }
        return {
          prizeId: previous.prizeId,
          prizeName: previous.prizeNameSnapshot,
          multiplier: previous.multiplierSnapshot,
          reward: previous.reward,
          bet: previous.cost,
          reels: JSON.parse(previous.reelIconsSnapshot) as SlotIconKey[],
          balance: previous.balanceAfter,
          repeated: true,
        };
      }

      const current = tx
        .select({ quota: user.quota, isActive: user.isActive })
        .from(user)
        .where(eq(user.id, session.user.id))
        .get();
      if (!current?.isActive) throw new LotteryError("账号当前不可用", 403);
      const bet = parsed.data.bet;
      if (bet < policy.minimumBet || bet > policy.maximumBet) {
        throw new LotteryError(
          `下注灵点必须在 ${policy.minimumBet} 至 ${policy.maximumBet} 之间`,
        );
      }
      if (current.quota < bet) {
        throw new LotteryError(`灵点不足，本次需要 ${bet} 灵点`);
      }

      const prize = drawPrize(policy.prizes);
      const reward = bet * prize.multiplier;
      const balance = current.quota - bet + reward;
      const winningIcon = prize.iconKey ?? SLOT_ICON_KEYS[0];
      const reels =
        prize.multiplier > 0
          ? ([winningIcon, winningIcon, winningIcon] as SlotIconKey[])
          : drawDistinctReels();
      const now = new Date();

      const updated = tx
        .update(user)
        .set({
          quota: sql`${user.quota} - ${bet} + ${reward}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(user.id, session.user.id),
            eq(user.isActive, true),
            gte(user.quota, bet),
          ),
        )
        .run();
      if (updated.changes === 0) {
        throw new LotteryError("灵点发生变化，请刷新后重试", 409);
      }

      tx.insert(quotaLogs)
        .values({
          id: randomUUID(),
          userId: session.user.id,
          change: -bet,
          reason: "lottery_cost",
          operatorId: null,
          createdAt: now,
        })
        .run();
      if (reward > 0) {
        tx.insert(quotaLogs)
          .values({
            id: randomUUID(),
            userId: session.user.id,
            change: reward,
            reason: "lottery_reward",
            operatorId: null,
            createdAt: now,
          })
          .run();
      }
      tx.insert(lotteryDraws)
        .values({
          id: randomUUID(),
          requestId: parsed.data.requestId,
          userId: session.user.id,
          cost: bet,
          prizeId: prize.id,
          prizeNameSnapshot: prize.name,
          iconKeySnapshot: prize.iconKey,
          reelIconsSnapshot: JSON.stringify(reels),
          multiplierSnapshot: prize.multiplier,
          reward,
          balanceAfter: balance,
          createdAt: now,
        })
        .run();

      return {
        prizeId: prize.id,
        prizeName: prize.name,
        multiplier: prize.multiplier,
        reward,
        bet,
        reels,
        balance,
        repeated: false,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (caught) {
    const status = caught instanceof LotteryError ? caught.status : 400;
    const message = caught instanceof Error ? caught.message : "抽取失败";
    return NextResponse.json({ error: message }, { status });
  }
}
