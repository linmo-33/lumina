"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Button, Icon, Input } from "animal-island-ui";
import { AuthLayout } from "@/components/auth-layout";
import { notify } from "@/components/app-notifications";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  useEffect(() => {
    if (resendCountdown <= 0) return;

    const timer = window.setTimeout(() => {
      setResendCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendCountdown]);

  async function sendVerificationCode() {
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) {
      notify.error({
        key: "auth-register",
        message: "请先填写邮箱",
        position: "topRight",
      });
      return;
    }

    notify.destroy("auth-register");
    setSendingCode(true);
    try {
      const response = await fetch("/api/register/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const result = await response.json();

      if (!response.ok) {
        notify.error({
          key: "auth-register",
          message: "验证码发送失败",
          description: result.error || "请稍后重试",
          position: "topRight",
        });
        if (response.status === 429 && result.retryAfter) {
          setResendCountdown(result.retryAfter);
        }
        return;
      }

      setVerificationEmail(targetEmail);
      setVerificationCode("");
      setResendCountdown(60);
      notify.success({
        key: "auth-register",
        message: "验证码已发送",
        description: `请查看 ${targetEmail}，验证码 10 分钟内有效`,
        position: "topRight",
      });
    } catch (err: unknown) {
      notify.error({
        key: "auth-register",
        message: "验证码发送失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    notify.destroy("auth-register");
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (verificationEmail !== normalizedEmail) {
        notify.error({
          key: "auth-register",
          message: "请先获取验证码",
          description: "邮箱发生变化后需要重新获取验证码",
          position: "topRight",
        });
        return;
      }

      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          name: name.trim(),
          code: verificationCode,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        notify.error({
          key: "auth-register",
          message: "注册失败",
          description: result.error || "请检查填写内容后重试",
          position: "topRight",
        });
        return;
      }

      const signInResult = await signIn.email({
        email: normalizedEmail,
        password,
      });
      if (signInResult.error) {
        notify.warning({
          key: "auth-register",
          message: "注册成功，请登录",
          description: "自动登录失败，请使用刚创建的账号登录",
          position: "topRight",
        });
        router.push("/login");
        return;
      }

      notify.success({
        key: "auth-register",
        message: "注册成功",
        description: "账号已创建，正在进入灵感工坊",
        position: "topRight",
      });
      router.push("/generate");
      router.refresh();
    } catch (err: unknown) {
      notify.error({
        key: "auth-register",
        message: "注册失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout mode="register">
        <form
          onSubmit={handleSubmit}
          className="lumina-form"
        >
          {verificationEmail && (
            <div className="lumina-verification-summary">
              <span className="lumina-verification-icon" aria-hidden="true">
                <Icon name="icon-chat" size={28} />
              </span>
              <div>
                <strong>请验证邮箱</strong>
                <span>{verificationEmail}</span>
              </div>
            </div>
          )}

          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="register-name">
              昵称
            </label>
            <Input
              id="register-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="large"
              shadow
              allowClear
              placeholder="你的昵称"
            />
          </div>

          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="register-email">
              邮箱
            </label>
            <Input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (
                  verificationEmail &&
                  event.target.value.trim().toLowerCase() !== verificationEmail
                ) {
                  setVerificationEmail("");
                  setVerificationCode("");
                  setResendCountdown(0);
                }
              }}
              size="large"
              shadow
              allowClear
              placeholder="you@example.com"
            />
          </div>

          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="register-password">
              密码
            </label>
            <Input
              id="register-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              size="large"
              shadow
              placeholder="至少 8 位"
            />
          </div>

          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="register-code">
              邮箱验证码
            </label>
            <div className="lumina-verification-code-row">
              <Input
                id="register-code"
                type="text"
                required
                disabled={!verificationEmail}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(
                    event.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                size="large"
                shadow
                placeholder="请输入 6 位验证码"
              />
              <Button
                htmlType="button"
                size="large"
                loading={sendingCode}
                disabled={sendingCode || loading || resendCountdown > 0}
                onClick={() => void sendVerificationCode()}
              >
                {resendCountdown > 0
                  ? `${resendCountdown} 秒`
                  : verificationEmail
                    ? "重新发送"
                    : "获取验证码"}
              </Button>
            </div>
            <span className="lumina-field-hint">
              {verificationEmail
                ? "验证码 10 分钟内有效，最多可尝试 5 次。"
                : "获取验证码时只校验邮箱，昵称和密码可稍后填写。"}
            </span>
          </div>

          <Button
            htmlType="submit"
            type="primary"
            size="large"
            block
            loading={loading}
            disabled={loading || sendingCode || verificationCode.length !== 6}
          >
            {loading ? "注册中..." : "注册"}
          </Button>
        </form>

        <p className="lumina-auth-footer">
          已有账号？{" "}
          <Link href="/login">
            去登录
          </Link>
        </p>
    </AuthLayout>
  );
}
