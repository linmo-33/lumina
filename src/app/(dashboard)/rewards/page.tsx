"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppLoading, AppShell } from "@/components/app-shell";
import { notify } from "@/components/app-notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { formatPoints } from "@/lib/points";
import {
  LotteryMachine,
  type PublicLotteryPolicy,
} from "@/app/(dashboard)/rewards/lottery-machine";
import { CalendarCheck2, Check, Gift, LoaderCircle } from "lucide-react";

interface RewardData {
  balance: number;
  daily: {
    enabled: boolean;
    claimed: boolean;
    reward: number | null;
    claimedAt?: string | null;
  };
  lottery: PublicLotteryPolicy;
}

interface DailyRewardCardProps {
  daily: RewardData["daily"];
  claiming: boolean;
  onClaim: () => void;
}

function DailyRewardCard({ daily, claiming, onClaim }: DailyRewardCardProps) {
  return (
    <Card size="sm" className="orchard-daily-card">
      <CardContent className="orchard-daily-content">
        <span className="orchard-daily-icon"><CalendarCheck2 /></span>
        <div className="orchard-daily-copy">
          <span>每日签到</span>
          <strong>
            {daily.claimed
              ? `今日获得 ${formatPoints(daily.reward ?? 0)} 灵点`
              : daily.enabled ? "领取今日灵点补给" : "签到暂未开放"}
          </strong>
        </div>
        {daily.claimed ? (
          <Badge variant="success"><Check data-icon="inline-start" />已领取</Badge>
        ) : daily.enabled ? (
          <Button size="sm" onClick={onClaim} disabled={claiming}>
            {claiming
              ? <LoaderCircle className="animate-spin" data-icon="inline-start" />
              : <Gift data-icon="inline-start" />}
            签到领取
          </Button>
        ) : (
          <Badge variant="outline">未开放</Badge>
        )}
      </CardContent>
    </Card>
  );
}

export default function RewardsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [rewards, setRewards] = useState<RewardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/rewards");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "游戏数据加载失败");
      setRewards(payload.data as RewardData);
    } catch (error) {
      notify.error({
        key: "game-load",
        message: "游戏数据加载失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, router, session]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, session]);

  const updateBalance = useCallback((balance: number) => {
    setRewards((current) => current ? { ...current, balance } : current);
  }, []);

  const refreshAfterSpin = useCallback(async () => {
    await load(false);
  }, [load]);

  async function claimDaily() {
    setClaiming(true);
    try {
      const response = await fetch("/api/rewards/daily", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "领取失败");
      notify.success({
        key: "daily",
        message: `获得 ${formatPoints(payload.data.reward)} 灵点`,
        position: "topRight",
      });
      await load(false);
    } catch (error) {
      notify.error({
        key: "daily",
        message: "领取失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setClaiming(false);
    }
  }

  if (isPending || !session || loading || !rewards) {
    return <AppLoading label={session ? "正在加载游戏…" : "正在前往登录页…"} />;
  }

  const user = session.user as NonNullable<typeof session>["user"] & {
    quota?: number;
    role?: string;
    image?: string | null;
  };

  return (
    <AppShell active="rewards" user={user} quota={rewards.balance}>
      <LotteryMachine
        balance={rewards.balance}
        policy={rewards.lottery}
        dailyReward={(
          <DailyRewardCard
            daily={rewards.daily}
            claiming={claiming}
            onClaim={() => void claimDaily()}
          />
        )}
        onBalanceChange={updateBalance}
        onSettled={refreshAfterSpin}
      />
    </AppShell>
  );
}
