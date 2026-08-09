"use client";

import Image from "next/image";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/numeric-input";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/components/app-notifications";
import {
  LOTTERY_PROBABILITY_SCALE,
  LOTTERY_PRIZE_DEFINITIONS,
  getDefaultLotteryPrizes,
  getLotteryPrizeDefinition,
  normalizeLotteryPrizeWeights,
} from "@/lib/lottery-prizes";
import {
  Gauge,
  Info,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  TriangleAlert,
} from "lucide-react";

interface Prize {
  id: string;
  iconKey: string | null;
  weight: number;
  multiplier: number;
  enabled: boolean;
}

interface Strategies {
  daily: { enabled: boolean; minimum: number; maximum: number };
  lottery: {
    enabled: boolean;
    minimumBet: number;
    maximumBet: number;
    prizes: Prize[];
  };
}

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

interface LotteryMetrics {
  rtp: number;
  expectedNetPer100: number;
  lossRate: number;
  breakEvenRate: number;
  profitRate: number;
  hasEnabledPrizes: boolean;
}

function calculateLotteryMetrics(prizes: Prize[]): LotteryMetrics {
  const enabledPrizes = prizes.filter((prize) => prize.enabled);
  const totalWeight = enabledPrizes.reduce((sum, prize) => sum + prize.weight, 0);

  if (totalWeight <= 0) {
    return {
      rtp: 0,
      expectedNetPer100: 0,
      lossRate: 0,
      breakEvenRate: 0,
      profitRate: 0,
      hasEnabledPrizes: false,
    };
  }

  const weightedReturn = enabledPrizes.reduce(
    (sum, prize) => sum + prize.weight * prize.multiplier,
    0,
  );
  const rateFor = (predicate: (prize: Prize) => boolean) => (
    enabledPrizes.reduce(
      (sum, prize) => sum + (predicate(prize) ? prize.weight : 0),
      0,
    ) / totalWeight * 100
  );
  const rtp = weightedReturn / totalWeight * 100;

  return {
    rtp,
    expectedNetPer100: rtp - 100,
    lossRate: rateFor((prize) => prize.multiplier < 1),
    breakEvenRate: rateFor((prize) => prize.multiplier === 1),
    profitRate: rateFor((prize) => prize.multiplier > 1),
    hasEnabledPrizes: true,
  };
}

function getRtpStatus(rtp: number): { label: string; variant: BadgeVariant } {
  if (rtp < 85) return { label: "回收偏强", variant: "warning" };
  if (rtp <= 92) return { label: "平衡区间", variant: "success" };
  if (rtp <= 100) return { label: "返还偏高", variant: "info" };
  return { label: "长期净增", variant: "destructive" };
}

function normalizeLotteryStrategy(value: Strategies): Strategies {
  return {
    ...value,
    lottery: {
      ...value.lottery,
      prizes: normalizeLotteryPrizeWeights(value.lottery.prizes),
    },
  };
}

export function RewardStrategyPanel() {
  const [value, setValue] = useState<Strategies | null>(null);
  const [saving, setSaving] = useState<"daily" | "lottery" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/reward-strategies", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "奖励策略加载失败");
        setValue(normalizeLotteryStrategy(payload.data));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        notify.error({
          key: "strategy",
          message: "奖励策略加载失败",
          description: error instanceof Error ? error.message : "请稍后重试",
          position: "topRight",
        });
      });
    return () => controller.abort();
  }, []);

  const enabledProbabilityUnits = useMemo(
    () => value?.lottery.prizes.reduce(
      (sum, prize) => sum + (prize.enabled ? prize.weight : 0),
      0,
    ) ?? 0,
    [value?.lottery.prizes],
  );
  const lotteryMetrics = useMemo(
    () => calculateLotteryMetrics(value?.lottery.prizes ?? []),
    [value?.lottery.prizes],
  );
  const rtpStatus = getRtpStatus(lotteryMetrics.rtp);
  const probabilitiesAreValid = enabledProbabilityUnits === LOTTERY_PROBABILITY_SCALE
    && Boolean(value?.lottery.prizes.every(
      (prize) => Number.isInteger(prize.weight) && prize.weight >= 1,
    ));

  function updatePrize(index: number, patch: Partial<Prize>) {
    setValue((current) => {
      if (!current) return current;
      const prizes = current.lottery.prizes.map((prize, prizeIndex) => (
        prizeIndex === index ? { ...prize, ...patch } : prize
      ));
      return { ...current, lottery: { ...current.lottery, prizes } };
    });
  }

  function normalizeProbabilities() {
    setValue((current) => current ? normalizeLotteryStrategy(current) : current);
  }

  async function save(strategy: "daily" | "lottery") {
    if (!value) return;
    if (strategy === "lottery" && !probabilitiesAreValid) {
      notify.warning({
        key: "strategy",
        message: "抽取概率合计必须为 100%",
        description: "请调整各奖池项概率，或使用“按比例归一化”自动修正",
        position: "topRight",
      });
      return;
    }
    setSaving(strategy);
    const policy = strategy === "lottery"
      ? {
          ...value.lottery,
          prizes: value.lottery.prizes.map((prize) => ({
            ...prize,
            iconKey: getLotteryPrizeDefinition(
              prize.iconKey,
              prize.multiplier,
            ).key,
          })),
        }
      : value.daily;

    try {
      const response = await fetch("/api/admin/reward-strategies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, policy }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "保存失败");
      setValue(normalizeLotteryStrategy(payload.data));
      notify.success({
        key: "strategy",
        message: strategy === "lottery" ? "灵光机策略已保存" : "每日规则已保存",
        position: "topRight",
      });
    } catch (error) {
      notify.error({
        key: "strategy",
        message: "保存失败",
        description: error instanceof Error ? error.message : "请检查填写内容",
        position: "topRight",
      });
    } finally {
      setSaving(null);
    }
  }

  if (!value) {
    return (
      <Card className="grid min-h-64 place-items-center" aria-label="正在加载奖励策略">
        <LoaderCircle className="size-7 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <div className="admin-strategy-panel flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>每日奖励规则</CardTitle>
            <CardDescription>配置每日登录可领取的灵点范围。</CardDescription>
            <CardAction>
              <Switch
                aria-label="启用每日奖励"
                checked={value.daily.enabled}
                onCheckedChange={(checked) => setValue({
                  ...value,
                  daily: { ...value.daily, enabled: checked },
                })}
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="daily-minimum">最低奖励</FieldLabel>
                  <NumericInput
                    id="daily-minimum"
                    min={1}
                    step={1}
                    value={value.daily.minimum}
                    onValueChange={(minimum) => setValue({
                      ...value,
                      daily: { ...value.daily, minimum },
                    })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="daily-maximum">最高奖励</FieldLabel>
                  <NumericInput
                    id="daily-maximum"
                    min={1}
                    step={1}
                    value={value.daily.maximum}
                    onValueChange={(maximum) => setValue({
                      ...value,
                      daily: { ...value.daily, maximum },
                    })}
                  />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button onClick={() => void save("daily")} disabled={saving !== null}>
              {saving === "daily"
                ? <LoaderCircle className="animate-spin" data-icon="inline-start" />
                : <Save data-icon="inline-start" />}
              保存每日规则
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>灵光机规则</CardTitle>
            <CardDescription>投入范围、抽取概率和奖励结果全部由服务端策略决定。</CardDescription>
            <CardAction>
              <Switch
                aria-label="启用灵光机"
                checked={value.lottery.enabled}
                onCheckedChange={(checked) => setValue({
                  ...value,
                  lottery: { ...value.lottery, enabled: checked },
                })}
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="lottery-minimum-bet">最小投入</FieldLabel>
                  <NumericInput
                    id="lottery-minimum-bet"
                    min={1}
                    step={1}
                    value={value.lottery.minimumBet}
                    onValueChange={(minimumBet) => setValue({
                      ...value,
                      lottery: { ...value.lottery, minimumBet },
                    })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="lottery-maximum-bet">最大投入</FieldLabel>
                  <NumericInput
                    id="lottery-maximum-bet"
                    min={1}
                    step={1}
                    value={value.lottery.maximumBet}
                    onValueChange={(maximumBet) => setValue({
                      ...value,
                      lottery: { ...value.lottery, maximumBet },
                    })}
                  />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button onClick={() => void save("lottery")} disabled={saving !== null}>
              {saving === "lottery"
                ? <LoaderCircle className="animate-spin" data-icon="inline-start" />
                : <Save data-icon="inline-start" />}
              保存灵光机规则
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>灵光机奖池</CardTitle>
          <CardDescription>
            直接配置抽取概率；倍率与最终灵点均支持最多两位小数。
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setValue({
                ...value,
                lottery: { ...value.lottery, prizes: getDefaultLotteryPrizes() },
              })}
              disabled={saving !== null}
            >
              <RotateCcw data-icon="inline-start" />
              载入九档默认值
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert
            variant={probabilitiesAreValid ? "default" : "destructive"}
            className="pr-32"
          >
            {probabilitiesAreValid ? <Info /> : <TriangleAlert />}
            <AlertTitle>
              当前合计 {(enabledProbabilityUnits / 100).toFixed(2)}%
            </AlertTitle>
            <AlertDescription>
              已启用奖池项必须合计 100.00%；停用项不参与抽取。
            </AlertDescription>
            <AlertAction>
              <Button
                variant="outline"
                size="sm"
                onClick={normalizeProbabilities}
                disabled={saving !== null}
              >
                <RefreshCw data-icon="inline-start" />
                按比例归一化
              </Button>
            </AlertAction>
          </Alert>

          <Alert className="border-info/20 bg-info/5 px-4 py-3">
            <Gauge className="text-info" />
            <AlertTitle className="flex flex-wrap items-center gap-2">
              RTP 策略测算
              <Badge variant={lotteryMetrics.hasEnabledPrizes ? rtpStatus.variant : "secondary"}>
                {lotteryMetrics.hasEnabledPrizes ? rtpStatus.label : "无有效奖项"}
              </Badge>
              {!value.lottery.enabled && <Badge variant="secondary">策略已停用</Badge>}
            </AlertTitle>
            <AlertDescription className="mt-2 text-left">
              {lotteryMetrics.hasEnabledPrizes ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border bg-background/70 p-3">
                      <span className="text-xs text-muted-foreground">理论 RTP</span>
                      <strong className="mt-1 block text-xl font-semibold tabular-nums text-foreground">
                        {lotteryMetrics.rtp.toFixed(2)}%
                      </strong>
                    </div>
                    <div className="rounded-lg border bg-background/70 p-3">
                      <span className="text-xs text-muted-foreground">每投入 100 灵点预计返还</span>
                      <strong className="mt-1 block text-xl font-semibold tabular-nums text-foreground">
                        {lotteryMetrics.rtp.toFixed(2)} 灵点
                      </strong>
                    </div>
                    <div className="rounded-lg border bg-background/70 p-3">
                      <span className="text-xs text-muted-foreground">玩家长期净变化 / 100</span>
                      <strong className="mt-1 block text-xl font-semibold tabular-nums text-foreground">
                        {lotteryMetrics.expectedNetPer100 > 0 ? "+" : ""}
                        {lotteryMetrics.expectedNetPer100.toFixed(2)} 灵点
                      </strong>
                    </div>
                    <div className="rounded-lg border bg-background/70 p-3">
                      <span className="text-xs text-muted-foreground">结果概率</span>
                      <div className="mt-2 flex flex-wrap gap-1.5 tabular-nums">
                        <Badge variant="warning">亏损 {lotteryMetrics.lossRate.toFixed(2)}%</Badge>
                        <Badge variant="secondary">保本 {lotteryMetrics.breakEvenRate.toFixed(2)}%</Badge>
                        <Badge variant="success">盈利 {lotteryMetrics.profitRate.toFixed(2)}%</Badge>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs">
                    按服务端抽取口径测算：RTP = Σ（奖项权重 × 奖励倍率）÷ 已启用总权重，不代表单次抽取结果。
                  </p>
                </>
              ) : (
                <p>请至少启用一个有效奖项后再查看 RTP 测算结果。</p>
              )}
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-3">
            {value.lottery.prizes.map((prize, index) => {
              const definition = getLotteryPrizeDefinition(
                prize.iconKey,
                prize.multiplier,
              );
              const probability = prize.enabled ? prize.weight / 100 : 0;
              const probabilityIsInvalid = prize.enabled && prize.weight < 1;
              return (
                <div className="admin-prize-row" key={prize.id}>
                  <div className="admin-prize-art">
                    <Image
                      src={definition.image}
                      alt={definition.assetName}
                      width={72}
                      height={72}
                    />
                    <span>{probability.toFixed(2)}%</span>
                  </div>

                  <Field
                    data-disabled={!prize.enabled}
                    data-invalid={probabilityIsInvalid}
                  >
                    <FieldLabel htmlFor={`prize-weight-${prize.id}`}>抽取概率（%）</FieldLabel>
                    <NumericInput
                      id={`prize-weight-${prize.id}`}
                      min={0.01}
                      max={100}
                      step={0.01}
                      inputMode="decimal"
                      value={probability}
                      disabled={!prize.enabled}
                      aria-invalid={probabilityIsInvalid}
                      onValueChange={(probability) => updatePrize(index, {
                        weight: Math.round(probability * 100),
                      })}
                    />
                    <FieldDescription>
                      {prize.enabled
                        ? `本项占全部抽取结果的 ${probability.toFixed(2)}%`
                        : "停用后概率为 0%，不参与抽取"}
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor={`prize-multiplier-${prize.id}`}>奖励倍率</FieldLabel>
                    <NumericInput
                      id={`prize-multiplier-${prize.id}`}
                      min={0}
                      max={100}
                      step={0.1}
                      inputMode="decimal"
                      value={prize.multiplier}
                      onValueChange={(multiplier) => updatePrize(index, { multiplier })}
                    />
                    <FieldDescription>投入 1 灵点可获得 {prize.multiplier || 0} 灵点</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel>奖品素材</FieldLabel>
                    <Select
                      value={definition.key}
                      onValueChange={(iconKey) => updatePrize(index, { iconKey })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{definition.assetName}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {LOTTERY_PRIZE_DEFINITIONS.map((option) => (
                            <SelectItem key={option.key} value={option.key}>
                              {option.assetName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field orientation="horizontal" className="admin-prize-switch">
                    <FieldLabel htmlFor={`prize-enabled-${prize.id}`}>启用</FieldLabel>
                    <Switch
                      id={`prize-enabled-${prize.id}`}
                      checked={prize.enabled}
                      onCheckedChange={(enabled) => updatePrize(index, {
                        enabled,
                        weight: Math.max(1, prize.weight),
                      })}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => void save("lottery")} disabled={saving !== null}>
            {saving === "lottery"
              ? <LoaderCircle className="animate-spin" data-icon="inline-start" />
              : <Save data-icon="inline-start" />}
            保存奖池策略
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
