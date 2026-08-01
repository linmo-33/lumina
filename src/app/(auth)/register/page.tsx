"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { Button, Icon, Input } from "animal-island-ui";
import { AuthIsland } from "@/components/auth-island";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signUp.email({
        email,
        password,
        name,
      });
      if (res.error) {
        setError(res.error.message || "注册失败");
        return;
      }
      router.push("/generate");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthIsland mode="register">
        <form onSubmit={handleSubmit} className="island-form">
          {error && (
            <div className="island-alert">{error}</div>
          )}

          <div className="island-field">
            <label className="island-field-label" htmlFor="register-name">
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

          <div className="island-field">
            <label className="island-field-label" htmlFor="register-email">
              邮箱
            </label>
            <Input
              id="register-email"
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
            <label className="island-field-label" htmlFor="register-password">
              密码
            </label>
            <Input
              id="register-password"
              type="password"
              required
              minLength={6}
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

        <p className="island-auth-footer">
          已有账号？{" "}
          <Link href="/login">
            去登录
          </Link>
        </p>
    </AuthIsland>
  );
}
