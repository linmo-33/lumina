"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppLoading, AppShell } from "@/components/app-shell";
import { notify } from "@/components/app-notifications";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, ImageIcon, Sparkles } from "lucide-react";

interface ProfileData { balance: number; logs: Array<{ id: string; change: number; reason: string; createdAt: string }>; }
interface Work { id: string; prompt: string; imageUrl: string | null; createdAt: string; type: string; }

const quotaReasonLabels: Record<string, string> = {
  initial_setup: "首次部署初始灵点",
  register: "注册赠送灵点",
  generate: "图片生成消耗",
  edit: "图片编辑消耗",
  admin_recharge: "管理员增加灵点",
  admin_deduct: "管理员扣减灵点",
  daily_reward: "每日签到奖励",
  lottery_cost: "灵光机抽取消耗",
  lottery_reward: "灵光机奖励",
};

const quotaTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getQuotaReasonLabel(reason: string) {
  return quotaReasonLabels[reason] ?? "其他灵点变动";
}

function formatQuotaTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : quotaTimeFormatter.format(date);
}

export default function ProfilePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!isPending && !session) router.replace("/login"); }, [isPending, session, router]);
  useEffect(() => {
    if (!session) return;
    Promise.all([fetch("/api/rewards"), fetch("/api/images/history?page=1&pageSize=6")]).then(async ([reward, history]) => { const rewardPayload = await reward.json(); const historyPayload = await history.json(); if (!reward.ok || !history.ok) throw new Error("个人数据加载失败"); setProfile(rewardPayload.data); setWorks(historyPayload.data ?? []); }).catch((error) => notify.error({ key: "profile", message: "个人数据加载失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" })).finally(() => setLoading(false));
  }, [session]);
  if (isPending || !session || loading || !profile) return <AppLoading label={session ? "正在加载个人中心…" : "正在前往登录页…"} />;
  const user = session.user as typeof session.user & { quota?: number; role?: string; image?: string | null };
  return (
    <AppShell active="profile" user={user} quota={profile.balance}>
      <div className="lumina-page-heading">
        <div>
          <p className="lumina-eyebrow">YOUR SPACE</p>
          <h1>个人中心</h1>
          <p>管理你的账号和创作足迹</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_1.5fr]">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:text-left">
            <Avatar className="size-24 border-4 border-accent">
              <AvatarImage src={user.image ?? undefined} alt="" />
              <AvatarFallback className="text-2xl">{(user.name || "L").slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{user.name || "Lumina 创作者"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Badge variant="secondary">{user.role === "admin" ? "管理员" : "创作者"}</Badge>
                <Badge variant="outline">账号正常</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lumina-profile-balance-card">
          <CardHeader className="lumina-profile-balance-header">
            <CardTitle>灵点余额</CardTitle>
            <CardDescription>用于图片创作与灵光机</CardDescription>
            <CardAction className="lumina-profile-balance-icon"><Sparkles /></CardAction>
          </CardHeader>
          <CardContent className="lumina-profile-balance-content">
            <div className="lumina-profile-balance-value">
              <strong>{profile.balance}</strong>
              <span>灵点</span>
            </div>
          </CardContent>
          <CardFooter className="lumina-profile-balance-footer">
            <span>余额会随消费与奖励实时变化</span>
            <Link href="/rewards" className="lumina-profile-balance-link">
              获取更多灵点 <ArrowRight />
            </Link>
          </CardFooter>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><ImageIcon className="size-5 text-primary" />最近作品</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push("/gallery")}>查看全部 <ArrowRight data-icon="inline-end" /></Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {works.filter((work) => work.imageUrl).map((work) => <Link key={work.id} href="/gallery" className="group overflow-hidden rounded-lg border"><img src={work.imageUrl!} alt={work.prompt} className="aspect-square w-full object-cover transition group-hover:scale-105" /></Link>)}
              {works.length === 0 && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">还没有作品，去创作第一幅吧。</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" />灵点明细</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-1">
              {profile.logs.slice(0, 8).map((log) => <div key={log.id} className="flex items-center justify-between border-b py-3 text-sm last:border-0"><span><strong className="block font-medium">{getQuotaReasonLabel(log.reason)}</strong><time dateTime={log.createdAt} className="text-xs text-muted-foreground">{formatQuotaTime(log.createdAt)}</time></span><b className={log.change > 0 ? "text-emerald-600" : "text-rose-600"}>{log.change > 0 ? "+" : ""}{log.change}</b></div>)}
              {profile.logs.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">暂无灵点记录</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
