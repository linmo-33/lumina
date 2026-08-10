"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { notify } from "@/components/app-notifications";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

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
        <div className="grid gap-5">
          <Alert>
            <MailCheck />
            <AlertTitle>请检查邮箱</AlertTitle>
            <AlertDescription>
              如果 {sentTo} 对应 Lumina 账号，你会收到一封密码重置邮件。链接在 60 分钟内有效。
            </AlertDescription>
          </Alert>
          <Button size="lg" render={<Link href="/login" />}>
            <ArrowLeft data-icon="inline-start" />
            返回登录
          </Button>
          <Button variant="ghost" onClick={() => setSentTo("")}>换个邮箱</Button>
        </div>
      ) : (
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="forgot-password-email">注册邮箱</FieldLabel>
              <Input
                id="forgot-password-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              <FieldDescription>为保护账号安全，无论邮箱是否存在都会显示相同结果。</FieldDescription>
            </Field>
          </FieldGroup>
          <Button type="submit" size="lg" disabled={sending}>
            {sending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <MailCheck data-icon="inline-start" />}
            {sending ? "正在发送…" : "发送重置链接"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            想起密码了？ <Link href="/login" className="font-medium text-primary hover:underline">返回登录</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
