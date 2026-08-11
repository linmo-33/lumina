"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Mail, MailCheck, ShieldCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { notify } from "@/components/app-notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_RESET_EXPIRES_IN_MINUTES } from "@/lib/auth-constants";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setSending(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: normalizedEmail,
        redirectTo: "/reset-password",
      });
      if (result.error) {
        throw new Error(result.error.status === 429 ? "操作过于频繁，请稍后再试" : "重置邮件发送失败，请稍后重试");
      }
      setSentTo(normalizedEmail);
      notify.success({ key: "forgot-password", message: "重置申请已提交", position: "topRight" });
    } catch (error) {
      notify.error({
        key: "forgot-password",
        message: "无法发送重置邮件",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthLayout mode="forgot-password">
      {sentTo ? (
        <div className="lumina-forgot-success">
          <span className="lumina-forgot-success-icon"><MailCheck aria-hidden="true" /></span>
          <div>
            <h3>请检查邮箱</h3>
            <p>如果 {sentTo} 对应 Lumina 账号，你会收到一封密码重置邮件。链接在 {PASSWORD_RESET_EXPIRES_IN_MINUTES} 分钟内有效。</p>
          </div>
          <Button size="lg" className="lumina-login-submit" render={<Link href="/login" />}>
            <ArrowLeft data-icon="inline-start" />
            返回登录
          </Button>
          <Button variant="ghost" className="lumina-forgot-switch" onClick={() => setSentTo("")}>换个邮箱</Button>
        </div>
      ) : (
        <form className="lumina-forgot-form" onSubmit={handleSubmit}>
          <div className="lumina-login-field">
            <Label htmlFor="forgot-password-email">注册邮箱</Label>
            <div className="lumina-login-input-wrap">
              <Mail aria-hidden="true" />
              <Input
                id="forgot-password-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <p className="lumina-forgot-help">为保护账号安全，无论邮箱是否存在都会显示相同结果。</p>
          </div>
          <Button type="submit" size="lg" className="lumina-login-submit" disabled={sending}>
            {sending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <MailCheck data-icon="inline-start" />}
            {sending ? "正在发送…" : "发送重置链接"}
          </Button>
          <p className="lumina-login-register">想起密码了？ <Link href="/login">返回登录</Link></p>
        </form>
      )}

      <p className="lumina-login-security"><ShieldCheck aria-hidden="true" />你的数据由当前部署实例安全保存</p>
    </AuthLayout>
  );
}
