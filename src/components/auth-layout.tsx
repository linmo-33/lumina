"use client";

import {
  Card,
  Cursor,
  Divider,
  Tag,
  Title,
} from "animal-island-ui";
import { AppFooter } from "@/components/app-footer";

interface AuthLayoutProps {
  mode: "login" | "register";
  children: React.ReactNode;
}

export function AuthLayout({ mode, children }: AuthLayoutProps) {
  const isLogin = mode === "login";

  return (
    <Cursor>
      <div className="lumina-page">
        <div className="lumina-layer">
          <main className="lumina-auth">
            <section className="lumina-auth-intro">
              <div className="lumina-auth-logo">
                <span className="lumina-brand-mark">
                  <span className="lumina-logo-glyph" aria-hidden="true" />
                </span>
                <span>Lumina</span>
              </div>
              <Tag color="app-yellow" variant="solid" size="large">
                AI 视觉创作工具
              </Tag>
              <h1 className="lumina-auth-headline">
                让每一个灵感，都有清晰的模样。
              </h1>
              <p className="lumina-auth-copy">
                描述你的想法，在灵感工坊中生成图像，并将每次创作收藏进作品库。
              </p>
            </section>

            <Card className="lumina-auth-card" color="default">
              <p className="lumina-kicker">WELCOME TO LUMINA</p>
              <Title size="large" color={isLogin ? "app-teal" : "app-yellow"}>
                {isLogin ? "欢迎回来" : "创建账号"}
              </Title>
              <p className="lumina-description">
                {isLogin
                  ? "登录后继续你的创作旅程。"
                  : "创建账号即可获得管理员配置的初始灵点。"}
              </p>
              <Divider type="dashed-brown" style={{ margin: "20px 0" }} />
              {children}
            </Card>
          </main>
          <AppFooter />
        </div>
      </div>
    </Cursor>
  );
}
