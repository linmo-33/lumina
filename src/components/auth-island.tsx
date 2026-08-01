"use client";

import {
  Card,
  Cursor,
  Divider,
  Footer,
  Icon,
  Tag,
  Title,
} from "animal-island-ui";

interface AuthIslandProps {
  mode: "login" | "register";
  children: React.ReactNode;
}

export function AuthIsland({ mode, children }: AuthIslandProps) {
  const isLogin = mode === "login";

  return (
    <Cursor>
      <div className="island-page">
        <div className="island-layer">
          <main className="island-auth">
            <section className="island-auth-intro">
              <div className="island-auth-logo">
                <span className="island-brand-mark">
                  <Icon name="icon-design" size={34} />
                </span>
                <span>Lumina 岛</span>
              </div>
              <Tag color="app-yellow" variant="solid" size="large">
                AI 灵感生成所
              </Tag>
              <h1 className="island-auth-headline">
                把脑海里的风景，带到这座小岛。
              </h1>
              <p className="island-auth-copy">
                写下一段描述，让 Lumina 帮你生成独一无二的图像，并把每次灵感收藏进个人图鉴。
              </p>
            </section>

            <Card className="island-auth-card" color="default">
              <p className="island-kicker">WELCOME, ISLANDER</p>
              <Title size="large" color={isLogin ? "app-teal" : "app-yellow"}>
                {isLogin ? "欢迎回来" : "领取登岛证"}
              </Title>
              <p className="island-description">
                {isLogin
                  ? "登录后继续你的创作旅程。"
                  : "创建账号即可获得 10 次免费创作额度。"}
              </p>
              <Divider type="dashed-brown" style={{ margin: "20px 0" }} />
              {children}
            </Card>
          </main>
          <Footer type="sea" seamless className="island-footer" />
        </div>
      </div>
    </Cursor>
  );
}
