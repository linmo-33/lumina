export const LOTTERY_PRIZE_DEFINITIONS = [
  {
    key: "sprout-rest",
    assetName: "青叶",
    multiplier: 0,
    defaultWeight: 4400,
    image: "/images/lottery-prizes/00-sprout-rest.png",
    effect: "none",
  },
  {
    key: "cherry-glow",
    assetName: "樱桃",
    multiplier: 1,
    defaultWeight: 3600,
    image: "/images/lottery-prizes/01-cherry-glow.png",
    effect: "common",
  },
  {
    key: "green-apple",
    assetName: "青苹果",
    multiplier: 2,
    defaultWeight: 1600,
    image: "/images/lottery-prizes/02-green-apple.png",
    effect: "common",
  },
  {
    key: "warm-mandarin",
    assetName: "橘子",
    multiplier: 3,
    defaultWeight: 200,
    image: "/images/lottery-prizes/03-warm-mandarin.png",
    effect: "common",
  },
  {
    key: "morning-peach",
    assetName: "蜜桃",
    multiplier: 4,
    defaultWeight: 80,
    image: "/images/lottery-prizes/04-morning-peach.png",
    effect: "rare",
  },
  {
    key: "starlight-grapes",
    assetName: "葡萄",
    multiplier: 5,
    defaultWeight: 50,
    image: "/images/lottery-prizes/05-starlight-grapes.png",
    effect: "rare",
  },
  {
    key: "star-dragon-fruit",
    assetName: "火龙果",
    multiplier: 8,
    defaultWeight: 40,
    image: "/images/lottery-prizes/06-star-dragon-fruit.png",
    effect: "epic",
  },
  {
    key: "harvest-grand-prize",
    assetName: "水果篮",
    multiplier: 10,
    defaultWeight: 20,
    image: "/images/lottery-prizes/07-harvest-grand-prize.png",
    effect: "grand",
  },
  {
    key: "aurora-orchard-jackpot",
    assetName: "果树",
    multiplier: 20,
    defaultWeight: 10,
    image: "/images/lottery-prizes/08-aurora-orchard-jackpot.png",
    effect: "jackpot",
  },
] as const;

export type LotteryPrizeDefinition = (typeof LOTTERY_PRIZE_DEFINITIONS)[number];
export type LotteryPrizeKey = LotteryPrizeDefinition["key"];
export type LotteryEffect = LotteryPrizeDefinition["effect"];

export const LOTTERY_PROBABILITY_SCALE = 10_000;

export function normalizeLotteryPrizeWeights<
  T extends { enabled: boolean; weight: number },
>(prizes: readonly T[]): T[] {
  const enabled = prizes
    .map((prize, index) => ({
      index,
      source: Number.isFinite(prize.weight) ? Math.max(0, prize.weight) : 0,
    }))
    .filter(({ index }) => prizes[index].enabled);
  if (enabled.length === 0) return prizes.map((prize) => ({ ...prize }));

  const sourceTotal = enabled.reduce((sum, prize) => sum + prize.source, 0);
  const alreadyNormalized = sourceTotal === LOTTERY_PROBABILITY_SCALE
    && enabled.every(({ source }) => Number.isInteger(source) && source >= 1);
  if (alreadyNormalized) return prizes.map((prize) => ({ ...prize }));

  const denominator = sourceTotal > 0 ? sourceTotal : enabled.length;
  const allocations = enabled.map(({ index, source }) => {
    const exact = (
      (sourceTotal > 0 ? source : 1) / denominator
    ) * LOTTERY_PROBABILITY_SCALE;
    const roundedDown = Math.floor(exact);
    return {
      index,
      weight: Math.max(1, roundedDown),
      remainder: exact - roundedDown,
    };
  });
  let difference = LOTTERY_PROBABILITY_SCALE - allocations.reduce(
    (sum, allocation) => sum + allocation.weight,
    0,
  );

  const increaseOrder = allocations.toSorted((left, right) => (
      right.remainder - left.remainder || left.index - right.index
  ));
  let cursor = 0;
  while (difference > 0) {
    increaseOrder[cursor % increaseOrder.length].weight += 1;
    difference -= 1;
    cursor += 1;
  }

  const decreaseOrder = allocations
    .filter((allocation) => allocation.weight > 1)
    .toSorted((left, right) => (
      right.weight - left.weight
      || left.remainder - right.remainder
      || left.index - right.index
    ));
  cursor = 0;
  while (difference < 0 && decreaseOrder.length > 0) {
    const allocation = decreaseOrder[cursor % decreaseOrder.length];
    if (allocation.weight > 1) {
      allocation.weight -= 1;
      difference += 1;
    }
    cursor += 1;
  }

  const weightByIndex = new Map(
    allocations.map(({ index, weight }) => [index, weight]),
  );
  return prizes.map((prize, index) => ({
    ...prize,
    weight: weightByIndex.get(index) ?? (
      Number.isFinite(prize.weight) ? Math.max(1, Math.round(prize.weight)) : 1
    ),
  }));
}

export function getLotteryPrizeTierLabel(effect: LotteryEffect) {
  if (effect === "grand") return "大奖";
  if (effect === "jackpot") return "超级大奖";
  return null;
}

export const LOTTERY_PRIZE_KEYS = LOTTERY_PRIZE_DEFINITIONS.map(
  (prize) => prize.key,
) as [LotteryPrizeKey, ...LotteryPrizeKey[]];

const prizeByKey = new Map<string, LotteryPrizeDefinition>(
  LOTTERY_PRIZE_DEFINITIONS.map((prize) => [prize.key, prize]),
);

const legacyPrizeKeyByIconKey: Record<string, LotteryPrizeKey> = {
  "item-001": "sprout-rest",
  "item-020": "cherry-glow",
  "item-200": "warm-mandarin",
  "item-371": "morning-peach",
  "item-476": "harvest-grand-prize",
};

export function getLotteryPrizeDefinition(
  key: string | null | undefined,
  multiplier = 0,
) {
  const direct = key ? prizeByKey.get(key) : undefined;
  if (direct) return direct;

  const legacyPrizeKey = key ? legacyPrizeKeyByIconKey[key] : undefined;
  if (legacyPrizeKey) {
    return prizeByKey.get(legacyPrizeKey) ?? LOTTERY_PRIZE_DEFINITIONS[0];
  }

  return LOTTERY_PRIZE_DEFINITIONS.find(
    (prize) => prize.multiplier === multiplier,
  ) ?? LOTTERY_PRIZE_DEFINITIONS[0];
}

export function getDefaultLotteryPrizes() {
  return LOTTERY_PRIZE_DEFINITIONS.map((prize) => ({
    id: prize.key,
    iconKey: prize.key,
    weight: prize.defaultWeight,
    multiplier: prize.multiplier,
    enabled: true,
  }));
}
