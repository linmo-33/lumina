"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Button, Icon, Input } from "animal-island-ui";
import { AuthIsland } from "@/components/auth-island";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message || "登录失败");
        return;
      }
      router.push("/generate");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthIsland mode="login">
        <form onSubmit={handleSubmit} className="island-form">
          {error && (
            <div className="island-alert">{error}</div>
          )}

          <div className="island-field">
            <label className="island-field-label" htmlFor="login-email">
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

          <div className="island-field">
            <label className="island-field-label" htmlFor="login-password">
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

        <p className="island-auth-footer">
          还没有账号？{" "}
          <Link href="/register">
            立即注册
          </Link>
        </p>
    </AuthIsland>
  );
}
