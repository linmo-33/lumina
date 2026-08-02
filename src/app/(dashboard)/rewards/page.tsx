"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Divider,
  Icon,
  Input,
  Tag,
  Title,
  Tooltip,
} from "animal-island-ui";
import { AppLoading, AppShell } from "@/components/app-shell";
import { notify } from "@/components/app-notifications";
import { useSession } from "@/lib/auth-client";
import {
  isIntegerInRange,
  parseNumericInput,
  type NumericInputValue,
} from "@/lib/numeric-input";
import { getRewardIcon, REWARD_ICONS } from "@/lib/reward-icons";

interface RewardPageData {
  balance: number;
  daily: {
    enabled: boolean;
    claimed: boolean;
    reward: number | null;
    claimedAt: string | null;
  };
  lottery: {
    enabled: boolean;
    minimumBet: number;
    maximumBet: number;
    prizes: Array<{
      id: string;
      name: string;
      iconKey: string | null;
      multiplier: number;
    }>;
  };
  logs: Array<{
    id: string;
    change: number;
    reason: string;
    createdAt: string;
  }>;
}

interface LotteryResult {
  prizeId: string;
  prizeName: string;
  multiplier: number;
  reward: number;
  bet: number;
  reels: string[];
  balance: number;
}

const reasonLabels: Record<string, string> = {
  initial_setup: "初始化灵点",
  register: "初始灵点",
  generate: "图片生成",
  edit: "图片编辑",
  admin_recharge: "管理员补充",
  admin_deduct: "管理员扣减",
  daily_reward: "每日灵感补给",
  lottery_cost: "灵光机转动",
  lottery_reward: "灵光机奖励",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function RewardsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [data, setData] = useState<RewardPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [bet, setBet] = useState<NumericInputValue>(1);
  const [result, setResult] = useState<LotteryResult | null>(null);
  const [reels, setReels] = useState<string[]>([
    REWARD_ICONS[0].key,
    REWARD_ICONS[1].key,
    REWARD_ICONS[2].key,
  ]);
  const spinTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/rewards")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "灵海加载失败");
        if (!cancelled) {
          const next = payload.data as RewardPageData;
          setData(next);
          setBet(next.lottery.minimumBet);
        }
      })
      .catch((caught) => {
        if (cancelled) return;
        notify.error({
          key: "rewards-load",
          message: "灵海加载失败",
          description: caught instanceof Error ? caught.message : "请稍后重试",
          position: "topRight",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(
    () => () => {
      if (spinTimer.current !== null) window.clearInterval(spinTimer.current);
    },
    [],
  );

  const user = session?.user as
    | (NonNullable<typeof session>["user"] & { quota?: number; role?: string })
    | undefined;

  const canSpin = Boolean(
    data?.lottery.enabled &&
      isIntegerInRange(
        bet,
        data.lottery.minimumBet,
        data.lottery.maximumBet,
      ) &&
      data.balance >= bet &&
      !spinning &&
      !claiming,
  );

  async function reloadData() {
    const response = await fetch("/api/rewards");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "灵点信息刷新失败");
    const next = payload.data as RewardPageData;
    setData(next);
    setBet((current) => {
      if (current === "") return current;
      const availableMaximum = Math.min(next.lottery.maximumBet, next.balance);
      if (availableMaximum < next.lottery.minimumBet) return next.lottery.minimumBet;
      return Math.max(next.lottery.minimumBet, Math.min(current, availableMaximum));
    });
  }

  async function claimDailyReward() {
    if (!data || data.daily.claimed) return;
    setClaiming(true);
    try {
      const response = await fetch("/api/rewards/daily", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "领取失败");
      await reloadData();
      notify.success({
        key: "daily-reward",
        message: `今日获得 ${payload.data.reward} 灵点`,
        description: payload.data.claimed ? "今天已经领取过了" : "灵点已汇入灵海",
        position: "topRight",
      });
    } catch (caught) {
      notify.error({
        key: "daily-reward",
        message: "领取失败",
        description: caught instanceof Error ? caught.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setClaiming(false);
    }
  }

  async function spinLottery() {
    if (!data || !canSpin || typeof bet !== "number") return;
    setSpinning(true);
    setResult(null);
    const startedAt = Date.now();
    spinTimer.current = window.setInterval(() => {
      setReels(
        Array.from({ length: 3 }, () => {
          const index = Math.floor(Math.random() * REWARD_ICONS.length);
          return REWARD_ICONS[index].key;
        }),
      );
    }, 85);

    try {
      const response = await fetch("/api/rewards/lottery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), bet }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "转动失败");
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1100) {
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, 1100 - elapsed),
        );
      }
      if (spinTimer.current !== null) window.clearInterval(spinTimer.current);
      spinTimer.current = null;
      setReels(payload.data.reels);
      setResult(payload.data);
      setData((current) =>
        current ? { ...current, balance: payload.data.balance } : current,
      );
      await reloadData();
    } catch (caught) {
      notify.error({
        key: "lottery-spin",
        message: "灵光机转动失败",
        description: caught instanceof Error ? caught.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      if (spinTimer.current !== null) window.clearInterval(spinTimer.current);
      spinTimer.current = null;
      setSpinning(false);
    }
  }

  if (isPending || loading) return <AppLoading label="正在汇集灵点…" />;
  if (!session || !user) return <AppLoading label="正在前往登录页…" />;
  if (!data) return <AppLoading label="灵海暂时无法抵达，请稍后刷新…" />;

  return (
    <AppShell active="rewards" user={user} quota={data.balance}>
      <div className="rewards-page">
        <Card className="rewards-hero">
          <div>
            <p className="lumina-kicker">LUMINA REWARDS</p>
            <Title size="large" color="app-teal">灵海</Title>
            <p className="lumina-description">领取灵感补给，也可以让灵点碰撞出意外惊喜。</p>
          </div>
          <div className="rewards-balance">
            <span>当前灵点</span>
            <strong>{data.balance}</strong>
            <small>生成一张图片通常消耗 1 灵点</small>
          </div>
        </Card>

        <div className="rewards-grid">
          <Card className="rewards-card daily-reward-card">
            <div className="rewards-card-heading">
              <div>
                <p className="lumina-kicker">DAILY INSPIRATION</p>
                <Title color="app-teal">每日灵感补给</Title>
              </div>
              <Icon name="icon-design" size={54} bounce />
            </div>
            <Divider type="dashed-brown" />
            {!data.daily.enabled ? (
              <div className="reward-empty-state">每日补给当前未开放</div>
            ) : data.daily.claimed ? (
              <div className="daily-reward-result">
                <span>今日已领取</span>
                <strong>+{data.daily.reward} 灵点</strong>
                <small>每日 00:00 重置</small>
              </div>
            ) : (
              <div className="daily-reward-result is-ready">
                <span>今日灵感补给已准备好</span>
                <strong>领取后揭晓</strong>
                <small>每天可随机获得一次灵点</small>
              </div>
            )}
            <Button
              type="primary"
              size="large"
              block
              loading={claiming}
              disabled={!data.daily.enabled || data.daily.claimed || claiming || spinning}
              onClick={() => void claimDailyReward()}
            >
              {data.daily.claimed ? "今日补给已领取" : "领取今日灵点"}
            </Button>
          </Card>

          <Card className="rewards-card lottery-card">
            <div className="rewards-card-heading">
              <div>
                <p className="lumina-kicker">LUMINA SPIN</p>
                <Title color="app-yellow">灵光机</Title>
              </div>
              <div className="lottery-heading-actions">
                <Tooltip
                  title={
                    <div className="lottery-multiplier-tooltip">
                      {data.lottery.prizes.map((prize) => (
                        <div className="lottery-multiplier-row" key={prize.id}>
                          <span>{prize.name}</span>
                          <strong>{prize.multiplier} 倍</strong>
                        </div>
                      ))}
                    </div>
                  }
                  placement="bottom-end"
                  trigger="hover"
                >
                  <button
                    type="button"
                    className="lottery-help-button"
                    aria-label="查看奖项倍率"
                  >
                    ?
                  </button>
                </Tooltip>
                <Tag color="app-yellow" variant="solid">自选下注</Tag>
              </div>
            </div>
            <Divider type="dashed-brown" />

            <div className="lottery-bet-control">
              <label className="lumina-field-label" htmlFor="lottery-bet">本次下注</label>
              <Input
                id="lottery-bet"
                type="number"
                min={data.lottery.minimumBet}
                max={Math.min(data.lottery.maximumBet, data.balance)}
                step={1}
                value={bet}
                suffix="灵点"
                shadow
                disabled={spinning || !data.lottery.enabled}
                onChange={(event) => setBet(parseNumericInput(event.target.value))}
              />
              <small>
                可下注 {data.lottery.minimumBet}～{data.lottery.maximumBet} 灵点，当前余额 {data.balance}
              </small>
            </div>

            <div className={`lottery-machine ${spinning ? "is-spinning" : ""}`} aria-live="polite">
              {reels.map((key, index) => {
                const icon = getRewardIcon(key);
                return (
                  <div className="lottery-reel" key={`${index}-${key}`}>
                    <Icon src={icon.src} size={64} />
                  </div>
                );
              })}
            </div>

            <div className="lottery-result" aria-live="polite">
              {spinning ? (
                <><strong>灵光正在汇聚…</strong><span>结果由服务端生成</span></>
              ) : result ? (
                <>
                  <strong>{result.prizeName}</strong>
                  <span>
                    {result.reward > 0
                      ? `下注 ${result.bet} 灵点，获得 ${result.reward} 灵点 · ${result.multiplier} 倍奖励`
                      : `下注 ${result.bet} 灵点，这次没有获得奖励`}
                  </span>
                </>
              ) : (
                <><strong>转动三列图标揭晓奖励</strong><span>中奖结果以三个相同图标呈现</span></>
              )}
            </div>

            <Button
              type="primary"
              size="large"
              block
              loading={spinning}
              disabled={!canSpin}
              onClick={() => void spinLottery()}
            >
              {!data.lottery.enabled
                ? "灵光机暂未开放"
                : !isIntegerInRange(
                      bet,
                      data.lottery.minimumBet,
                      data.lottery.maximumBet,
                    )
                  ? `请输入 ${data.lottery.minimumBet}～${data.lottery.maximumBet} 灵点`
                  : data.balance < bet
                    ? `还差 ${bet - data.balance} 灵点`
                    : `转动一次 · 下注 ${bet} 灵点`}
            </Button>
          </Card>
        </div>

        <Card className="reward-logs-card">
          <div className="rewards-card-heading">
            <div><p className="lumina-kicker">RECENT ACTIVITY</p><Title>灵点明细</Title></div>
            <Tag color="app-teal" variant="soft">最近 {data.logs.length} 条</Tag>
          </div>
          <div className="reward-log-list">
            {data.logs.length === 0 && <div className="reward-empty-state">还没有灵点记录</div>}
            {data.logs.map((log) => (
              <div className="reward-log-row" key={log.id}>
                <span><strong>{reasonLabels[log.reason] || log.reason}</strong><small>{formatTime(log.createdAt)}</small></span>
                <b className={log.change >= 0 ? "is-positive" : "is-negative"}>
                  {log.change > 0 ? "+" : ""}{log.change}
                </b>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
