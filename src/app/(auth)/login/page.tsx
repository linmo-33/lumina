"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "@/lib/auth-client";
import { AuthLayout } from "@/components/auth-layout";
import { notify } from "@/components/app-notifications";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";

const INVALID_CREDENTIALS_MESSAGE = "邮箱或密码不正确，请检查后重试。";

export default function LoginPage() {
  const router = useRouter();
  const { refetch: refetchSession } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [emailError, setEmailError] = useState("");
  const [authError, setAuthError] = useState("");
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setAuthError("");
    try {
      const result = await signIn.email({ email: email.trim().toLowerCase(), password, rememberMe });
      if (result.error) {
        setAuthError(INVALID_CREDENTIALS_MESSAGE);
        notify.error({ key: "auth-login", message: "登录失败", description: INVALID_CREDENTIALS_MESSAGE, position: "topRight" });
        return;
      }
      await refetchSession();
      notify.success({ key: "auth-login", message: "登录成功", description: "正在进入创作空间", position: "topRight" });
      router.replace("/generate");
    } catch {
      const message = "登录服务暂时不可用，请稍后重试。";
      setAuthError(message);
      notify.error({ key: "auth-login", message: "登录失败", description: message, position: "topRight" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout mode="login">
      <form onSubmit={handleSubmit} className="lumina-login-form">
        <div className="lumina-login-field">
          <Label htmlFor="login-email">邮箱</Label>
          <div className="lumina-login-input-wrap">
            <Mail aria-hidden="true" />
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError("");
                setAuthError("");
              }}
              onInvalid={() => setEmailError("请输入有效的邮箱地址。")}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(emailError || authError)}
              aria-describedby={emailError ? "login-email-error" : authError ? "login-auth-error" : undefined}
              required
            />
          </div>
          {emailError ? <p id="login-email-error" className="lumina-login-field-message" role="alert">{emailError}</p> : null}
        </div>

        <div className="lumina-login-field">
          <div className="lumina-login-label-row">
            <Label htmlFor="login-password">密码</Label>
            <Link href="/forgot-password">忘记密码？</Link>
          </div>
          <div className="lumina-login-input-wrap">
            <LockKeyhole aria-hidden="true" />
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setAuthError("");
              }}
              onKeyDown={(event) => setCapsLockOn(event.getModifierState("CapsLock"))}
              onKeyUp={(event) => setCapsLockOn(event.getModifierState("CapsLock"))}
              onBlur={() => setCapsLockOn(false)}
              placeholder="请输入密码"
              autoComplete="current-password"
              aria-invalid={Boolean(authError)}
              aria-describedby={authError ? "login-auth-error" : undefined}
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

        <div className="lumina-login-remember">
          <Checkbox id="login-remember" checked={rememberMe} onCheckedChange={(checked) => setRememberMe(checked)} />
          <Label htmlFor="login-remember">保持登录</Label>
        </div>

        {authError ? <p id="login-auth-error" className="lumina-login-error" role="alert">{authError}</p> : null}

        <Button type="submit" size="lg" className="lumina-login-submit" disabled={loading}>
          {loading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
          {loading ? "正在登录…" : "登录"}
        </Button>

        <p className="lumina-login-register">第一次使用 Lumina？ <Link href="/register">创建账号</Link></p>
      </form>

      <p className="lumina-login-security"><ShieldCheck aria-hidden="true" />你的数据由当前部署实例安全保存</p>
    </AuthLayout>
  );
}
