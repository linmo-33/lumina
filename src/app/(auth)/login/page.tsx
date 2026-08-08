"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { AuthLayout } from "@/components/auth-layout";
import { notify } from "@/components/app-notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoaderCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || "请检查邮箱和密码");
      notify.success({ key: "auth-login", message: "登录成功", description: "正在进入创作空间", position: "topRight" });
      router.push("/generate"); router.refresh();
    } catch (error) { notify.error({ key: "auth-login", message: "登录失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" }); }
    finally { setLoading(false); }
  }
  return <AuthLayout mode="login"><form onSubmit={handleSubmit} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="login-email">邮箱</Label><Input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></div><div className="grid gap-2"><div className="flex items-center justify-between"><Label htmlFor="login-password">密码</Label><button type="button" className="text-xs text-primary hover:underline">忘记密码？</button></div><Input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" required /></div><Button type="submit" size="lg" disabled={loading}>{loading && <LoaderCircle className="animate-spin" data-icon="inline-start" />}{loading ? "登录中…" : "登录"}</Button><p className="text-center text-sm text-muted-foreground">还没有账号？ <Link href="/register" className="font-medium text-primary hover:underline">立即注册</Link></p></form></AuthLayout>;
}
