"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { notify } from "@/components/app-notifications";
import {
  LOTTERY_PRIZE_DEFINITIONS,
  getLotteryPrizeDefinition,
  getLotteryPrizeTierLabel,
  type LotteryEffect,
  type LotteryPrizeKey,
} from "@/lib/lottery-prizes";
import { formatPoints, roundPoints } from "@/lib/points";
import {
  Gamepad2,
  LoaderCircle,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";

export interface PublicLotteryPrize {
  id: string;
  iconKey: LotteryPrizeKey;
  image: string;
  effect: LotteryEffect;
  multiplier: number;
}

export interface PublicLotteryPolicy {
  enabled: boolean;
  minimumBet: number;
  maximumBet: number;
  prizes: PublicLotteryPrize[];
}

interface SpinResult {
  spinId: string;
  requestId: string;
  symbols: LotteryPrizeKey[];
  prizeKey: LotteryPrizeKey;
  multiplier: number;
  betAmount: number;
  rewardAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  repeated: boolean;
}

type SpinPhase =
  | "idle"
  | "requesting"
  | "spinning"
  | "stopping"
  | "revealing"
  | "settled"
  | "failed";

interface LotteryMachineProps {
  balance: number;
  policy: PublicLotteryPolicy;
  dailyReward?: ReactNode;
  onBalanceChange: (balance: number) => void;
  onSettled: () => Promise<void>;
}

interface ReelStyle extends CSSProperties {
  "--reel-duration": string;
  "--reel-delay": string;
}

const pendingSpinKey = "lumina.pending-lottery-spin.v1";
const idleSymbols: LotteryPrizeKey[] = [
  "cherry-glow",
  "green-apple",
  "warm-mandarin",
];
const reelDurations = [1850, 2050, 2250];
const reelDelays = [0, 180, 360];
const starParticles = Array.from({ length: 18 }, (_, index) => index);

function wait(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

function parseSpinResult(payload: unknown): SpinResult {
  const candidate = payload as { data?: Partial<SpinResult> };
  const result = candidate.data;
  if (
    !result ||
    typeof result.spinId !== "string" ||
    typeof result.requestId !== "string" ||
    !Array.isArray(result.symbols) ||
    result.symbols.length !== 3 ||
    typeof result.prizeKey !== "string" ||
    typeof result.multiplier !== "number" ||
    typeof result.rewardAmount !== "number" ||
    typeof result.balanceAfter !== "number"
  ) {
    throw new Error("抽取结果格式异常，请稍后重试");
  }
  return result as SpinResult;
}

function Reel({
  symbol,
  index,
  active,
  runKey,
}: {
  symbol: LotteryPrizeKey;
  index: number;
  active: boolean;
  runKey: number;
}) {
  const target = getLotteryPrizeDefinition(symbol);
  const sequence = active
    ? [
        ...LOTTERY_PRIZE_DEFINITIONS,
        ...LOTTERY_PRIZE_DEFINITIONS,
        ...LOTTERY_PRIZE_DEFINITIONS,
        target,
      ]
    : [target];
  const style: ReelStyle = {
    "--reel-duration": `${reelDurations[index]}ms`,
    "--reel-delay": `${reelDelays[index]}ms`,
  };

  return (
    <div className="orchard-reel" data-active={active || undefined}>
      <div
        className="orchard-reel-strip"
        key={`${runKey}-${symbol}-${active}`}
        style={style}
      >
        {sequence.map((prize, itemIndex) => (
          <div className="orchard-reel-item" key={`${prize.key}-${itemIndex}`}>
            <Image
              src={prize.image}
              alt={itemIndex === sequence.length - 1 ? prize.assetName : ""}
              width={190}
              height={190}
              loading={active ? "lazy" : "eager"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function WinEffectLayer({
  result,
  visible,
  overlayDismissed,
  onConfirm,
}: {
  result: SpinResult | null;
  visible: boolean;
  overlayDismissed: boolean;
  onConfirm: () => void;
}) {
  if (!result || !visible) return null;
  const prize = getLotteryPrizeDefinition(result.prizeKey, result.multiplier);
  const showArtwork = (
    prize.effect === "grand" || prize.effect === "jackpot"
  ) && !overlayDismissed;

  return (
    <div className="orchard-win-effects" data-effect={prize.effect} aria-hidden={!showArtwork}>
      <div className="orchard-win-glow" />
      {prize.effect !== "none" ? (
        <div className="orchard-star-field" aria-hidden="true">
          {starParticles.map((particle) => (
            <i key={particle} style={{ "--particle": particle } as CSSProperties} />
          ))}
        </div>
      ) : null}
      {showArtwork ? (
        <div className="orchard-prize-overlay">
          <Image src={prize.image} alt={prize.assetName} width={300} height={300} priority />
          <div>
            <strong>获得 {formatPoints(result.rewardAmount)} 灵点</strong>
            <span>{formatPoints(result.multiplier)} 倍奖励</span>
            <Button onClick={onConfirm}>收下奖励</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LotteryMachine({
  balance,
  policy,
  dailyReward,
  onBalanceChange,
  onSettled,
}: LotteryMachineProps) {
  const [bet, setBet] = useState(String(policy.minimumBet));
  const [phase, setPhase] = useState<SpinPhase>("idle");
  const [symbols, setSymbols] = useState<LotteryPrizeKey[]>(idleSymbols);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const maximumAvailableBet = Math.max(
    0,
    Math.floor(Math.min(balance, policy.maximumBet)),
  );
  const numericBet = Number(bet);
  const betIsValid = Number.isInteger(numericBet)
    && numericBet >= policy.minimumBet
    && numericBet <= policy.maximumBet
    && numericBet <= balance;
  const busy = ["requesting", "spinning", "stopping", "revealing"].includes(phase);
  const canSpin = policy.enabled && betIsValid && !busy;
  const predictedBalance = betIsValid
    ? roundPoints(balance - numericBet)
    : balance;
  const selectedQuick = numericBet === maximumAvailableBet
    ? "max"
    : [1, 5, 10].includes(numericBet)
      ? String(numericBet)
      : "";
  const resultDefinition = result
    ? getLotteryPrizeDefinition(result.prizeKey, result.multiplier)
    : null;
  const prizeEffect = resultDefinition?.effect ?? null;

  const status = useMemo(() => {
    if (!policy.enabled) return { badge: "暂未开放", title: "灵光机暂未开放", copy: "管理员开启后即可参与抽取" };
    if (phase === "requesting") return { badge: "校验中", title: "正在确认抽取", copy: "正在校验灵点余额和当前奖励策略" };
    if (phase === "spinning") return { badge: "抽取中", title: "转轮正在转动", copy: "抽取结果已由服务端确定" };
    if (phase === "stopping") return { badge: "即将揭晓", title: "转轮正在依次停止", copy: "本次抽取结果即将显示" };
    if (phase === "revealing") return {
      badge: result?.multiplier ? "奖励到账" : "抽取完成",
      title: result ? `获得 ${formatPoints(result.rewardAmount)} 灵点` : "正在显示结果",
      copy: result?.multiplier ? `${formatPoints(result.multiplier)} 倍奖励已到账` : "本次未获得奖励，可以再次抽取",
    };
    if (phase === "failed") return { badge: "可重试", title: "本次抽取未完成", copy: "请根据提示重新尝试" };
    if (result) return {
      badge: result.multiplier > 0 ? "奖励到账" : "抽取完成",
      title: `获得 ${formatPoints(result.rewardAmount)} 灵点`,
      copy: result.multiplier > 0
        ? `投入 ${formatPoints(result.betAmount)} 灵点，获得 ${formatPoints(result.rewardAmount)} 灵点 · ${formatPoints(result.multiplier)} 倍`
        : "本次未获得奖励，可以再次抽取",
    };
    return {
      badge: "等待抽取",
      title: "抽取结果由服务端生成",
      copy: "转轮动画仅用于展示，不影响最终结果",
    };
  }, [phase, policy.enabled, result]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBet((current) => {
        const amount = Number(current);
        if (
          Number.isInteger(amount)
          && amount >= policy.minimumBet
          && amount <= policy.maximumBet
        ) return current;
        return String(policy.minimumBet);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [policy.maximumBet, policy.minimumBet]);

  useEffect(() => () => {
    runRef.current += 1;
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const pending = window.sessionStorage.getItem(pendingSpinKey);
    if (!pending) return;
    let requestId = "";
    try {
      requestId = (JSON.parse(pending) as { requestId?: string }).requestId || "";
    } catch {
      window.sessionStorage.removeItem(pendingSpinKey);
      return;
    }
    if (!requestId) return;

    let cancelled = false;
    async function recover() {
      setPhase("requesting");
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`/api/rewards/lottery?requestId=${encodeURIComponent(requestId)}`);
        if (response.ok) {
          const recovered = parseSpinResult(await response.json());
          if (cancelled) return;
          setSymbols(recovered.symbols);
          setResult(recovered);
          setOverlayDismissed(false);
          setPhase("settled");
          onBalanceChange(recovered.balanceAfter);
          window.sessionStorage.removeItem(pendingSpinKey);
          return;
        }
        if (response.status !== 404) break;
        await wait(300);
      }
      if (!cancelled) {
        setPhase("idle");
        window.sessionStorage.removeItem(pendingSpinKey);
      }
    }
    void recover();
    return () => { cancelled = true; };
  }, [onBalanceChange]);

  function clampBet(value: number) {
    const upper = Math.max(policy.minimumBet, maximumAvailableBet);
    return Math.min(Math.max(Math.round(value), policy.minimumBet), upper);
  }

  function adjustBet(delta: number) {
    setBet(String(clampBet((Number.isFinite(numericBet) ? numericBet : policy.minimumBet) + delta)));
  }

  function applyQuickBet(value: string) {
    const amount = value === "max" ? maximumAvailableBet : Number(value);
    setBet(String(clampBet(amount)));
  }

  async function spin() {
    if (!canSpin) return;
    const runId = runRef.current + 1;
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    runRef.current = runId;
    abortRef.current = controller;
    setPhase("requesting");
    setResult(null);
    setOverlayDismissed(false);
    window.sessionStorage.setItem(pendingSpinKey, JSON.stringify({ requestId }));

    try {
      const response = await fetch("/api/rewards/lottery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, bet: numericBet }),
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "抽取失败");
      const nextResult = parseSpinResult(payload);
      if (runRef.current !== runId) return;

      setResult(nextResult);
      setSymbols(nextResult.symbols);
      setRunKey((current) => current + 1);
      setPhase(reduceMotion ? "revealing" : "spinning");

      if (!reduceMotion) {
        await wait(1400);
        if (runRef.current !== runId) return;
        setPhase("stopping");
        await wait(1360);
      } else {
        await wait(300);
      }
      if (runRef.current !== runId) return;

      setPhase("revealing");
      onBalanceChange(nextResult.balanceAfter);
      const effect = getLotteryPrizeDefinition(
        nextResult.prizeKey,
        nextResult.multiplier,
      ).effect;
      const revealDuration = reduceMotion
        ? 300
        : effect === "jackpot"
          ? 1600
          : effect === "grand" || effect === "epic"
            ? 1300
            : effect === "rare"
              ? 1000
              : 650;
      await wait(revealDuration);
      if (runRef.current !== runId) return;
      setPhase("settled");
      window.sessionStorage.removeItem(pendingSpinKey);
      await onSettled();
    } catch (error) {
      if (runRef.current !== runId || controller.signal.aborted) return;
      try {
        const recovery = await fetch(`/api/rewards/lottery?requestId=${encodeURIComponent(requestId)}`);
        if (recovery.ok) {
          const recovered = parseSpinResult(await recovery.json());
          setSymbols(recovered.symbols);
          setResult(recovered);
          setPhase("settled");
          onBalanceChange(recovered.balanceAfter);
          window.sessionStorage.removeItem(pendingSpinKey);
          return;
        }
      } catch {
        // The original error below remains the most useful user-facing message.
      }
      setPhase("failed");
      window.sessionStorage.removeItem(pendingSpinKey);
      notify.error({
        key: "lottery",
        message: "本次抽取未完成",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      if (runRef.current === runId) abortRef.current = null;
    }
  }

  const reelActive = phase === "spinning" || phase === "stopping";
  const showEffects = phase === "revealing" || phase === "settled";

  return (
    <section className="orchard-lottery" aria-labelledby="lottery-title">
      <header className="orchard-lottery-header">
        <div className="orchard-title-lockup">
          <span className="orchard-title-icon"><Gamepad2 /></span>
          <div className="orchard-title-copy">
            <h1 id="lottery-title">灵光机</h1>
            <p>三列图案一致时获得对应倍率</p>
          </div>
        </div>
      </header>

      <div className="orchard-lottery-main">
        <div
          className="orchard-stage"
          data-phase={phase}
          data-effect={prizeEffect || undefined}
          aria-busy={busy}
        >
          <div className="orchard-stage-head">
            <div><strong>抽取转轮</strong></div>
            <Badge variant="secondary">{status.badge}</Badge>
          </div>
          <div className="orchard-reel-frame">
            <div className="orchard-light-rail" aria-hidden="true" />
            <div className="orchard-reels">
              {symbols.map((symbol, index) => (
                <Reel
                  key={`reel-${index}`}
                  symbol={symbol}
                  index={index}
                  active={reelActive}
                  runKey={runKey}
                />
              ))}
            </div>
          </div>
          <div className="orchard-spin-status" aria-live="polite">
            <strong>{status.title}</strong>
            <span>{status.copy}</span>
          </div>
          <WinEffectLayer
            result={result}
            visible={showEffects}
            overlayDismissed={overlayDismissed}
            onConfirm={() => setOverlayDismissed(true)}
          />
        </div>

        <div className="orchard-controls" aria-disabled={busy}>
          {dailyReward ? (
            <div className="orchard-controls-daily">{dailyReward}</div>
          ) : null}

          <Field data-disabled={busy || !policy.enabled}>
            <FieldLabel htmlFor="lottery-bet">本次投入</FieldLabel>
            <div className="orchard-stepper">
              <Button
                variant="ghost"
                size="icon"
                aria-label="减少投入灵点"
                onClick={() => adjustBet(-1)}
                disabled={busy || numericBet <= policy.minimumBet}
              ><Minus /></Button>
              <Input
                id="lottery-bet"
                type="number"
                min={policy.minimumBet}
                max={maximumAvailableBet}
                step={1}
                value={bet}
                aria-invalid={!betIsValid}
                disabled={busy || !policy.enabled}
                onChange={(event) => setBet(event.target.value)}
                onBlur={() => setBet(String(clampBet(Number(bet) || policy.minimumBet)))}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="增加投入灵点"
                onClick={() => adjustBet(1)}
                disabled={busy || numericBet >= maximumAvailableBet}
              ><Plus /></Button>
            </div>
            <ToggleGroup
              className="orchard-quick-bets"
              value={selectedQuick ? [selectedQuick] : []}
              onValueChange={(values) => values[0] && applyQuickBet(values[0])}
              variant="outline"
              spacing={2}
              disabled={busy || !policy.enabled}
            >
              <ToggleGroupItem value="1">1</ToggleGroupItem>
              <ToggleGroupItem value="5">5</ToggleGroupItem>
              <ToggleGroupItem value="10">10</ToggleGroupItem>
              <ToggleGroupItem value="max">最大</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              可投入 {policy.minimumBet}～{policy.maximumBet} 灵点
            </FieldDescription>
          </Field>

          <div className="orchard-cost-summary">
            <div><span>本次消耗</span><strong>{Number.isFinite(numericBet) ? formatPoints(numericBet) : 0} 灵点</strong></div>
            <div><span>扣除投入后余额</span><strong>{formatPoints(predictedBalance)} 灵点</strong></div>
          </div>

          <Button
            size="lg"
            className="orchard-spin-button"
            onClick={() => void spin()}
            disabled={!canSpin}
          >
            {busy
              ? <LoaderCircle className="animate-spin" data-icon="inline-start" />
              : <Sparkles data-icon="inline-start" />}
            {phase === "requesting"
              ? "正在确认…"
              : phase === "spinning" || phase === "stopping"
                ? "正在抽取…"
                : "开始抽取"}
          </Button>

          {!canSpin && !busy ? (
            <p className="orchard-control-hint">
              {!policy.enabled
                ? "灵光机当前未开放"
                : numericBet > balance
                  ? "当前灵点不足"
                  : "请输入允许范围内的整数灵点"}
            </p>
          ) : null}
        </div>
      </div>

      <div className="orchard-prize-pool" id="lottery-prize-pool">
        <div className="orchard-prize-heading">
          <div><strong>当前奖池</strong><span>奖励倍率以后台实时策略为准</span></div>
          <span>灵点仅用于站内创作奖励，不支持提现或交易</span>
        </div>
        <div className="orchard-prize-list">
          {policy.prizes.map((prize) => {
            const definition = getLotteryPrizeDefinition(
              prize.iconKey,
              prize.multiplier,
            );
            const tierLabel = getLotteryPrizeTierLabel(prize.effect);
            return (
              <article className="orchard-prize-card" data-effect={prize.effect} key={prize.id}>
                <Image src={prize.image} alt={definition.assetName} width={96} height={96} />
                <span>{formatPoints(prize.multiplier)} 倍</span>
                {tierLabel ? <Badge variant="secondary">{tierLabel}</Badge> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
