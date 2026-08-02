"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Divider,
  Icon,
  Input,
  Modal,
  Switch,
  Tag,
  Title,
} from "animal-island-ui";
import { notify } from "@/components/app-notifications";
import {
  isIntegerInRange,
  parseNumericInput,
  type NumericInputValue,
} from "@/lib/numeric-input";
import { getRewardIcon, REWARD_ICONS } from "@/lib/reward-icons";

interface DailyPolicy {
  enabled: boolean;
  minimum: NumericInputValue;
  maximum: NumericInputValue;
}

interface LotteryPrize {
  id: string;
  name: string;
  iconKey: string | null;
  weight: NumericInputValue;
  multiplier: NumericInputValue;
  enabled: boolean;
}

interface LotteryPolicy {
  enabled: boolean;
  minimumBet: NumericInputValue;
  maximumBet: NumericInputValue;
  prizes: LotteryPrize[];
}

interface RewardStrategies {
  daily: DailyPolicy;
  lottery: LotteryPolicy;
}

export function RewardStrategyPanel() {
  const [strategies, setStrategies] = useState<RewardStrategies | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"daily" | "lottery" | null>(null);
  const [iconPrizeIndex, setIconPrizeIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/reward-strategies")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "策略加载失败");
        setStrategies(payload.data);
      })
      .catch((caught) =>
        notify.error({
          key: "reward-strategies-load",
          message: "灵点策略加载失败",
          description: caught instanceof Error ? caught.message : "请稍后重试",
          position: "topRight",
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  async function saveStrategy(strategy: "daily" | "lottery") {
    if (!strategies) return;

    const hasInvalidNumber =
      strategy === "daily"
        ? !isIntegerInRange(strategies.daily.minimum, 1, 100) ||
          !isIntegerInRange(strategies.daily.maximum, 1, 100)
        : !isIntegerInRange(strategies.lottery.minimumBet, 1, 100000) ||
          !isIntegerInRange(strategies.lottery.maximumBet, 1, 100000) ||
          strategies.lottery.prizes.some(
            (prize) =>
              !isIntegerInRange(prize.weight, 1, 100000) ||
              !isIntegerInRange(prize.multiplier, 0, 100),
          );

    if (hasInvalidNumber) {
      notify.error({
        key: `reward-strategies-${strategy}`,
        message: "策略数值填写不完整",
        description: "请填写输入框允许范围内的整数",
        position: "topRight",
      });
      return;
    }

    setSaving(strategy);
    try {
      const response = await fetch("/api/admin/reward-strategies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, policy: strategies[strategy] }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "策略保存失败");
      setStrategies(payload.data);
      notify.success({
        key: `reward-strategies-${strategy}`,
        message: strategy === "daily" ? "每日补给策略已保存" : "灵光机策略已保存",
        description: "新策略已立即生效",
        position: "topRight",
      });
    } catch (caught) {
      notify.error({
        key: `reward-strategies-${strategy}`,
        message: "策略保存失败",
        description: caught instanceof Error ? caught.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setSaving(null);
    }
  }

  function updatePrize(index: number, patch: Partial<LotteryPrize>) {
    if (!strategies) return;
    setStrategies({
      ...strategies,
      lottery: {
        ...strategies.lottery,
        prizes: strategies.lottery.prizes.map((prize, prizeIndex) =>
          prizeIndex === index ? { ...prize, ...patch } : prize,
        ),
      },
    });
  }

  function addPrize() {
    if (!strategies || strategies.lottery.prizes.length >= 10) return;
    setStrategies({
      ...strategies,
      lottery: {
        ...strategies.lottery,
        prizes: [
          ...strategies.lottery.prizes,
          {
            id: `prize_${Date.now()}`,
            name: "新奖项",
            iconKey: REWARD_ICONS[0].key,
            weight: 1,
            multiplier: 1,
            enabled: true,
          },
        ],
      },
    });
  }

  function removePrize(index: number) {
    if (!strategies || strategies.lottery.prizes.length <= 2) return;
    setStrategies({
      ...strategies,
      lottery: {
        ...strategies.lottery,
        prizes: strategies.lottery.prizes.filter((_, prizeIndex) => prizeIndex !== index),
      },
    });
  }

  if (loading || !strategies) {
    return <Card className="admin-workspace-card">正在加载灵点策略…</Card>;
  }

  return (
    <div className="reward-strategy-grid">
      <Card className="admin-settings-card reward-strategy-card">
        <div className="strategy-card-heading">
          <div>
            <p className="lumina-kicker">DAILY REWARD</p>
            <Title color="app-teal">每日灵点补给</Title>
          </div>
          <Switch
            checked={strategies.daily.enabled}
            checkedChildren="启用"
            unCheckedChildren="停用"
            onChange={(enabled) =>
              setStrategies({ ...strategies, daily: { ...strategies.daily, enabled } })
            }
          />
        </div>
        <p className="lumina-description">用户每天可以在指定范围内随机获得整数灵点。</p>
        <Divider type="dashed-brown" />
        <div className="strategy-number-grid">
          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="daily-minimum">最低获得</label>
            <Input
              id="daily-minimum"
              type="number"
              min={1}
              max={100}
              step={1}
              value={strategies.daily.minimum}
              onChange={(event) =>
                setStrategies({
                  ...strategies,
                  daily: {
                    ...strategies.daily,
                    minimum: parseNumericInput(event.target.value),
                  },
                })
              }
              suffix="灵点"
              shadow
            />
          </div>
          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="daily-maximum">最高获得</label>
            <Input
              id="daily-maximum"
              type="number"
              min={1}
              max={100}
              step={1}
              value={strategies.daily.maximum}
              onChange={(event) =>
                setStrategies({
                  ...strategies,
                  daily: {
                    ...strategies.daily,
                    maximum: parseNumericInput(event.target.value),
                  },
                })
              }
              suffix="灵点"
              shadow
            />
          </div>
        </div>
        <div className="strategy-note">
          每日 00:00 重置，时区由部署环境中的 <code>TZ</code> 决定。上下限相同时为固定奖励。
        </div>
        <Button
          type="primary"
          size="large"
          block
          loading={saving === "daily"}
          disabled={saving !== null}
          onClick={() => void saveStrategy("daily")}
        >
          保存补给策略
        </Button>
      </Card>

      <Card className="admin-settings-card reward-strategy-card lottery-strategy-card">
        <div className="strategy-card-heading">
          <div>
            <p className="lumina-kicker">LOTTERY POLICY</p>
            <Title color="app-yellow">灵光机策略</Title>
          </div>
          <Switch
            checked={strategies.lottery.enabled}
            checkedChildren="启用"
            unCheckedChildren="停用"
            onChange={(enabled) =>
              setStrategies({
                ...strategies,
                lottery: { ...strategies.lottery, enabled },
              })
            }
          />
        </div>
        <p className="lumina-description">用户可以在限制范围内决定下注灵点，奖励按照下注数量乘以奖项倍率计算。</p>
        <Divider type="dashed-brown" />

        <div className="strategy-number-grid lottery-bet-limits">
          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="lottery-minimum-bet">最低下注</label>
            <Input
              id="lottery-minimum-bet"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={strategies.lottery.minimumBet}
              suffix="灵点"
              shadow
              onChange={(event) =>
                setStrategies({
                  ...strategies,
                  lottery: {
                    ...strategies.lottery,
                    minimumBet: parseNumericInput(event.target.value),
                  },
                })
              }
            />
          </div>
          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="lottery-maximum-bet">最高下注</label>
            <Input
              id="lottery-maximum-bet"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={strategies.lottery.maximumBet}
              suffix="灵点"
              shadow
              onChange={(event) =>
                setStrategies({
                  ...strategies,
                  lottery: {
                    ...strategies.lottery,
                    maximumBet: parseNumericInput(event.target.value),
                  },
                })
              }
            />
          </div>
        </div>

        <div className="lottery-strategy-toolbar">
          <Tag color="app-yellow" variant="solid">奖励 = 下注 × 倍率</Tag>
          <Button
            size="small"
            disabled={strategies.lottery.prizes.length >= 10}
            onClick={addPrize}
          >
            新增奖项
          </Button>
        </div>

        <div className="strategy-prize-list">
          {strategies.lottery.prizes.map((prize, index) => {
            const icon = getRewardIcon(prize.iconKey);
            return (
              <div className="strategy-prize-row" key={prize.id}>
                <button
                  type="button"
                  className="strategy-icon-trigger"
                  disabled={prize.multiplier === 0}
                  onClick={() => setIconPrizeIndex(index)}
                  aria-label={`选择 ${prize.name} 的图标`}
                >
                  {prize.multiplier === 0 ? <span>混合</span> : <Icon src={icon.src} size={42} />}
                </button>
                <div className="strategy-prize-content">
                  <div className="strategy-prize-topline">
                    <Input
                      size="small"
                      value={prize.name}
                      maxLength={20}
                      aria-label="奖项名称"
                      onChange={(event) => updatePrize(index, { name: event.target.value })}
                    />
                    <div className="strategy-prize-actions">
                      <Switch
                        size="small"
                        checked={prize.enabled}
                        checkedChildren="开"
                        unCheckedChildren="关"
                        onChange={(enabled) => updatePrize(index, { enabled })}
                      />
                      <Button
                        size="small"
                        danger
                        disabled={strategies.lottery.prizes.length <= 2}
                        onClick={() => removePrize(index)}
                      >
                        移除
                      </Button>
                    </div>
                  </div>
                  <div className="strategy-prize-params">
                    <Input
                      size="small"
                      type="number"
                      min={1}
                      max={100000}
                      value={prize.weight}
                      aria-label={`${prize.name}的权重`}
                      prefix="权重"
                      onChange={(event) =>
                        updatePrize(index, {
                          weight: parseNumericInput(event.target.value),
                        })
                      }
                    />
                    <Input
                      size="small"
                      type="number"
                      min={0}
                      max={100}
                      value={prize.multiplier}
                      aria-label={`${prize.name}的倍率`}
                      suffix="倍"
                      onChange={(event) => {
                        const multiplier = parseNumericInput(event.target.value);
                        updatePrize(index, {
                          multiplier,
                          iconKey:
                            multiplier === ""
                              ? prize.iconKey
                              : multiplier > 0
                                ? prize.iconKey ?? REWARD_ICONS[0].key
                                : null,
                        });
                      }}
                    />
                    <div className="strategy-prize-reward">
                      <span>奖励规则</span>
                      <strong>{prize.multiplier === "" ? "—" : prize.multiplier} × 下注</strong>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          type="primary"
          size="large"
          block
          loading={saving === "lottery"}
          disabled={saving !== null}
          onClick={() => void saveStrategy("lottery")}
        >
          保存灵光机策略
        </Button>
      </Card>

      <Modal
        open={iconPrizeIndex !== null}
        title="选择奖项图标"
        width={520}
        footer={null}
        typewriter={false}
        onClose={() => setIconPrizeIndex(null)}
      >
        <div className="reward-icon-picker">
          {REWARD_ICONS.map((icon) => (
            <button
              type="button"
              key={icon.key}
              className={
                iconPrizeIndex !== null &&
                strategies.lottery.prizes[iconPrizeIndex]?.iconKey === icon.key
                  ? "is-selected"
                  : ""
              }
              onClick={() => {
                if (iconPrizeIndex !== null) updatePrize(iconPrizeIndex, { iconKey: icon.key });
                setIconPrizeIndex(null);
              }}
            >
              <Icon src={icon.src} size={52} />
              <span>{icon.label}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
