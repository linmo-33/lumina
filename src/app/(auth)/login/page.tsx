"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Button, Icon, Input, Notification } from "animal-island-ui";
import { AuthLayout } from "@/components/auth-layout";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    Notification.destroy("auth-login");
    setLoading(true);
    try {
      const res = await signIn.email({ email, password });
      if (res.error) {
        Notification.error({
          key: "auth-login",
          message: "登录失败",
          description: res.error.message || "请检查邮箱和密码后重试",
          position: "topRight",
        });
        return;
      }
      Notification.success({
        key: "auth-login",
        message: "登录成功",
        description: "正在进入灵感工坊",
        position: "topRight",
      });
      router.push("/generate");
      router.refresh();
    } catch (err: unknown) {
      Notification.error({
        key: "auth-login",
        message: "登录失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout mode="login">
        <form onSubmit={handleSubmit} className="lumina-form">
          <div className="lumina-field">
            <label className="lumina-field-label" htmlFor="login-email">
              邮箱
            </label>
            <Input
              id="login-email"
              type="email"
              required
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
            <label className="lumina-field-label" htmlFor="login-password">
              密码
            </label>
            <Input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              size="large"
              shadow
              prefix={<Icon name="icon-miles" size={20} />}
              placeholder="••••••••"
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
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>

        <p className="lumina-auth-footer">
          还没有账号？{" "}
          <Link href="/register">
            立即注册
          </Link>
        </p>
    </AuthLayout>
  );
}
