import Link from "next/link";
import Image from "next/image";
import { Images, Sparkles, WandSparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AppFooter } from "@/components/app-footer";

interface AuthLayoutProps {
  mode: "login" | "register" | "forgot-password" | "reset-password";
  children: React.ReactNode;
}

const authCopy = {
  login: { title: "欢迎回来", description: "登录后继续你的创作旅程。" },
  register: { title: "创建账号", description: "创建账号即可获得初始灵点。" },
  "forgot-password": { title: "找回密码", description: "我们会向你的注册邮箱发送安全重置链接。" },
  "reset-password": { title: "设置新密码", description: "使用至少 8 位的新密码保护你的账号。" },
} as const;

export function AuthLayout({ mode, children }: AuthLayoutProps) {
  const copy = authCopy[mode];
  const usesShowcaseLayout = mode === "login" || mode === "register" || mode === "forgot-password";
  return (
    <div className={`lumina-auth-page lumina-auth-page-${mode}${usesShowcaseLayout ? " lumina-auth-page-showcase" : ""}`}>
      <div className="lumina-auth-shell">
        <section className={`lumina-auth-intro${usesShowcaseLayout ? " lumina-auth-intro-showcase" : ""}`}>
          <Link href="/" className="lumina-brand" aria-label="Lumina">
            <span className="lumina-brand-mark" aria-hidden="true"><Sparkles /></span>
            <span>Lumina</span>
          </Link>
          {usesShowcaseLayout ? (
            <>
              <div className="lumina-login-art" aria-hidden="true">
                <div className="lumina-login-artwork lumina-login-artwork-mountain">
                  <Image src="/images/auth/mountain-lake.png" alt="" fill sizes="260px" />
                </div>
                <div className="lumina-login-artwork lumina-login-artwork-floral">
                  <Image src="/images/auth/artwork-floral.png" alt="" fill sizes="240px" preload />
                </div>
                <div className="lumina-login-artwork lumina-login-artwork-cloud">
                  <Image src="/images/auth/cloud-house.png" alt="" fill sizes="230px" />
                </div>
                <span className="lumina-login-art-mark"><Sparkles /></span>
              </div>
              <div className="lumina-login-copy">
                <h1>让灵感，<br />成为看得见的作品。</h1>
                <p>描述你的想法，用 Lumina 生成独一无二的图像，<br className="lumina-login-copy-break" />并把每一次创作留在作品集中。</p>
                <ul className="lumina-login-capabilities" aria-label="Lumina 能力">
                  <li><WandSparkles />文生图</li>
                  <li><Images />图生图</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <div className="lumina-auth-art" aria-hidden="true">
                <div className="lumina-auth-orbit lumina-auth-orbit-one" />
                <div className="lumina-auth-orbit lumina-auth-orbit-two" />
                <Sparkles className="lumina-auth-art-icon" />
              </div>
              <div className="max-w-lg">
                <h1>让灵感，<br />成为清晰的画面。</h1>
                <p>描述你的想法，用 Lumina 生成独一无二的图像，并把每一次创作留在你的作品里。</p>
              </div>
            </>
          )}
        </section>

        <Card className="lumina-auth-card">
          <div className="lumina-auth-card-heading">
            <p className="lumina-eyebrow">{usesShowcaseLayout ? "LUMINA" : "LUMINA STUDIO"}</p>
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
          </div>
          {children}
        </Card>
      </div>
      <AppFooter variant={usesShowcaseLayout ? "auth" : "default"} />
    </div>
  );
}
