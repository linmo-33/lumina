"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "@/lib/auth-client";
import { AuthLayout } from "@/components/auth-layout";
import { notify } from "@/components/app-notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MailCheck,
  ShieldCheck,
  UserRound,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { refetch: refetchSession } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(
      () => setCountdown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [countdown]);

  async function sendCode() {
    const target = email.trim().toLowerCase();
    if (!target) {
      notify.error({ key: "auth-register", message: "请先填写邮箱", position: "topRight" });
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/register/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 429 && payload.retryAfter) setCountdown(payload.retryAfter);
        throw new Error(payload.error || "验证码发送失败");
      }
      setVerifiedEmail(target);
      setCode("");
      setCountdown(60);
      notify.success({ key: "auth-register", message: "验证码已发送", description: `请查看 ${target}`, position: "topRight" });
    } catch (error) {
      notify.error({ key: "auth-register", message: "验证码发送失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" });
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (verifiedEmail !== normalized) {
      notify.error({ key: "auth-register", message: "请先获取验证码", position: "topRight" });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, password, name: name.trim(), code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "注册失败");

      const result = await signIn.email({ email: normalized, password });
      if (result.error) {
        router.replace("/login");
        return;
      }
      await refetchSession();
      notify.success({ key: "auth-register", message: "注册成功", description: "正在进入创作空间", position: "topRight" });
      router.replace("/generate");
    } catch (error) {
      notify.error({ key: "auth-register", message: "注册失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout mode="register">
      <form onSubmit={handleSubmit} className="lumina-register-form">
        {verifiedEmail ? (
          <div className="lumina-register-code-status" role="status">
            <MailCheck aria-hidden="true" />
            <span>验证码已发送至 {verifiedEmail}</span>
          </div>
        ) : null}

        <div className="lumina-login-field">
          <Label htmlFor="register-name">昵称</Label>
          <div className="lumina-login-input-wrap">
            <UserRound aria-hidden="true" />
            <Input
              id="register-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="你的昵称"
              autoComplete="name"
              required
            />
          </div>
        </div>

        <div className="lumina-login-field">
          <Label htmlFor="register-email">邮箱</Label>
          <div className="lumina-login-input-wrap">
            <Mail aria-hidden="true" />
            <Input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (verifiedEmail && event.target.value.trim().toLowerCase() !== verifiedEmail) {
                  setVerifiedEmail("");
                  setCode("");
                  setCountdown(0);
                }
              }}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="lumina-login-field">
          <Label htmlFor="register-password">密码</Label>
          <div className="lumina-login-input-wrap">
            <LockKeyhole aria-hidden="true" />
            <Input
              id="register-password"
              type={showPassword ? "text" : "password"}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => setCapsLockOn(event.getModifierState("CapsLock"))}
              onKeyUp={(event) => setCapsLockOn(event.getModifierState("CapsLock"))}
              onBlur={() => setCapsLockOn(false)}
              placeholder="至少 8 位"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              className="lumina-login-password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
          {capsLockOn ? <p className="lumina-login-caps-message" role="status">Caps Lock 已开启</p> : null}
        </div>

        <div className="lumina-login-field">
          <Label htmlFor="register-code">邮箱验证码</Label>
          <div className="lumina-register-code-row">
            <div className="lumina-login-input-wrap">
              <KeyRound aria-hidden="true" />
              <Input
                id="register-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="请输入 6 位验证码"
                autoComplete="one-time-code"
                disabled={!verifiedEmail}
                required
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="lumina-register-code-button"
              onClick={() => void sendCode()}
              disabled={sending || countdown > 0}
            >
              {sending ? <LoaderCircle className="animate-spin" /> : null}
              {sending ? "发送中…" : countdown ? `${countdown}s` : verifiedEmail ? "重新发送" : "获取验证码"}
            </Button>
          </div>
          <p className="lumina-register-code-help">验证码 10 分钟内有效，最多可尝试 5 次。</p>
        </div>

        <Button type="submit" size="lg" className="lumina-login-submit" disabled={loading || sending || code.length !== 6}>
          {loading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
          {loading ? "正在注册…" : "创建账号"}
        </Button>

        <p className="lumina-login-register">已有账号？ <Link href="/login">去登录</Link></p>
      </form>

      <p className="lumina-login-security"><ShieldCheck aria-hidden="true" />你的数据由当前部署实例安全保存</p>
    </AuthLayout>
  );
}
