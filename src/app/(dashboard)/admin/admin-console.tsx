"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { notify } from "@/components/app-notifications";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronLeft, CircleAlert, Gauge, Gift, History, Images, LayoutDashboard, LoaderCircle, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Users, WalletCards } from "lucide-react";
import { RewardStrategyPanel } from "./reward-strategy-panel";
import { CHATGPT2API_PAGE_MAX_IMAGES, CHATGPT2API_QUALITY_OPTIONS, CHATGPT2API_SIZE_OPTIONS, isImageSizeAllowedForModel } from "@/lib/image-options";
import { cn } from "@/lib/utils";

export type AdminSection = "overview" | "users" | "quota" | "usage" | "strategies" | "settings";
interface UserRow { id: string; name: string; email: string; role: string; quota: number; used: number; isActive: boolean; createdAt: string }
interface UsageRow { id: string; userName: string; userEmail: string; type: string; model: string; prompt: string; size: string | null; quality: string | null; imageUrl: string | null; cost: number; status: string; errorMsg: string | null; createdAt: string }
interface QuotaLog { id: string; change: number; reason: string; operatorId: string | null; createdAt: string }
interface QuotaHistoryData { target: UserRow; recentQuotaLogs: QuotaLog[] }
interface Settings { defaultModel: string; allowedModels: string[]; defaultSize: string; allowedSizes: string[]; defaultQuality: string; allowedQualities: string[]; maxImagesPerRequest: number; promptMaxLength: number; defaultUserQuota: number }
interface TrendPoint { day: string; total: number; cost: number }
interface TypePoint { type: string; total: number }
const nav = [{ key: "overview", label: "总览", icon: LayoutDashboard }, { key: "users", label: "用户管理", icon: Users }, { key: "quota", label: "额度管理", icon: WalletCards }, { key: "usage", label: "调用记录", icon: Images }, { key: "strategies", label: "奖励策略", icon: Gift }, { key: "settings", label: "系统配置", icon: Settings2 }] as const;
const fmt = (value: string | Date) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const quotaReasonLabels: Record<string, string> = {
  initial_setup: "初始化额度",
  register: "注册奖励",
  generate: "文生图消耗",
  edit: "图生图消耗",
  admin_recharge: "管理员增加",
  admin_deduct: "管理员扣减",
  daily_reward: "每日奖励",
  lottery_cost: "灵光机抽取消耗",
  lottery_reward: "灵光机奖励",
};
const quotaReasonLabel = (reason: string) => reason.startsWith("challenge_") ? "挑战奖励" : (quotaReasonLabels[reason] ?? reason);

function buildTableHref(
  section: AdminSection,
  page: number,
  pageSize: number,
  search: string,
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const normalizedSearch = search.trim();
  if (normalizedSearch) params.set("q", normalizedSearch);
  return `/admin/${section}?${params.toString()}`;
}

export default function AdminConsole({
  section,
  initialPage = 1,
  initialPageSize = 10,
  initialSearch = "",
}: {
  section: AdminSection;
  initialPage?: number;
  initialPageSize?: number;
  initialSearch?: string;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [usageTotal, setUsageTotal] = useState(0);
  const [userSummary, setUserSummary] = useState({ total: 0, active: 0, totalQuota: 0 });
  const [usageSummary, setUsageSummary] = useState({ total: 0, success: 0, failed: 0, totalCost: 0 });
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [typeDistribution, setTypeDistribution] = useState<TypePoint[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [selectedUsage, setSelectedUsage] = useState<UsageRow | null>(null);
  const [quotaInputs, setQuotaInputs] = useState<Record<string, string>>({});
  const [adjustingQuotaUserId, setAdjustingQuotaUserId] = useState<string | null>(null);
  const [quotaHistoryTarget, setQuotaHistoryTarget] = useState<UserRow | null>(null);
  const [quotaHistory, setQuotaHistory] = useState<QuotaHistoryData | null>(null);
  const [quotaHistoryLoading, setQuotaHistoryLoading] = useState(false);
  const [searchDraft, setSearchDraft] = useState(initialSearch);
  const [saving, setSaving] = useState(false);
  const currentUser = session?.user as
    | (NonNullable<typeof session>["user"] & { role?: string; quota?: number })
    | undefined;
  const active = nav.find((item) => item.key === section) ?? nav[0];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const userParams = new URLSearchParams({
        page: String(initialPage),
        pageSize: String(initialPageSize),
      });
      const usageParams = new URLSearchParams({
        page: String(initialPage),
        pageSize: String(initialPageSize),
      });
      if ((section === "users" || section === "quota") && initialSearch) {
        userParams.set("q", initialSearch);
      }
      if (section === "usage" && initialSearch) {
        usageParams.set("q", initialSearch);
      }

      const [userResponse, usageResponse, settingsResponse] = await Promise.all([
        fetch(`/api/admin/users?${userParams.toString()}`),
        fetch(`/api/admin/usage?${usageParams.toString()}`),
        fetch("/api/admin/settings"),
      ]);
      const [userPayload, usagePayload, settingsPayload] = await Promise.all([
        userResponse.json(),
        usageResponse.json(),
        settingsResponse.json(),
      ]);
      if (!userResponse.ok || !usageResponse.ok) {
        throw new Error(userPayload.error || usagePayload.error || "后台数据加载失败");
      }
      setUsers(userPayload.data ?? []);
      setUserTotal(Number(userPayload.total ?? 0));
      setUserSummary(userPayload.summary ?? { total: 0, active: 0, totalQuota: 0 });
      setUsage(usagePayload.data ?? []);
      setUsageTotal(Number(usagePayload.total ?? 0));
      setUsageSummary(usagePayload.summary ?? { total: 0, success: 0, failed: 0, totalCost: 0 });
      setTrend(usagePayload.trend ?? []);
      setTypeDistribution(usagePayload.typeDistribution ?? []);
      if (settingsPayload.success) setSettings(settingsPayload.data);
    } catch (error) {
      notify.error({
        key: "admin-load",
        message: "后台数据加载失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setLoading(false);
    }
  }, [initialPage, initialPageSize, initialSearch, section]);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (currentUser?.role !== "admin") {
      router.replace("/generate");
      return;
    }
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [isPending, session, currentUser?.role, router, load]);

  async function userAction(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "操作失败");
    await load();
  }

  async function openQuotaHistory(target: UserRow) {
    setQuotaHistoryTarget(target);
    setQuotaHistoryLoading(true);
    try {
      const response = await fetch(`/api/admin/users?userId=${encodeURIComponent(target.id)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "额度记录加载失败");
      setQuotaHistory({
        target: payload.data.target,
        recentQuotaLogs: payload.data.recentQuotaLogs ?? [],
      });
    } catch (error) {
      setQuotaHistory(null);
      notify.error({
        key: "quota-history",
        message: "额度记录加载失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setQuotaHistoryLoading(false);
    }
  }

  async function adjustQuota(target: UserRow, delta: number) {
    setAdjustingQuotaUserId(target.id);
    try {
      await userAction({ action: "quota", userId: target.id, delta });
      setQuotaInputs((current) => ({ ...current, [target.id]: "" }));
      notify.success({
        key: "quota-action",
        message: delta > 0 ? `已增加 ${delta} 灵点` : `已扣减 ${Math.abs(delta)} 灵点`,
        position: "topRight",
      });
      if (quotaHistoryTarget?.id === target.id) await openQuotaHistory(target);
    } catch (error) {
      notify.error({
        key: "quota-action",
        message: "额度调整失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setAdjustingQuotaUserId(null);
    }
  }

  function applyCustomQuota(target: UserRow, direction: 1 | -1) {
    const amount = Number(quotaInputs[target.id]);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) {
      notify.error({
        key: "custom-quota",
        message: "请输入有效额度",
        description: "额度必须是 1 至 100000 之间的整数",
        position: "topRight",
      });
      return;
    }
    void adjustQuota(target, amount * direction);
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "保存失败");
      setSettings(payload.data);
      notify.success({ key: "admin-settings", message: "系统配置已保存", position: "topRight" });
    } catch (error) {
      notify.error({
        key: "admin-settings",
        message: "保存失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setSaving(false);
    }
  }

  if (isPending || !session || currentUser?.role !== "admin") {
    return <div className="grid min-h-screen place-items-center"><LoaderCircle className="size-8 animate-spin text-primary" /></div>;
  }

  const successRate = usageSummary.total
    ? Math.round((usageSummary.success / usageSummary.total) * 100)
    : 0;
  const tableControls = {
    page: initialPage,
    pageSize: initialPageSize,
    search: searchDraft,
    activeSearch: initialSearch,
    loading,
    onSearchChange: setSearchDraft,
    onSearch: (search: string) => router.push(buildTableHref(section, 1, initialPageSize, search)),
    onPageSizeChange: (pageSize: number) => router.push(buildTableHref(section, 1, pageSize, initialSearch)),
    getPageHref: (page: number) => buildTableHref(section, page, initialPageSize, initialSearch),
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-brand"><Sparkles /><span>Lumina Admin</span></Link>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return <Link key={item.key} href={item.key === "overview" ? "/admin" : `/admin/${item.key}`} className={section === item.key ? "is-active" : ""}><Icon /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="admin-sidebar-status"><span className="size-2 rounded-full bg-emerald-500" />后台数据已连接</div>
        <div className="admin-sidebar-user"><Avatar><AvatarFallback>{(currentUser.name || "A").slice(0, 1)}</AvatarFallback></Avatar><div><strong>{currentUser.name || "Admin"}</strong><span>超级管理员</span></div></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><ChevronLeft className="size-4" />{active.label}</div>
          <div className="admin-topbar-actions"><Avatar className="size-8"><AvatarFallback>{(currentUser.name || "A").slice(0, 1)}</AvatarFallback></Avatar></div>
        </header>
        <main className="admin-content">
          <div className="admin-heading">
            <div><h1>{active.label}</h1><span>{active.key === "overview" ? "查看系统真实业务数据" : "管理 Lumina 的运营数据与配置"}</span></div>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}刷新数据</Button>
          </div>
          {section === "overview" ? (
            <section className="admin-stat-grid">
              <Metric label="用户总数" value={userSummary.total.toLocaleString()} icon={<Users />} note={`${userSummary.active.toLocaleString()} 个账号正常`} />
              <Metric label="可用灵点" value={userSummary.totalQuota.toLocaleString()} icon={<Sparkles />} note="当前用户余额总和" />
              <Metric label="调用记录" value={usageSummary.total.toLocaleString()} icon={<Images />} note={`成功率 ${successRate}%`} />
              <Metric label="失败调用" value={usageSummary.failed.toLocaleString()} icon={<CircleAlert />} note="查看调用记录定位错误" />
            </section>
          ) : null}
          {section === "overview" && <Overview userSummary={userSummary} usageSummary={usageSummary} successRate={successRate} trend={trend} typeDistribution={typeDistribution} />}
          {section === "users" && <UserPanel {...tableControls} rows={users} total={userTotal} onSelect={setSelectedUser} onAction={async (row, action) => { try { await userAction({ action: "status", userId: row.id, isActive: action === "activate" }); notify.success({ key: "user-action", message: action === "activate" ? "用户已恢复" : "用户已封禁", position: "topRight" }); } catch (error) { notify.error({ key: "user-action", message: "操作失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" }); } }} />}
          {section === "quota" && <QuotaPanel {...tableControls} rows={users} total={userTotal} quotaInputs={quotaInputs} adjustingQuotaUserId={adjustingQuotaUserId} onQuotaInputChange={(userId, value) => setQuotaInputs((current) => ({ ...current, [userId]: value }))} onAction={(row, delta) => void adjustQuota(row, delta)} onCustomAction={applyCustomQuota} onHistory={(row) => void openQuotaHistory(row)} />}
          {section === "usage" && <UsagePanel {...tableControls} rows={usage} total={usageTotal} onSelect={setSelectedUsage} />}
          {section === "strategies" && <RewardStrategyPanel />}
          {section === "settings" && settings && <SettingsPanel value={settings} onChange={setSettings} onSave={() => void saveSettings()} saving={saving} />}
        </main>
      </div>
      <Sheet open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-md">
          <SheetHeader className="shrink-0 border-b px-5 py-4">
            <SheetTitle>用户详情</SheetTitle>
          </SheetHeader>
          {selectedUser ? (
            <ScrollArea className="min-h-0 flex-1">
              <div className="grid gap-5 p-5">
                <div className="flex items-center gap-3">
                  <Avatar className="size-12"><AvatarFallback>{selectedUser.name.slice(0, 1)}</AvatarFallback></Avatar>
                  <div className="min-w-0"><strong>{selectedUser.name}</strong><p className="truncate text-sm text-muted-foreground">{selectedUser.email}</p></div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="当前灵点" value={String(selectedUser.quota)} icon={<Sparkles />} note="可用于图像生成" />
                  <Metric label="累计使用" value={String(selectedUser.used)} icon={<Gauge />} note="历史总消耗" />
                </div>
                <Button variant={selectedUser.isActive ? "destructive" : "default"} onClick={() => void userAction({ action: "status", userId: selectedUser.id, isActive: !selectedUser.isActive }).then(() => setSelectedUser(null))}>{selectedUser.isActive ? "封禁用户" : "恢复用户"}</Button>
              </div>
            </ScrollArea>
          ) : null}
        </SheetContent>
      </Sheet>
      <Sheet open={Boolean(quotaHistoryTarget)} onOpenChange={(open) => {
        if (!open) {
          setQuotaHistoryTarget(null);
          setQuotaHistory(null);
        }
      }}>
        <SheetContent className="gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b px-5 py-4">
            <SheetTitle>额度记录</SheetTitle>
          </SheetHeader>
          {quotaHistoryLoading ? (
            <div className="grid min-h-48 flex-1 place-items-center"><LoaderCircle className="size-7 animate-spin text-primary" /></div>
          ) : quotaHistory ? (
            <ScrollArea className="min-h-0 flex-1">
              <div className="grid gap-5 p-5">
                <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-10"><AvatarFallback>{quotaHistory.target.name.slice(0, 1)}</AvatarFallback></Avatar>
                    <div className="min-w-0"><strong>{quotaHistory.target.name}</strong><p className="truncate text-sm text-muted-foreground">{quotaHistory.target.email}</p></div>
                  </div>
                  <div className="shrink-0 text-right"><span className="block text-xs text-muted-foreground">当前额度</span><strong className="text-lg text-primary">{quotaHistory.target.quota} ✦</strong></div>
                </div>
                <div className="grid gap-3">
                  <div><h3 className="font-semibold">最近变动</h3><p className="text-sm text-muted-foreground">展示最近 20 条额度记录</p></div>
                  {quotaHistory.recentQuotaLogs.length ? quotaHistory.recentQuotaLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-4 rounded-xl border p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={log.change > 0 ? "secondary" : "destructive"}>{log.change > 0 ? "+" : ""}{log.change}</Badge>
                          <strong className="text-sm">{quotaReasonLabel(log.reason)}</strong>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{log.operatorId ? "管理员操作" : "系统记录"}</p>
                      </div>
                      <time className="shrink-0 text-right text-xs text-muted-foreground">{fmt(log.createdAt)}</time>
                    </div>
                  )) : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">暂无额度记录</p>}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="grid min-h-48 flex-1 place-items-center px-5 text-sm text-muted-foreground">记录加载失败，请关闭后重试</div>
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={Boolean(selectedUsage)} onOpenChange={(open) => !open && setSelectedUsage(null)}>
        <SheetContent className="gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b px-5 py-4">
            <SheetTitle>调用详情</SheetTitle>
          </SheetHeader>
          {selectedUsage ? (
            <ScrollArea className="min-h-0 flex-1">
              <div className="grid min-w-0 gap-5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">{selectedUsage.userName}</h3>
                    <p className="truncate text-sm text-muted-foreground">{selectedUsage.userEmail}</p>
                  </div>
                  <Badge variant={selectedUsage.status === "success" ? "secondary" : "destructive"}>{selectedUsage.status === "success" ? "成功" : "失败"}</Badge>
                </div>
                <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
                  <div className="grid gap-1"><span className="text-xs text-muted-foreground">模型</span><strong className="break-words text-sm font-medium">{selectedUsage.model}</strong></div>
                  <div className="grid gap-1"><span className="text-xs text-muted-foreground">类型</span><strong className="text-sm font-medium">{selectedUsage.type === "edit" ? "图生图" : "文生图"}</strong></div>
                  <div className="grid gap-1"><span className="text-xs text-muted-foreground">尺寸</span><strong className="text-sm font-medium">{selectedUsage.size ?? "自动"}</strong></div>
                  <div className="grid gap-1"><span className="text-xs text-muted-foreground">时间</span><strong className="text-sm font-medium">{fmt(selectedUsage.createdAt)}</strong></div>
                </div>
                <div className="min-w-0">
                  <Label>完整提示词</Label>
                  <pre className="mt-2 max-w-full whitespace-pre-wrap break-words rounded-xl bg-muted p-4 font-sans text-sm leading-6">{selectedUsage.prompt}</pre>
                </div>
                {selectedUsage.imageUrl ? <img src={selectedUsage.imageUrl} alt="调用结果" className="h-auto w-full rounded-xl object-contain" /> : null}
              </div>
            </ScrollArea>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Metric({ label, value, icon, note }: { label: string; value: string; icon: React.ReactNode; note: string }) { return <Card className="admin-metric"><span className="admin-metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></Card>; }
function Overview({ userSummary, usageSummary, successRate, trend, typeDistribution }: { userSummary: { total: number; active: number; totalQuota: number }; usageSummary: { total: number; success: number; failed: number; totalCost: number }; successRate: number; trend: TrendPoint[]; typeDistribution: TypePoint[] }) {
  const trendMax = Math.max(...trend.flatMap((item) => [item.total, item.cost]), 1);
  const typeTotal = Math.max(typeDistribution.reduce((sum, item) => sum + item.total, 0), 1);
  return <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><Card><CardHeader><CardTitle>近 7 日调用与消耗</CardTitle></CardHeader><CardContent><div className="grid h-64 grid-cols-7 items-end gap-3 rounded-xl bg-muted/40 p-4">{trend.map((item) => <div key={item.day} className="grid h-full grid-rows-[1fr_auto] gap-2"><div className="flex items-end justify-center gap-1"><span className="w-3 rounded-t bg-primary" title={`${item.total} 次调用`} style={{ height: `${Math.max(item.total / trendMax * 100, item.total ? 5 : 1)}%` }} /><span className="w-3 rounded-t bg-amber-400" title={`${item.cost} 灵点消耗`} style={{ height: `${Math.max(item.cost / trendMax * 100, item.cost ? 5 : 1)}%` }} /></div><span className="text-center text-[10px] text-muted-foreground">{item.day.slice(5)}</span></div>)}</div><div className="mt-3 flex justify-center gap-5 text-xs text-muted-foreground"><span><i className="mr-1 inline-block size-2 rounded-full bg-primary" />调用次数</span><span><i className="mr-1 inline-block size-2 rounded-full bg-amber-400" />灵点消耗</span></div></CardContent></Card><Card><CardHeader><CardTitle>真实运行状态</CardTitle></CardHeader><CardContent className="grid gap-3">{[["数据库数据", `已读取 ${usageSummary.total} 条调用`], ["调用成功率", `${successRate}%`], ["成功输出", `${usageSummary.success} 个`], ["失败记录", `${usageSummary.failed} 条`]].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{label}</span><Badge variant="secondary">{value}</Badge></div>)}</CardContent></Card><Card><CardHeader><CardTitle>调用类型分布</CardTitle></CardHeader><CardContent className="grid gap-4">{typeDistribution.length ? typeDistribution.map((item) => <div key={item.type} className="grid gap-2"><div className="flex justify-between text-sm"><span>{item.type === "edit" ? "图生图" : "文生图"}</span><strong>{item.total} 次</strong></div><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${item.total / typeTotal * 100}%` }} /></div></div>) : <p className="py-10 text-center text-sm text-muted-foreground">暂无调用数据</p>}</CardContent></Card><Card><CardHeader><CardTitle>额度概况</CardTitle></CardHeader><CardContent className="grid gap-3">{[["累计消耗", usageSummary.totalCost], ["可用额度", userSummary.totalQuota], ["活跃账号", userSummary.active]].map(([label, value]) => <div key={label} className="grid grid-cols-[90px_1fr_72px] items-center gap-4 text-sm"><span>{label}</span><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(Number(value) / Math.max(userSummary.totalQuota + usageSummary.totalCost, 1) * 100, 100)}%` }} /></div><strong className="text-right">{Number(value).toLocaleString()}</strong></div>)}<Alert><ShieldCheck className="size-4" /><AlertDescription>统计来自数据库聚合，密钥不会进入后台响应。</AlertDescription></Alert></CardContent></Card></div>;
}
interface TableControlsProps {
  page: number;
  pageSize: number;
  total: number;
  search: string;
  activeSearch: string;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onSearch: (value: string) => void;
  onPageSizeChange: (value: number) => void;
  getPageHref: (page: number) => string;
}

function TableToolbar({
  page,
  pageSize,
  total,
  search,
  activeSearch,
  loading,
  searchPlaceholder,
  onSearchChange,
  onSearch,
  onPageSizeChange,
}: TableControlsProps & { searchPlaceholder: string }) {
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(search);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3 lg:flex-row lg:items-center lg:justify-between">
      <form className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row" onSubmit={submitSearch}>
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="搜索表格数据"
            className="pl-9"
            maxLength={100}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={loading}>搜索</Button>
        {(activeSearch || search) && (
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={() => {
              onSearchChange("");
              onSearch("");
            }}
          >
            重置
          </Button>
        )}
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground lg:justify-end">
        <span>{firstItem}–{lastItem} / 共 {total} 条</span>
        <div className="flex items-center gap-2">
          <span>每页</span>
          <Select
            value={String(pageSize)}
            disabled={loading}
            onValueChange={(value) => value && onPageSizeChange(Number(value))}
          >
            <SelectTrigger size="sm" aria-label="每页显示条数"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[10, 20, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size} 条</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function getPaginationItems(page: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "end-ellipsis", totalPages] as const;
  if (page >= totalPages - 3) return [1, "start-ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
  return [1, "start-ellipsis", page - 1, page, page + 1, "end-ellipsis", totalPages] as const;
}

function TablePager({ page, pageSize, total, loading, getPageHref }: Pick<TableControlsProps, "page" | "pageSize" | "total" | "loading" | "getPageHref">) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = getPaginationItems(page, totalPages);
  const previousDisabled = page <= 1 || loading;
  const nextDisabled = page >= totalPages || loading;

  return (
    <Pagination className="justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            text="上一页"
            href={previousDisabled ? undefined : getPageHref(page - 1)}
            aria-disabled={previousDisabled}
            tabIndex={previousDisabled ? -1 : undefined}
            className={cn(previousDisabled && "pointer-events-none opacity-50")}
          />
        </PaginationItem>
        {items.map((item) => typeof item === "number" ? (
          <PaginationItem key={item}>
            <PaginationLink href={getPageHref(item)} isActive={item === page}>{item}</PaginationLink>
          </PaginationItem>
        ) : (
          <PaginationItem key={item}><PaginationEllipsis /></PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            text="下一页"
            href={nextDisabled ? undefined : getPageHref(page + 1)}
            aria-disabled={nextDisabled}
            tabIndex={nextDisabled ? -1 : undefined}
            className={cn(nextDisabled && "pointer-events-none opacity-50")}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function UserPanel({ rows, total, onSelect, onAction, ...controls }: TableControlsProps & { rows: UserRow[]; onSelect: (row: UserRow) => void; onAction: (row: UserRow, action: "activate" | "block") => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>用户管理</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <TableToolbar {...controls} total={total} searchPlaceholder="搜索姓名、邮箱或用户 ID" />
        <div className="overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>用户</TableHead><TableHead>状态</TableHead><TableHead>角色</TableHead><TableHead>剩余额度</TableHead><TableHead>累计使用</TableHead><TableHead>注册时间</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.length ? rows.map((row) => <TableRow key={row.id}><TableCell><div className="flex items-center gap-2"><Avatar className="size-8"><AvatarFallback>{row.name.slice(0, 1)}</AvatarFallback></Avatar><div><strong>{row.name}</strong><span className="block text-xs text-muted-foreground">{row.email}</span></div></div></TableCell><TableCell><Badge variant={row.isActive ? "secondary" : "destructive"}>{row.isActive ? "正常" : "已封禁"}</Badge></TableCell><TableCell>{row.role === "admin" ? "管理员" : "普通用户"}</TableCell><TableCell>{row.quota} <Sparkles className="inline size-3 text-primary" /></TableCell><TableCell>{row.used}</TableCell><TableCell>{fmt(row.createdAt)}</TableCell><TableCell><Button size="sm" variant="ghost" onClick={() => onSelect(row)}>详情</Button><Button size="sm" variant="ghost" onClick={() => onAction(row, row.isActive ? "block" : "activate")}>{row.isActive ? "封禁" : "恢复"}</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">没有匹配的用户</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <TablePager {...controls} total={total} />
      </CardContent>
    </Card>
  );
}

function QuotaPanel({
  rows,
  total,
  quotaInputs,
  adjustingQuotaUserId,
  onQuotaInputChange,
  onAction,
  onCustomAction,
  onHistory,
  ...controls
}: TableControlsProps & {
  rows: UserRow[];
  quotaInputs: Record<string, string>;
  adjustingQuotaUserId: string | null;
  onQuotaInputChange: (userId: string, value: string) => void;
  onAction: (row: UserRow, delta: number) => void;
  onCustomAction: (row: UserRow, direction: 1 | -1) => void;
  onHistory: (row: UserRow) => void;
}) {
  const actionsDisabled = adjustingQuotaUserId !== null;

  return (
    <Card>
      <CardHeader><CardTitle>额度管理</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <TableToolbar {...controls} total={total} searchPlaceholder="搜索姓名、邮箱或用户 ID" />
        <div className="overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>用户</TableHead><TableHead>当前余额</TableHead><TableHead>累计使用</TableHead><TableHead>快捷调整</TableHead><TableHead>自定义调整</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.length ? rows.map((row) => {
                const inputValue = quotaInputs[row.id] ?? "";
                const inputAmount = Number(inputValue);
                const inputInvalid = inputValue !== "" && (!Number.isSafeInteger(inputAmount) || inputAmount < 1 || inputAmount > 100000);
                const adjusting = adjustingQuotaUserId === row.id;
                return (
                  <TableRow key={row.id}>
                    <TableCell><div><strong>{row.name}</strong><span className="block text-xs text-muted-foreground">{row.email}</span></div></TableCell>
                    <TableCell className="font-semibold text-primary">{row.quota} ✦</TableCell>
                    <TableCell>{row.used}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" disabled={actionsDisabled} onClick={() => onAction(row, -10)}>-10</Button>
                        <Button size="sm" variant="outline" disabled={actionsDisabled} onClick={() => onAction(row, 10)}>+10</Button>
                        <Button size="sm" disabled={actionsDisabled} onClick={() => onAction(row, 50)}>+50</Button>
                        {adjusting ? <LoaderCircle className="size-4 animate-spin text-primary" /> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Field orientation="horizontal" data-invalid={inputInvalid} className="min-w-72">
                        <FieldLabel htmlFor={`quota-${row.id}`} className="sr-only">自定义额度</FieldLabel>
                        <Input
                          id={`quota-${row.id}`}
                          type="number"
                          min={1}
                          max={100000}
                          step={1}
                          inputMode="numeric"
                          aria-invalid={inputInvalid}
                          className="w-28"
                          placeholder="输入额度"
                          value={inputValue}
                          disabled={actionsDisabled}
                          onChange={(event) => onQuotaInputChange(row.id, event.target.value)}
                        />
                        <Button size="sm" variant="outline" disabled={actionsDisabled || !inputValue || inputInvalid} onClick={() => onCustomAction(row, -1)}>扣减</Button>
                        <Button size="sm" disabled={actionsDisabled || !inputValue || inputInvalid} onClick={() => onCustomAction(row, 1)}>增加</Button>
                      </Field>
                    </TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => onHistory(row)}><History data-icon="inline-start" />记录</Button></TableCell>
                  </TableRow>
                );
              }) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">没有匹配的用户</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <TablePager {...controls} total={total} />
      </CardContent>
    </Card>
  );
}

function UsagePanel({ rows, total, onSelect, ...controls }: TableControlsProps & { rows: UsageRow[]; onSelect: (row: UsageRow) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>调用记录</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <TableToolbar {...controls} total={total} searchPlaceholder="搜索记录 ID、用户、模型或提示词" />
        <div className="overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>记录 ID</TableHead><TableHead>用户</TableHead><TableHead>类型</TableHead><TableHead>模型</TableHead><TableHead>状态</TableHead><TableHead>消耗</TableHead><TableHead>创建时间</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.length ? rows.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.id.slice(0, 18)}</TableCell><TableCell>{row.userName}</TableCell><TableCell>{row.type === "edit" ? "图生图" : "文生图"}</TableCell><TableCell>{row.model}</TableCell><TableCell><Badge variant={row.status === "success" ? "secondary" : "destructive"}>{row.status === "success" ? "成功" : "失败"}</Badge></TableCell><TableCell>{row.cost}</TableCell><TableCell>{fmt(row.createdAt)}</TableCell><TableCell><Button size="sm" variant="ghost" onClick={() => onSelect(row)}>查看</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">没有匹配的调用记录</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <TablePager {...controls} total={total} />
      </CardContent>
    </Card>
  );
}
function SettingsPanel({
  value,
  onChange,
  onSave,
  saving,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const sizeOptions = CHATGPT2API_SIZE_OPTIONS.filter(
    (item) => value.allowedSizes.includes(item.value) && isImageSizeAllowedForModel(item.value, value.defaultModel),
  );
  const qualityOptions = CHATGPT2API_QUALITY_OPTIONS.filter((item) => value.allowedQualities.includes(item.value));

  function changeDefaultModel(defaultModel: string) {
    const compatibleSizes = CHATGPT2API_SIZE_OPTIONS.filter(
      (item) => value.allowedSizes.includes(item.value) && isImageSizeAllowedForModel(item.value, defaultModel),
    );
    const defaultSize = compatibleSizes.some((item) => item.value === value.defaultSize)
      ? value.defaultSize
      : (compatibleSizes[0]?.value ?? value.defaultSize);
    onChange({ ...value, defaultModel, defaultSize });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>生成模型</CardTitle></CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>默认模型</FieldLabel>
              <Select value={value.defaultModel} onValueChange={(next) => next && changeDefaultModel(next)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false} className="min-w-72">
                  <SelectGroup>{value.allowedModels.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="allowed-models">可用模型（逗号分隔）</FieldLabel>
              <Input id="allowed-models" value={value.allowedModels.join(", ")} onChange={(event) => onChange({ ...value, allowedModels: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
              <FieldDescription>模型 ID 会进入白名单，并原样传递给兼容 Images API。</FieldDescription>
            </Field>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>默认尺寸</FieldLabel>
                <Select value={value.defaultSize} onValueChange={(next) => next && onChange({ ...value, defaultSize: next })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false} className="min-w-72 max-w-[calc(100vw-2rem)]">
                    <SelectGroup>{sizeOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>仅显示当前模型支持且已允许的尺寸。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>默认质量</FieldLabel>
                <Select value={value.defaultQuality} onValueChange={(next) => next && onChange({ ...value, defaultQuality: next })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false} className="min-w-48">
                    <SelectGroup>{qualityOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>限制与用户默认值</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="max-images">单次最大图片数</FieldLabel>
              <Input id="max-images" type="number" min={1} max={CHATGPT2API_PAGE_MAX_IMAGES} value={value.maxImagesPerRequest} onChange={(event) => onChange({ ...value, maxImagesPerRequest: Number(event.target.value) })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="prompt-max-length">提示词最大字符数</FieldLabel>
              <Input id="prompt-max-length" type="number" value={value.promptMaxLength} onChange={(event) => onChange({ ...value, promptMaxLength: Number(event.target.value) })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="default-user-quota">新用户初始灵点</FieldLabel>
              <Input id="default-user-quota" type="number" value={value.defaultUserQuota} onChange={(event) => onChange({ ...value, defaultUserQuota: Number(event.target.value) })} />
            </Field>
          </FieldGroup>
          <Alert><ShieldCheck className="size-4" /><AlertDescription>API 密钥、认证密钥和服务地址继续由环境变量管理。</AlertDescription></Alert>
          <Button onClick={onSave} disabled={saving}>{saving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}保存系统配置</Button>
        </CardContent>
      </Card>
    </div>
  );
}
