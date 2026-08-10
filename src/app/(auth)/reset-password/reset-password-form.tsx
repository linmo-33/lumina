"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, CircleCheck, KeyRound, LoaderCircle } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { notify } from "@/components/app-notifications";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token, initiallyInvalid }: { token: string; initiallyInvalid: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [formError, setFormError] = useState("");
  const [invalidToken, setInvalidToken] = useState(initiallyInvalid);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (password.length < 8) {
      setFormError("新密码至少需要 8 位");
      return;
    }
    if (password !== confirmation) {
      setFormError("两次输入的密码不一致");
      return;
    }

    setSaving(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        if (result.error.status === 429) throw new Error("操作过于频繁，请稍后再试");
        setInvalidToken(true);
        throw new Error("重置链接无效或已过期，请重新申请");
      }
      window.history.replaceState(null, "", "/reset-password");
      setCompleted(true);
      notify.success({ key: "reset-password", message: "密码已更新", position: "topRight" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "密码重置失败，请稍后重试";
      setFormError(message);
      notify.error({ key: "reset-password", message: "密码重置失败", description: message, position: "topRight" });
    } finally {
      setSaving(false);
    }
  }

  if (completed) {
    return (
      <AuthLayout mode="reset-password">
        <div className="grid gap-5">
          <Alert>
            <CircleCheck />
            <AlertTitle>密码已更新</AlertTitle>
            <AlertDescription>旧登录会话已全部退出，请使用新密码重新登录。</AlertDescription>
          </Alert>
          <Button size="lg" render={<Link href="/login" />}>
            <ArrowLeft data-icon="inline-start" />
            返回登录
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (invalidToken) {
    return (
      <AuthLayout mode="reset-password">
        <div className="grid gap-5">
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>重置链接无效</AlertTitle>
            <AlertDescription>链接可能已过期或已经使用，请重新获取密码重置邮件。</AlertDescription>
          </Alert>
          <Button size="lg" render={<Link href="/forgot-password" />}>
            <KeyRound data-icon="inline-start" />
            重新获取链接
          </Button>
          <Button variant="ghost" render={<Link href="/login" />}>返回登录</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout mode="reset-password">
      <form className="grid gap-5" onSubmit={handleSubmit}>
        {formError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <FieldGroup>
          <Field data-invalid={Boolean(formError)}>
            <FieldLabel htmlFor="reset-password-new">新密码</FieldLabel>
            <Input
              id="reset-password-new"
              type="password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(formError)}
              required
            />
            <FieldDescription>使用至少 8 位、且不容易被猜到的密码。</FieldDescription>
          </Field>
          <Field data-invalid={Boolean(formError)}>
            <FieldLabel htmlFor="reset-password-confirmation">确认新密码</FieldLabel>
            <Input
              id="reset-password-confirmation"
              type="password"
              minLength={8}
              maxLength={128}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(formError)}
              required
            />
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}
          {saving ? "正在更新…" : "更新密码"}
        </Button>
      </form>
    </AuthLayout>
  );
}
