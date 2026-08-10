import Link from "next/link";
import { Sparkles } from "lucide-react";
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
  return (
    <div className="lumina-auth-page">
      <div className="lumina-auth-shell">
        <section className="lumina-auth-intro">
          <Link href="/" className="lumina-brand" aria-label="Lumina">
            <span className="lumina-brand-mark" aria-hidden="true"><Sparkles /></span>
            <span>Lumina</span>
          </Link>
          <div className="lumina-auth-art" aria-hidden="true">
            <div className="lumina-auth-orbit lumina-auth-orbit-one" />
            <div className="lumina-auth-orbit lumina-auth-orbit-two" />
            <Sparkles className="lumina-auth-art-icon" />
          </div>
          <div className="max-w-lg">
            <h1>让灵感，<br />成为清晰的画面。</h1>
            <p>描述你的想法，用 Lumina 生成独一无二的图像，并把每一次创作留在你的作品里。</p>
          </div>
        </section>

        <Card className="lumina-auth-card">
          <div className="lumina-auth-card-heading">
            <p className="lumina-eyebrow">LUMINA STUDIO</p>
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
          </div>
          {children}
        </Card>
      </div>
      <AppFooter />
    </div>
  );
}
