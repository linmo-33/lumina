"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { notify } from "@/components/app-notifications";
import { NumericInput } from "@/components/numeric-input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, ChevronLeft, CircleAlert, Gauge, Gift, History, Images, KeyRound, LayoutDashboard, LoaderCircle, RefreshCw, Search, Server, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, Users, WalletCards, WandSparkles } from "lucide-react";
import { RewardStrategyPanel } from "./reward-strategy-panel";
import { CHATGPT2API_PAGE_MAX_IMAGES, CHATGPT2API_QUALITY_OPTIONS, CHATGPT2API_SIZE_OPTIONS, isImageSizeAllowedForModel } from "@/lib/image-options";
import { cn } from "@/lib/utils";

export type AdminSection = "overview" | "users" | "quota" | "usage" | "strategies" | "settings";
interface UserRow { id: string; name: string; email: string; role: string; quota: number; used: number; isActive: boolean; createdAt: string }
interface UsageRow { id: string; userName: string; userEmail: string; type: string; model: string; prompt: string; size: string | null; quality: string | null; imageUrl: string | null; cost: number; status: string; errorMsg: string | null; createdAt: string }
interface QuotaLog { id: string; change: number; reason: string; operatorId: string | null; createdAt: string }
interface QuotaHistoryData { target: UserRow; recentQuotaLogs: QuotaLog[] }
interface Settings { defaultModel: string; allowedModels: string[]; defaultSize: string; allowedSizes: string[]; defaultQuality: string; allowedQualities: string[]; maxImagesPerRequest: number; promptMaxLength: number; defaultUserQuota: number }
interface ProviderSettings { name: string; providerType: "openai_compatible"; baseUrl: string; apiKeyConfigured: boolean; apiKeyHint: string | null; modelIds: string[]; modelsUpdatedAt: string | null; source: "database" | "environment" | "default" }
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
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState<ProviderSettings | null>(null);
  const [savedProvider, setSavedProvider] = useState<ProviderSettings | null>(null);
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
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerSaving, setProviderSaving] = useState(false);
  const [modelsRefreshing, setModelsRefreshing] = useState(false);
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

      const [userResponse, usageResponse, settingsResponse, providerResponse] = await Promise.all([
        fetch(`/api/admin/users?${userParams.toString()}`),
        fetch(`/api/admin/usage?${usageParams.toString()}`),
        fetch("/api/admin/settings"),
        fetch("/api/admin/provider"),
      ]);
      const [userPayload, usagePayload, settingsPayload, providerPayload] = await Promise.all([
        userResponse.json(),
        usageResponse.json(),
        settingsResponse.json(),
        providerResponse.json(),
      ]);
      if (!userResponse.ok || !usageResponse.ok || !settingsResponse.ok || !providerResponse.ok) {
        throw new Error(userPayload.error || usagePayload.error || settingsPayload.error || providerPayload.error || "后台数据加载失败");
      }
      setUsers(userPayload.data ?? []);
      setUserTotal(Number(userPayload.total ?? 0));
      setUserSummary(userPayload.summary ?? { total: 0, active: 0, totalQuota: 0 });
      setUsage(usagePayload.data ?? []);
      setUsageTotal(Number(usagePayload.total ?? 0));
      setUsageSummary(usagePayload.summary ?? { total: 0, success: 0, failed: 0, totalCost: 0 });
      setTrend(usagePayload.trend ?? []);
      setTypeDistribution(usagePayload.typeDistribution ?? []);
      if (settingsPayload.success) {
        setSettings(settingsPayload.data);
        setSavedSettings(settingsPayload.data);
      }
      if (providerPayload.success) {
        setProvider(providerPayload.data);
        setSavedProvider(providerPayload.data);
        setProviderApiKey("");
      }
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
      setSavedSettings(payload.data);
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

  async function saveProvider() {
    if (!provider) return;
    setProviderSaving(true);
    try {
      const response = await fetch("/api/admin/provider", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey: providerApiKey || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "供应商保存失败");
      setProvider(payload.data);
      setSavedProvider(payload.data);
      setProviderApiKey("");
      notify.success({ key: "provider-settings", message: "供应商配置已保存", position: "topRight" });
    } catch (error) {
      notify.error({ key: "provider-settings", message: "供应商保存失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" });
    } finally {
      setProviderSaving(false);
    }
  }

  async function refreshProviderModels() {
    setModelsRefreshing(true);
    try {
      const response = await fetch("/api/admin/provider/models", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "上游模型获取失败");
      const nextProvider = payload.data as ProviderSettings;
      setProvider(nextProvider);
      setSavedProvider(nextProvider);
      setSettings((current) => {
        if (!current || nextProvider.modelIds.length === 0) return current;
        const available = new Set(nextProvider.modelIds);
        const allowedModels = current.allowedModels.filter((model) => available.has(model));
        const nextAllowedModels = allowedModels.length ? allowedModels : nextProvider.modelIds.slice(0, 1);
        const fallbackModel = nextAllowedModels[0] || current.defaultModel;
        const defaultModel = nextAllowedModels.includes(current.defaultModel) ? current.defaultModel : fallbackModel;
        const compatibleSizes = CHATGPT2API_SIZE_OPTIONS.filter((item) => isImageSizeAllowedForModel(item.value, defaultModel));
        const defaultSize = compatibleSizes.some((item) => item.value === current.defaultSize) ? current.defaultSize : (compatibleSizes[0]?.value ?? current.defaultSize);
        return { ...current, allowedModels: nextAllowedModels, defaultModel, defaultSize };
      });
      notify.success({ key: "provider-models", message: `已获取 ${nextProvider.modelIds.length} 个上游模型`, position: "topRight" });
    } catch (error) {
      notify.error({ key: "provider-models", message: "上游模型获取失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" });
    } finally {
      setModelsRefreshing(false);
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
          <div className="admin-topbar-actions">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="打开账户菜单" />}>
                <Avatar className="size-8"><AvatarFallback>{(currentUser.name || "A").slice(0, 1)}</AvatarFallback></Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="lumina-account-menu w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem className="lumina-account-menu-item" onClick={() => router.push("/generate")}>
                    <WandSparkles data-icon="inline-start" />返回前台
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
          {section === "settings" && settings && savedSettings && provider && savedProvider && <SettingsPanel value={settings} savedValue={savedSettings} provider={provider} savedProvider={savedProvider} providerApiKey={providerApiKey} onProviderChange={setProvider} onProviderApiKeyChange={setProviderApiKey} onProviderReset={() => { setProvider(savedProvider); setProviderApiKey(""); }} onProviderSave={() => void saveProvider()} providerSaving={providerSaving} onRefreshModels={() => void refreshProviderModels()} modelsRefreshing={modelsRefreshing} onChange={setSettings} onReset={() => setSettings(savedSettings)} onSave={() => void saveSettings()} saving={saving} />}
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
                          <Badge variant={log.change > 0 ? "success" : "destructive"}>{log.change > 0 ? "+" : ""}{log.change}</Badge>
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
                  <Badge variant={selectedUsage.status === "success" ? "success" : "destructive"}>{selectedUsage.status === "success" ? "成功" : "失败"}</Badge>
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

const typeChartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function usageTypeLabel(type: string) {
  if (type === "edit") return "图生图";
  if (type === "generate") return "文生图";
  return type;
}

function UsageTypeDistribution({ items }: { items: TypePoint[] }) {
  const total = items.reduce((sum, item) => sum + Math.max(item.total, 0), 0);
  const segments = items
    .filter((item) => item.total > 0)
    .reduce<Array<TypePoint & { color: string; percentage: number; start: number; end: number }>>((result, item, index) => {
      const percentage = item.total / total * 100;
      const start = result.length ? result[result.length - 1].end : 0;
      return [...result, {
        ...item,
        color: typeChartColors[index % typeChartColors.length],
        percentage,
        start,
        end: start + percentage,
      }];
    }, []);
  const chartBackground = `conic-gradient(${segments.map((item) => `${item.color} ${item.start}% ${item.end}%`).join(", ")})`;
  const chartLabel = segments.map((item) => `${usageTypeLabel(item.type)} ${item.total} 次，占 ${Math.round(item.percentage)}%`).join("；");

  return (
    <Card>
      <CardHeader>
        <CardTitle>调用类型分布</CardTitle>
        <CardDescription>按文生图和图生图调用次数统计。</CardDescription>
      </CardHeader>
      <CardContent>
        {segments.length ? (
          <div className="grid items-center gap-6 sm:grid-cols-[160px_minmax(0,1fr)]">
            <div
              className="relative mx-auto grid size-36 place-items-center rounded-full"
              style={{ background: chartBackground }}
              role="img"
              aria-label={chartLabel}
            >
              <div className="grid size-24 place-items-center rounded-full bg-card text-center ring-1 ring-border">
                <span>
                  <strong className="block text-2xl leading-none">{total.toLocaleString()}</strong>
                  <small className="mt-1 block text-xs text-muted-foreground">总调用</small>
                </span>
              </div>
            </div>
            <div className="grid gap-3">
              {segments.map((item) => (
                <div key={item.type} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-medium">{usageTypeLabel(item.type)}</strong>
                    <span className="text-xs text-muted-foreground">{item.total.toLocaleString()} 次</span>
                  </div>
                  <Badge variant="secondary">{Math.round(item.percentage)}%</Badge>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">暂无调用数据</p>
        )}
      </CardContent>
    </Card>
  );
}

function QuotaSummary({ userSummary, totalCost }: { userSummary: { total: number; active: number; totalQuota: number }; totalCost: number }) {
  const activeRate = userSummary.total ? Math.round(userSummary.active / userSummary.total * 100) : 0;
  const items = [
    { label: "当前可用", value: userSummary.totalQuota.toLocaleString(), unit: "灵点", note: "全部用户余额合计", icon: Sparkles },
    { label: "累计消耗", value: totalCost.toLocaleString(), unit: "灵点", note: "成功生成记录消耗合计", icon: WalletCards },
    { label: "正常账号", value: `${userSummary.active.toLocaleString()} / ${userSummary.total.toLocaleString()}`, unit: "账号", note: `占全部账号 ${activeRate}%`, icon: Users },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>额度概况</CardTitle>
        <CardDescription>按实际单位展示关键指标，不进行跨口径比较。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary"><Icon className="size-4" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <strong className="block text-sm font-medium">{item.label}</strong>
                <span className="block truncate text-xs text-muted-foreground">{item.note}</span>
              </div>
              <div className="shrink-0 text-right">
                <strong className="block text-base">{item.value}</strong>
                <span className="text-xs text-muted-foreground">{item.unit}</span>
              </div>
            </div>
          );
        })}
        <Alert><ShieldCheck className="size-4" /><AlertDescription>统计来自数据库聚合，密钥不会进入后台响应。</AlertDescription></Alert>
      </CardContent>
    </Card>
  );
}

function Overview({ userSummary, usageSummary, successRate, trend, typeDistribution }: { userSummary: { total: number; active: number; totalQuota: number }; usageSummary: { total: number; success: number; failed: number; totalCost: number }; successRate: number; trend: TrendPoint[]; typeDistribution: TypePoint[] }) {
  const trendMax = Math.max(...trend.flatMap((item) => [item.total, item.cost]), 1);
  return (
    <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
      <Card><CardHeader><CardTitle>近 7 日调用与消耗</CardTitle></CardHeader><CardContent><div className="grid h-64 grid-cols-7 items-end gap-3 rounded-xl bg-muted/40 p-4">{trend.map((item) => <div key={item.day} className="grid h-full grid-rows-[1fr_auto] gap-2"><div className="flex items-end justify-center gap-1"><span className="w-3 rounded-t bg-primary" title={`${item.total} 次调用`} style={{ height: `${Math.max(item.total / trendMax * 100, item.total ? 5 : 1)}%` }} /><span className="w-3 rounded-t bg-amber-400" title={`${item.cost} 灵点消耗`} style={{ height: `${Math.max(item.cost / trendMax * 100, item.cost ? 5 : 1)}%` }} /></div><span className="text-center text-[10px] text-muted-foreground">{item.day.slice(5)}</span></div>)}</div><div className="mt-3 flex justify-center gap-5 text-xs text-muted-foreground"><span><i className="mr-1 inline-block size-2 rounded-full bg-primary" />调用次数</span><span><i className="mr-1 inline-block size-2 rounded-full bg-amber-400" />灵点消耗</span></div></CardContent></Card>
      <Card><CardHeader><CardTitle>真实运行状态</CardTitle></CardHeader><CardContent className="grid gap-3">{[["数据库数据", `已读取 ${usageSummary.total} 条调用`], ["调用成功率", `${successRate}%`], ["成功输出", `${usageSummary.success} 个`], ["失败记录", `${usageSummary.failed} 条`]].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{label}</span><Badge variant={label === "数据库数据" ? "info" : label === "失败记录" && usageSummary.failed > 0 ? "destructive" : "success"}>{value}</Badge></div>)}</CardContent></Card>
      <UsageTypeDistribution items={typeDistribution} />
      <QuotaSummary userSummary={userSummary} totalCost={usageSummary.totalCost} />
    </div>
  );
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
              {rows.length ? rows.map((row) => <TableRow key={row.id}><TableCell><div className="flex items-center gap-2"><Avatar className="size-8"><AvatarFallback>{row.name.slice(0, 1)}</AvatarFallback></Avatar><div><strong>{row.name}</strong><span className="block text-xs text-muted-foreground">{row.email}</span></div></div></TableCell><TableCell><Badge variant={row.isActive ? "success" : "destructive"}>{row.isActive ? "正常" : "已封禁"}</Badge></TableCell><TableCell>{row.role === "admin" ? "管理员" : "普通用户"}</TableCell><TableCell>{row.quota} <Sparkles className="inline size-3 text-primary" /></TableCell><TableCell>{row.used}</TableCell><TableCell>{fmt(row.createdAt)}</TableCell><TableCell><Button size="sm" variant="ghost" onClick={() => onSelect(row)}>详情</Button><Button size="sm" variant="ghost" onClick={() => onAction(row, row.isActive ? "block" : "activate")}>{row.isActive ? "封禁" : "恢复"}</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">没有匹配的用户</TableCell></TableRow>}
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
              {rows.length ? rows.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.id.slice(0, 18)}</TableCell><TableCell>{row.userName}</TableCell><TableCell>{row.type === "edit" ? "图生图" : "文生图"}</TableCell><TableCell>{row.model}</TableCell><TableCell><Badge variant={row.status === "success" ? "success" : "destructive"}>{row.status === "success" ? "成功" : "失败"}</Badge></TableCell><TableCell>{row.cost}</TableCell><TableCell>{fmt(row.createdAt)}</TableCell><TableCell><Button size="sm" variant="ghost" onClick={() => onSelect(row)}>查看</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">没有匹配的调用记录</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <TablePager {...controls} total={total} />
      </CardContent>
    </Card>
  );
}

type SettingsSection = "connection" | "models" | "generation" | "users";

function providerEndpointLabel(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return baseUrl || "尚未配置地址";
  }
}

function ProviderStatusItem({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b px-4 py-3 last:border-b-0 md:border-b-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">{icon}</span>
      <div className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="block truncate text-sm">{value}</strong>
        <span className="block truncate text-xs text-muted-foreground">{note}</span>
      </div>
    </div>
  );
}

function SettingsSaveFooter({ dirty, saving, onReset, onSave }: { dirty: boolean; saving: boolean; onReset: () => void; onSave: () => void }) {
  return (
    <CardFooter className="flex flex-wrap justify-between gap-3">
      <Badge variant={dirty ? "warning" : "secondary"}>{dirty ? "有未保存更改" : "配置已保存"}</Badge>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onReset} disabled={!dirty || saving}>取消更改</Button>
        <Button onClick={onSave} disabled={!dirty || saving}>
          {saving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
          保存策略
        </Button>
      </div>
    </CardFooter>
  );
}

function SettingsPanel({
  value,
  savedValue,
  provider,
  savedProvider,
  providerApiKey,
  onProviderChange,
  onProviderApiKeyChange,
  onProviderReset,
  onProviderSave,
  providerSaving,
  onRefreshModels,
  modelsRefreshing,
  onChange,
  onReset,
  onSave,
  saving,
}: {
  value: Settings;
  savedValue: Settings;
  provider: ProviderSettings;
  savedProvider: ProviderSettings;
  providerApiKey: string;
  onProviderChange: (value: ProviderSettings) => void;
  onProviderApiKeyChange: (value: string) => void;
  onProviderReset: () => void;
  onProviderSave: () => void;
  providerSaving: boolean;
  onRefreshModels: () => void;
  modelsRefreshing: boolean;
  onChange: (value: Settings) => void;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [section, setSection] = useState<SettingsSection>("connection");
  const [modelSearch, setModelSearch] = useState("");
  const settingsDirty = JSON.stringify(value) !== JSON.stringify(savedValue);
  const providerFieldsDirty =
    provider.name !== savedProvider.name ||
    provider.baseUrl !== savedProvider.baseUrl ||
    providerApiKey.length > 0;
  const providerDirty = provider.source !== "database" || providerFieldsDirty;
  const normalizedModelSearch = modelSearch.trim().toLowerCase();
  const visibleModels = normalizedModelSearch
    ? provider.modelIds.filter((model) => model.toLowerCase().includes(normalizedModelSearch))
    : provider.modelIds;
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

  function changeAllowedModels(model: string, checked: boolean) {
    if (checked) {
      if (value.allowedModels.length >= 12) {
        notify.error({ key: "allowed-models", message: "最多允许 12 个模型", position: "topRight" });
        return;
      }
      onChange({ ...value, allowedModels: [...value.allowedModels, model] });
      return;
    }

    if (value.allowedModels.length <= 1) {
      notify.error({ key: "allowed-models", message: "至少需要保留一个可用模型", position: "topRight" });
      return;
    }
    const allowedModels = value.allowedModels.filter((item) => item !== model);
    const defaultModel = value.defaultModel === model ? allowedModels[0] : value.defaultModel;
    onChange({ ...value, allowedModels, defaultModel });
  }

  return (
    <div className="mx-auto grid w-full max-w-[1120px] gap-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>供应商链路</CardTitle>
          <CardDescription>从 Lumina 请求入口到当前上游模型的实时配置摘要。</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
            <ProviderStatusItem icon={<Sparkles />} label="请求入口" value="Lumina" note="文生图与图生图" />
            <ArrowRight className="mx-1 hidden size-4 text-muted-foreground md:block" aria-hidden="true" />
            <ProviderStatusItem icon={<Server />} label={`供应商 · ${provider.apiKeyHint || "未配置密钥"}`} value={provider.name} note={providerEndpointLabel(provider.baseUrl)} />
            <ArrowRight className="mx-1 hidden size-4 text-muted-foreground md:block" aria-hidden="true" />
            <ProviderStatusItem icon={<WandSparkles />} label="模型目录" value={`${provider.modelIds.length} 个上游模型`} note={provider.modelsUpdatedAt ? `${fmt(provider.modelsUpdatedAt)} 同步` : "尚未同步上游模型"} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={section} onValueChange={(next) => setSection(next as SettingsSection)}>
        <TabsList className="grid h-auto w-full grid-cols-2 p-1 group-data-horizontal/tabs:h-auto lg:grid-cols-4">
          <TabsTrigger value="connection" className="min-h-9 py-2"><Server />连接配置</TabsTrigger>
          <TabsTrigger value="models" className="min-h-9 py-2"><WandSparkles />模型策略</TabsTrigger>
          <TabsTrigger value="generation" className="min-h-9 py-2"><SlidersHorizontal />生成参数</TabsTrigger>
          <TabsTrigger value="users" className="min-h-9 py-2"><UserRound />用户默认值</TabsTrigger>
        </TabsList>

        <TabsContent value="connection">
          <Card>
            <CardHeader>
              <CardTitle>连接配置</CardTitle>
              <CardDescription>保存 OpenAI 兼容供应商地址和密钥后，再同步模型目录。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 lg:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="provider-name">供应商名称</FieldLabel>
                  <Input id="provider-name" value={provider.name} onChange={(event) => onProviderChange({ ...provider, name: event.target.value })} placeholder="例如：主生图服务" />
                </Field>
                <Field data-disabled>
                  <FieldLabel htmlFor="provider-type">请求格式</FieldLabel>
                  <Input id="provider-type" value="OpenAI 兼容（openai_compatible）" disabled />
                </Field>
                <Field>
                  <FieldLabel htmlFor="provider-base-url">供应商 API 地址</FieldLabel>
                  <Input id="provider-base-url" value={provider.baseUrl} onChange={(event) => onProviderChange({ ...provider, baseUrl: event.target.value })} placeholder="https://example.com/v1" />
                  <FieldDescription>通常以 `/v1` 结尾，不要在地址中填写密钥。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="provider-api-key">API Key</FieldLabel>
                  <Input id="provider-api-key" type="password" value={providerApiKey} onChange={(event) => onProviderApiKeyChange(event.target.value)} placeholder={provider.apiKeyHint ? `已配置 ${provider.apiKeyHint}，留空保持不变` : "请输入供应商 API Key"} autoComplete="new-password" />
                  <FieldDescription>密钥只在服务端加密保存，不会返回浏览器或写入审计日志。</FieldDescription>
                </Field>
              </FieldGroup>
              {providerDirty ? (
                <Alert className="mt-5"><CircleAlert /><AlertDescription>连接配置有未保存更改。保存后才能使用新地址或密钥同步模型。</AlertDescription></Alert>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-wrap justify-between gap-3">
              <Badge variant={provider.source === "database" ? "success" : "warning"}>{provider.source === "database" ? "数据库配置" : "环境变量回退"}</Badge>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onProviderReset} disabled={!providerFieldsDirty || providerSaving}>取消更改</Button>
                <Button onClick={onProviderSave} disabled={!providerDirty || providerSaving}>
                  {providerSaving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
                  保存连接
                </Button>
                <Button variant="outline" onClick={onRefreshModels} disabled={providerDirty || modelsRefreshing || !provider.apiKeyConfigured}>
                  {modelsRefreshing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                  同步模型
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="models">
          <Card>
            <CardHeader>
              <CardTitle>模型策略</CardTitle>
              <CardDescription>从上游模型目录中选择创作页可用模型，并指定默认模型。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,.6fr)]">
              <FieldSet>
                <FieldLegend variant="label">可用模型</FieldLegend>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <FieldDescription>最多选择 12 个模型。</FieldDescription>
                  <Badge variant="secondary">已选择 {value.allowedModels.length} / 12</Badge>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} className="pl-8" placeholder="搜索上游模型" aria-label="搜索上游模型" />
                </div>
                {provider.modelIds.length ? (
                  <ScrollArea className="h-80 rounded-lg border">
                    {visibleModels.length ? (
                      <FieldGroup className="gap-1 p-2" data-slot="checkbox-group">
                        {visibleModels.map((model, index) => (
                          <Field key={model} orientation="horizontal" className="rounded-lg p-2.5 hover:bg-muted/50">
                            <Checkbox id={`provider-model-${index}`} checked={value.allowedModels.includes(model)} onCheckedChange={(checked) => changeAllowedModels(model, Boolean(checked))} />
                            <FieldLabel htmlFor={`provider-model-${index}`} className="min-w-0 font-normal"><span className="truncate">{model}</span></FieldLabel>
                          </Field>
                        ))}
                      </FieldGroup>
                    ) : (
                      <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">没有匹配的上游模型</div>
                    )}
                  </ScrollArea>
                ) : (
                  <Alert><AlertDescription>暂未同步上游模型。请先保存连接，再点击“同步模型”。</AlertDescription></Alert>
                )}
              </FieldSet>

              <FieldGroup>
                <Field>
                  <FieldLabel>默认模型</FieldLabel>
                  <Select items={value.allowedModels.map((item) => ({ label: item, value: item }))} value={value.defaultModel} onValueChange={(next) => next && changeDefaultModel(next)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false} className="min-w-72">
                      <SelectGroup>{value.allowedModels.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>创作页初次打开时默认选中的模型。</FieldDescription>
                </Field>
                <Alert><ShieldCheck /><AlertDescription>只有已勾选模型会返回创作页，默认模型必须包含在其中。</AlertDescription></Alert>
                <Button variant="outline" onClick={onRefreshModels} disabled={providerDirty || modelsRefreshing || !provider.apiKeyConfigured}>
                  {modelsRefreshing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                  重新同步上游模型
                </Button>
              </FieldGroup>
            </CardContent>
            <SettingsSaveFooter dirty={settingsDirty} saving={saving} onReset={onReset} onSave={onSave} />
          </Card>
        </TabsContent>

        <TabsContent value="generation">
          <Card>
            <CardHeader>
              <CardTitle>生成参数</CardTitle>
              <CardDescription>设置创作页默认选项与服务端请求边界，图片尺寸格式保持不变。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <Field>
                  <FieldLabel>默认尺寸</FieldLabel>
                  <Select items={sizeOptions.map((item) => ({ label: item.label, value: item.value }))} value={value.defaultSize} onValueChange={(next) => next && onChange({ ...value, defaultSize: next })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false} className="min-w-72 max-w-[calc(100vw-2rem)]">
                      <SelectGroup>{sizeOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>仅显示当前默认模型支持且已允许的尺寸。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>默认质量</FieldLabel>
                  <Select items={qualityOptions.map((item) => ({ label: item.label, value: item.value }))} value={value.defaultQuality} onValueChange={(next) => next && onChange({ ...value, defaultQuality: next })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false} className="min-w-48">
                      <SelectGroup>{qualityOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="max-images">单次最大图片数</FieldLabel>
                  <NumericInput id="max-images" min={1} max={CHATGPT2API_PAGE_MAX_IMAGES} value={value.maxImagesPerRequest} onValueChange={(maxImagesPerRequest) => onChange({ ...value, maxImagesPerRequest })} />
                  <FieldDescription>限制单次请求允许生成的图片数量。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="prompt-max-length">提示词最大字符数</FieldLabel>
                  <NumericInput id="prompt-max-length" min={100} max={20000} value={value.promptMaxLength} onValueChange={(promptMaxLength) => onChange({ ...value, promptMaxLength })} />
                  <FieldDescription>服务端会拒绝超过限制的提示词。</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
            <SettingsSaveFooter dirty={settingsDirty} saving={saving} onReset={onReset} onSave={onSave} />
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>用户默认值</CardTitle>
              <CardDescription>仅影响之后创建的新用户，不会覆盖现有用户余额。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
              <Field>
                <FieldLabel htmlFor="default-user-quota">新用户初始灵点</FieldLabel>
                <NumericInput id="default-user-quota" min={0} max={100000} value={value.defaultUserQuota} onValueChange={(defaultUserQuota) => onChange({ ...value, defaultUserQuota })} />
                <FieldDescription>用户完成注册后获得的初始可用灵点。</FieldDescription>
              </Field>
              <Alert><KeyRound /><AlertDescription>认证密钥和邮件服务仍由环境变量管理，不会在这个页面中读取或回显。</AlertDescription></Alert>
            </CardContent>
            <SettingsSaveFooter dirty={settingsDirty} saving={saving} onReset={onReset} onSave={onSave} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
