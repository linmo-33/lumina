import { randomInt, randomUUID } from "crypto";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLotteryPrizeDefinition } from "@/lib/lottery-prizes";
import { roundPoints } from "@/lib/points";
import { lotteryDraws, quotaLogs, user } from "@/lib/schema";
import { getRewardPolicies, type LotteryPrize } from "@/lib/reward-policy";

const bodySchema = z.object({
  requestId: z.string().uuid(),
  bet: z.number().int().min(1).max(100000),
});

const querySchema = z
  .object({
    requestId: z.string().uuid().optional(),
    spinId: z.string().uuid().optional(),
  })
  .refine((value) => value.requestId || value.spinId, {
    message: "缺少抽取标识",
  });

class LotteryError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "LOTTERY_REJECTED",
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

type DrawRow = typeof lotteryDraws.$inferSelect;

function serializeDraw(draw: DrawRow, repeated: boolean) {
  const storedSymbols = JSON.parse(draw.reelIconsSnapshot) as string[];
  const prize = getLotteryPrizeDefinition(
    draw.iconKeySnapshot,
    draw.multiplierSnapshot,
  );
  const symbols = storedSymbols.length === 3
    ? storedSymbols.map((key) => (
        getLotteryPrizeDefinition(key, draw.multiplierSnapshot).key
      ))
    : [prize.key, prize.key, prize.key];
  const balanceBefore = roundPoints(
    draw.balanceAfter + draw.cost - draw.reward,
  );

  return {
    spinId: draw.id,
    requestId: draw.requestId,
    symbols,
    prizeKey: prize.key,
    multiplier: draw.multiplierSnapshot,
    betAmount: draw.cost,
    rewardAmount: draw.reward,
    balanceBefore,
    balanceAfter: draw.balanceAfter,
    createdAt: draw.createdAt.toISOString(),
    repeated,
  };
}

async function getSessionUser() {
  return auth.api.getSession({ headers: await headers() });
}

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session?.user) {
    return NextResponse.json(
      { error: "未登录", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const parsed = querySchema.safeParse({
    requestId: request.nextUrl.searchParams.get("requestId") || undefined,
    spinId: request.nextUrl.searchParams.get("spinId") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "查询参数无效", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  const draw = await db
    .select()
    .from(lotteryDraws)
    .where(
      and(
        eq(lotteryDraws.userId, session.user.id),
        or(
          parsed.data.requestId
            ? eq(lotteryDraws.requestId, parsed.data.requestId)
            : undefined,
          parsed.data.spinId
            ? eq(lotteryDraws.id, parsed.data.spinId)
            : undefined,
        ),
      ),
    )
    .limit(1);

  if (!draw[0]) {
    return NextResponse.json(
      { error: "未找到该次抽取结果", code: "SPIN_NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: serializeDraw(draw[0], true) });
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session?.user) {
    return NextResponse.json(
      { error: "未登录", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "抽取请求无效", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const { lottery: policy } = await getRewardPolicies();
  if (!policy.enabled) {
    return NextResponse.json(
      { error: "灵光机当前未开放", code: "POLICY_DISABLED" },
      { status: 403 },
    );
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
          throw new LotteryError(
            "抽取请求标识冲突",
            409,
            "REQUEST_ID_CONFLICT",
          );
        }
        return serializeDraw(previous, true);
      }

      const current = tx
        .select({ quota: user.quota, isActive: user.isActive })
        .from(user)
        .where(eq(user.id, session.user.id))
        .get();
      if (!current?.isActive) {
        throw new LotteryError("账号当前不可用", 403, "ACCOUNT_DISABLED");
      }

      const bet = parsed.data.bet;
      if (bet < policy.minimumBet || bet > policy.maximumBet) {
        throw new LotteryError(
          `投入灵点必须在 ${policy.minimumBet} 至 ${policy.maximumBet} 之间`,
          400,
          "BET_OUT_OF_RANGE",
        );
      }
      if (current.quota < bet) {
        throw new LotteryError(
          `灵点不足，本次需要 ${bet} 灵点`,
          400,
          "INSUFFICIENT_BALANCE",
        );
      }

      const selected = drawPrize(policy.prizes);
      const prize = getLotteryPrizeDefinition(
        selected.iconKey,
        selected.multiplier,
      );
      const reward = roundPoints(bet * selected.multiplier);
      const balanceAfter = roundPoints(current.quota - bet + reward);
      const symbols = [prize.key, prize.key, prize.key];
      const spinId = randomUUID();
      const now = new Date();

      const updated = tx
        .update(user)
        .set({
          quota: sql<number>`round(${user.quota} - ${bet} + ${reward}, 2)`,
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
        throw new LotteryError(
          "灵点发生变化，请刷新后重试",
          409,
          "BALANCE_CHANGED",
        );
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

      const draw: DrawRow = {
        id: spinId,
        requestId: parsed.data.requestId,
        userId: session.user.id,
        cost: bet,
        prizeId: selected.id,
        prizeNameSnapshot: prize.assetName,
        iconKeySnapshot: prize.key,
        reelIconsSnapshot: JSON.stringify(symbols),
        multiplierSnapshot: selected.multiplier,
        reward,
        balanceAfter,
        createdAt: now,
      };
      tx.insert(lotteryDraws).values(draw).run();
      return serializeDraw(draw, false);
    });

    return NextResponse.json({ success: true, data: result });
  } catch (caught) {
    const status = caught instanceof LotteryError ? caught.status : 500;
    const code = caught instanceof LotteryError ? caught.code : "LOTTERY_ERROR";
    const message = caught instanceof Error ? caught.message : "抽取失败";
    return NextResponse.json({ error: message, code }, { status });
  }
}
