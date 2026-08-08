import { z } from "zod";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/schema";
import {
  LOTTERY_PRIZE_KEYS,
  getDefaultLotteryPrizes,
  getLotteryPrizeDefinition,
  type LotteryPrizeKey,
} from "@/lib/lottery-prizes";

const LEGACY_SLOT_ICON_KEYS = [
  "item-001",
  "item-020",
  "item-200",
  "item-170",
  "item-303",
  "item-321",
  "item-353",
  "item-371",
  "item-372",
  "item-373",
  "item-447",
  "item-476",
] as const;

export const SLOT_ICON_KEYS = LOTTERY_PRIZE_KEYS;
export type SlotIconKey = LotteryPrizeKey;

const policyIconKeySchema = z.enum([
  ...LOTTERY_PRIZE_KEYS,
  ...LEGACY_SLOT_ICON_KEYS,
]);

function hasAtMostTwoDecimalPlaces(value: number) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

export const dailyRewardPolicySchema = z
  .object({
    enabled: z.boolean(),
    minimum: z.number().int().min(1).max(100),
    maximum: z.number().int().min(1).max(100),
  })
  .refine((value) => value.maximum >= value.minimum, {
    message: "最高奖励不能低于最低奖励",
    path: ["maximum"],
  });

export const lotteryPrizeSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9_-]{1,32}$/),
  iconKey: policyIconKeySchema.nullable(),
  weight: z.number().int().min(1).max(100000),
  multiplier: z
    .number()
    .min(0)
    .max(100)
    .refine(hasAtMostTwoDecimalPlaces, "倍率最多支持两位小数"),
  enabled: z.boolean(),
});

export const lotteryPolicySchema = z
  .object({
    enabled: z.boolean(),
    minimumBet: z.number().int().min(1).max(100000),
    maximumBet: z.number().int().min(1).max(100000),
    prizes: z.array(lotteryPrizeSchema).min(2).max(10),
  })
  .superRefine((value, context) => {
    if (value.maximumBet < value.minimumBet) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maximumBet"],
        message: "最大投入不能低于最小投入",
      });
    }
    const ids = new Set<string>();
    value.prizes.forEach((prize, index) => {
      if (ids.has(prize.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["prizes", index, "id"],
          message: "奖项标识不能重复",
        });
      }
      ids.add(prize.id);
      if (prize.multiplier > 0 && !prize.iconKey) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["prizes", index, "iconKey"],
          message: "奖励结果必须选择素材",
        });
      }
    });

    const enabled = value.prizes.filter((prize) => prize.enabled);
    if (enabled.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prizes"],
        message: "至少启用一个奖项",
      });
    }
    if (!enabled.some((prize) => prize.multiplier === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prizes"],
        message: "至少启用一个 0 倍结果",
      });
    }
    if (!enabled.some((prize) => prize.multiplier > 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prizes"],
        message: "至少启用一个倍率大于 0 的奖励结果",
      });
    }
  });

export type DailyRewardPolicy = z.infer<typeof dailyRewardPolicySchema>;
export type LotteryPrize = z.infer<typeof lotteryPrizeSchema>;
export type LotteryPolicy = z.infer<typeof lotteryPolicySchema>;

export const DEFAULT_DAILY_REWARD_POLICY: DailyRewardPolicy = {
  enabled: true,
  minimum: 1,
  maximum: 3,
};

export const DEFAULT_LOTTERY_POLICY: LotteryPolicy = {
  enabled: true,
  minimumBet: 1,
  maximumBet: 50,
  prizes: getDefaultLotteryPrizes(),
};

function parsePolicy<T>(raw: string | undefined, schema: z.ZodType<T>, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

function parseLotteryPolicy(raw: string | undefined): LotteryPolicy {
  if (!raw) return DEFAULT_LOTTERY_POLICY;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const candidate =
      typeof value.cost === "number"
        ? {
            enabled: value.enabled,
            minimumBet: 1,
            maximumBet: 100,
            prizes: value.prizes,
          }
        : value;
    const parsed = lotteryPolicySchema.safeParse(candidate);
    if (!parsed.success) return DEFAULT_LOTTERY_POLICY;
    const usesLegacyArtwork = parsed.data.prizes.some(
      (prize) => !prize.iconKey || prize.iconKey.startsWith("item-"),
    );
    return usesLegacyArtwork ? DEFAULT_LOTTERY_POLICY : parsed.data;
  } catch {
    return DEFAULT_LOTTERY_POLICY;
  }
}

export async function getRewardPolicies() {
  const rows = await db.select().from(systemSettings);
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    daily: parsePolicy(
      values.get("dailyRewardPolicy"),
      dailyRewardPolicySchema,
      DEFAULT_DAILY_REWARD_POLICY,
    ),
    lottery: parseLotteryPolicy(values.get("lotteryPolicy")),
  };
}

export function getRewardTimeZone() {
  const requested = process.env.TZ?.trim() || "Asia/Shanghai";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: requested }).format(new Date());
    return requested;
  } catch {
    return "Asia/Shanghai";
  }
}

export function getRewardDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getRewardTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getPublicLotteryPrizes(policy: LotteryPolicy) {
  return policy.prizes.filter((prize) => prize.enabled).map((prize) => {
    const definition = getLotteryPrizeDefinition(
      prize.iconKey,
      prize.multiplier,
    );
    return {
      id: prize.id,
      iconKey: definition.key,
      image: definition.image,
      effect: definition.effect,
      multiplier: prize.multiplier,
    };
  });
}
