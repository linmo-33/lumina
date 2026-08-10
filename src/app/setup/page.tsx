"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppFooter } from "@/components/app-footer";
import { AppLoading } from "@/components/app-shell";
import { notify } from "@/components/app-notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Check, CircleAlert, Database, KeyRound, LoaderCircle, Mail, Server, Sparkles, UserRound } from "lucide-react";

interface SetupStatus { configured: boolean; adminExists: boolean; canInitialize: boolean; checks: { database: boolean; authSecret: boolean; appUrl: boolean; emailApiKey: boolean; emailFrom: boolean } }
const checks = [
  { key: "database" as const, label: "SQLite 数据库", description: "用户、灵点和图片记录", icon: Database },
  { key: "authSecret" as const, label: "认证安全密钥", description: "BETTER_AUTH_SECRET", icon: KeyRound },
  { key: "emailApiKey" as const, label: "Resend 邮件服务", description: "RESEND_API_KEY", icon: Mail },
  { key: "emailFrom" as const, label: "验证码发件人", description: "RESEND_FROM_EMAIL", icon: Mail },
  { key: "appUrl" as const, label: "应用访问地址", description: "BETTER_AUTH_URL", icon: Server },
];
async function getStatus() { const response = await fetch("/api/setup", { cache: "no-store" }); if (!response.ok) throw new Error("无法读取部署状态"); return response.json() as Promise<SetupStatus>; }

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null); const [step, setStep] = useState(0); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [quota, setQuota] = useState("100"); const [loading, setLoading] = useState(false);
  const load = useCallback(async (announce = false) => { try { const value = await getStatus(); setStatus(value); if (value.configured) setStep(2); if (announce) notify.success({ key: "setup", message: "部署状态已更新", position: "topRight" }); } catch (error) { notify.error({ key: "setup", message: "无法读取部署状态", description: error instanceof Error ? error.message : "请检查服务日志", position: "topRight" }); } }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const initialQuota = Number(quota); if (!Number.isInteger(initialQuota) || initialQuota < 1 || initialQuota > 100000) return;
    setLoading(true);
    try { const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password, initialQuota }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "初始化失败"); setStatus((current) => current ? { ...current, configured: true, adminExists: true } : current); setStep(2); notify.success({ key: "setup", message: "初始化完成", description: "管理员账号已创建", position: "topRight" }); }
    catch (error) { notify.error({ key: "setup", message: "初始化失败", description: error instanceof Error ? error.message : "请检查填写内容", position: "topRight" }); }
    finally { setLoading(false); }
  }
  if (!status) return <AppLoading label="正在检查部署环境…" />;
  return <div className="lumina-auth-page"><main className="mx-auto flex w-[min(960px,calc(100%-32px))] flex-1 flex-col justify-center py-12"><header className="mb-8 text-center"><div className="lumina-brand mx-auto"><span className="lumina-brand-mark"><Sparkles /></span><span>Lumina 部署向导</span></div><h1 className="mt-6 text-4xl font-semibold tracking-tight">欢迎使用 Lumina</h1><p className="mt-3 text-muted-foreground">检查运行环境，创建首位管理员，然后开始创作。</p></header><Card><CardHeader><div className="mb-4 grid grid-cols-3 gap-3">{["环境检查", "创建管理员", "完成设置"].map((label, index) => <div key={label} className={`flex items-center gap-2 text-sm ${index <= step ? "text-primary" : "text-muted-foreground"}`}><span className={`grid size-8 place-items-center rounded-full ${index <= step ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{index < step ? <Check className="size-4" /> : index + 1}</span><strong>{label}</strong></div>)}</div><Progress value={(step + 1) / 3 * 100} /></CardHeader><CardContent>
    {step === 0 && <section><div className="mb-6"><p className="lumina-eyebrow">DEPLOYMENT CHECK</p><CardTitle className="mt-2 text-2xl">部署体检</CardTitle><p className="mt-2 text-sm text-muted-foreground">数据库、认证和邮件服务就绪后即可创建管理员，生图供应商可在后台配置。</p></div><div className="grid gap-3 sm:grid-cols-2">{checks.map((item) => { const Icon = item.icon; const ready = status.checks[item.key]; return <div key={item.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border p-4"><span className={`grid size-10 place-items-center rounded-full ${ready ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}><Icon className="size-5" /></span><span><strong className="block text-sm">{item.label}</strong><small className="text-muted-foreground">{item.description}</small></span><Badge variant={ready ? "success" : "warning"}>{ready ? "已就绪" : "待配置"}</Badge></div>; })}</div>{!status.canInitialize && <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><CircleAlert className="mt-0.5 size-5 shrink-0" /><span>请在服务器环境变量中补全缺失配置并重启服务。敏感值不会显示在本页面。</span></div>}<div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={() => void load(true)}>重新检查</Button><Button disabled={!status.canInitialize} onClick={() => setStep(1)}>下一步：创建管理员</Button></div></section>}
    {step === 1 && <section><div className="mb-6"><p className="lumina-eyebrow">ADMIN ACCOUNT</p><CardTitle className="mt-2 text-2xl">创建首位管理员</CardTitle><p className="mt-2 text-sm text-muted-foreground">初始化成功后入口会自动锁定。</p></div><form onSubmit={submit} className="grid gap-5"><div className="grid gap-5 sm:grid-cols-[1fr_.6fr]"><div className="grid gap-2"><Label htmlFor="setup-name">管理员名称</Label><Input id="setup-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Lumina 管理员" minLength={2} required /></div><div className="grid gap-2"><Label htmlFor="setup-quota">初始灵点</Label><Input id="setup-quota" type="number" min={1} max={100000} value={quota} onChange={(event) => setQuota(event.target.value)} required /></div></div><div className="grid gap-2"><Label htmlFor="setup-email">管理员邮箱</Label><Input id="setup-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" required /></div><div className="grid gap-2"><Label htmlFor="setup-password">管理员密码</Label><Input id="setup-password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" required /></div><div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setStep(0)}>返回检查</Button><Button type="submit" disabled={loading || password.length < 8}>{loading && <LoaderCircle className="animate-spin" data-icon="inline-start" />}创建管理员并完成设置</Button></div></form></section>}
    {step === 2 && <section className="grid min-h-96 place-items-center text-center"><div><span className="mx-auto grid size-24 place-items-center rounded-full bg-primary/10 text-primary"><Sparkles className="size-12 fill-current" /></span><p className="lumina-eyebrow mt-6">READY TO CREATE</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Lumina 已准备就绪</h2><p className="mx-auto mt-3 max-w-lg text-muted-foreground">首次部署已完成，请使用管理员账号登录。</p><Button className="mt-7" size="lg" onClick={() => router.push("/login")}><UserRound data-icon="inline-start" />前往登录</Button></div></section>}
    </CardContent></Card></main><AppFooter /></div>;
}
