"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient, signUp } from "@/lib/auth-client";
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
  const [awaitingVerification, setAwaitingVerification] = useState(false);
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

  async function sendVerificationCode(targetEmail: string) {
    setSendingCode(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: targetEmail,
        type: "email-verification",
      });

      if (result.error) {
        notify.error({
          key: "auth-register",
          message: "验证码发送失败",
          description: result.error.message || "请稍后重试",
          position: "topRight",
        });
        return false;
      }

      setResendCountdown(60);
      return true;
    } catch (err: unknown) {
      notify.error({
        key: "auth-register",
        message: "验证码发送失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        position: "topRight",
      });
      return false;
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
      const res = await signUp.email({
        email: normalizedEmail,
        password,
        name: name.trim(),
      });
      if (res.error) {
        notify.error({
          key: "auth-register",
          message: "注册失败",
          description: res.error.message || "请检查填写内容后重试",
          position: "topRight",
        });
        return;
      }

      setVerificationEmail(normalizedEmail);
      setAwaitingVerification(true);
      const sent = await sendVerificationCode(normalizedEmail);
      if (sent) {
        notify.success({
          key: "auth-register",
          message: "验证码已发送",
          description: `请查看 ${normalizedEmail}，验证码 10 分钟内有效`,
          position: "topRight",
        });
      }
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

  async function handleVerification(event: React.FormEvent) {
    event.preventDefault();
    notify.destroy("auth-register");
    setLoading(true);

    try {
      const result = await authClient.emailOtp.verifyEmail({
        email: verificationEmail,
        otp: verificationCode,
      });

      if (result.error) {
        notify.error({
          key: "auth-register",
          message: "验证失败",
          description: result.error.message || "验证码错误或已失效",
          position: "topRight",
        });
        return;
      }

      notify.success({
        key: "auth-register",
        message: "邮箱验证成功",
        description: "账号已创建，正在进入灵感工坊",
        position: "topRight",
      });
      router.push("/generate");
      router.refresh();
    } catch (err: unknown) {
      notify.error({
        key: "auth-register",
        message: "验证失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setLoading(false);
    }
  }

  if (awaitingVerification) {
    return (
      <AuthLayout mode="register">
        <form onSubmit={handleVerification} className="lumina-form">
          <div className="lumina-verification-summary">
            <span className="lumina-verification-icon" aria-hidden="true">
              <Icon name="icon-chat" size={28} />
            </span>
            <div>
              <strong>验证码已发送至</strong>
              <span>{verificationEmail}</span>
            </div>
          </div>

          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="register-code">
              邮箱验证码
            </label>
            <Input
              id="register-code"
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={verificationCode}
              onChange={(event) =>
                setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              size="large"
              shadow
              prefix={<Icon name="icon-diy" size={20} />}
              placeholder="请输入 6 位验证码"
            />
            <span className="lumina-field-hint">
              验证码 10 分钟内有效，最多可尝试 5 次。
            </span>
          </div>

          <Button
            htmlType="submit"
            type="primary"
            size="large"
            block
            loading={loading}
            disabled={loading || verificationCode.length !== 6}
          >
            {loading ? "验证中..." : "验证并完成注册"}
          </Button>

          <div className="lumina-verification-actions">
            <Button
              htmlType="button"
              type="text"
              disabled={sendingCode || resendCountdown > 0}
              loading={sendingCode}
              onClick={() => void sendVerificationCode(verificationEmail)}
            >
              {resendCountdown > 0
                ? `${resendCountdown} 秒后可重新发送`
                : "重新发送验证码"}
            </Button>
            <Button
              htmlType="button"
              type="text"
              disabled={loading || sendingCode}
              onClick={() => {
                setAwaitingVerification(false);
                setVerificationCode("");
              }}
            >
              返回修改信息
            </Button>
          </div>
        </form>

        <p className="lumina-auth-footer">
          已有账号？ <Link href="/login">去登录</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout mode="register">
        <form onSubmit={handleSubmit} className="lumina-form">
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
              prefix={<Icon name="icon-variant" size={20} />}
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
              onChange={(e) => setEmail(e.target.value)}
              size="large"
              shadow
              allowClear
              prefix={<Icon name="icon-chat" size={20} />}
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
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              size="large"
              shadow
              prefix={<Icon name="icon-miles" size={20} />}
              placeholder="至少 6 位"
            />
          </div>

          <Button
            htmlType="submit"
            type="primary"
            size="large"
            block
            loading={loading}
            disabled={loading}
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
