"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { Button, Icon, Input, Notification } from "animal-island-ui";
import { AuthLayout } from "@/components/auth-layout";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    Notification.destroy("auth-register");
    setLoading(true);
    try {
      const res = await signUp.email({
        email,
        password,
        name,
      });
      if (res.error) {
        Notification.error({
          key: "auth-register",
          message: "注册失败",
          description: res.error.message || "请检查填写内容后重试",
          position: "topRight",
        });
        return;
      }
      Notification.success({
        key: "auth-register",
        message: "注册成功",
        description: "账号已创建，正在进入灵感工坊",
        position: "topRight",
      });
      router.push("/generate");
      router.refresh();
    } catch (err: unknown) {
      Notification.error({
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
