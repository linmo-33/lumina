import { z } from "zod";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/schema";

export const SLOT_ICON_KEYS = [
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

export type SlotIconKey = (typeof SLOT_ICON_KEYS)[number];

const slotIconKeySchema = z.enum(SLOT_ICON_KEYS);

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
  name: z.string().trim().min(1).max(20),
  iconKey: slotIconKeySchema.nullable(),
  weight: z.number().int().min(1).max(100000),
  multiplier: z.number().int().min(0).max(100),
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
        message: "最高下注不能低于最低下注",
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
          message: "中奖奖项必须选择图标",
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
        message: "至少启用一个未中奖奖项",
      });
    }
    if (!enabled.some((prize) => prize.multiplier > 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prizes"],
        message: "至少启用一个中奖奖项",
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
  maximumBet: 100,
  prizes: [
    { id: "none", name: "未中奖", iconKey: null, weight: 55, multiplier: 0, enabled: true },
    { id: "return", name: "灵点返还", iconKey: "item-020", weight: 28, multiplier: 1, enabled: true },
    { id: "flash", name: "灵光闪现", iconKey: "item-200", weight: 12, multiplier: 2, enabled: true },
    { id: "bloom", name: "灵感绽放", iconKey: "item-371", weight: 4, multiplier: 3, enabled: true },
    { id: "miracle", name: "灵感奇迹", iconKey: "item-476", weight: 1, multiplier: 10, enabled: true },
  ],
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
    return parsed.success ? parsed.data : DEFAULT_LOTTERY_POLICY;
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
  return policy.prizes.filter((prize) => prize.enabled).map((prize) => ({
    id: prize.id,
    name: prize.name,
    iconKey: prize.iconKey,
    multiplier: prize.multiplier,
  }));
}
