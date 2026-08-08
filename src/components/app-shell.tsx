"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CircleUserRound,
  Gamepad2,
  Images,
  LayoutDashboard,
  LogOut,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppFooter } from "@/components/app-footer";
import { notify } from "@/components/app-notifications";
import { signOut } from "@/lib/auth-client";

export type ActivePage = "generate" | "gallery" | "rewards" | "profile" | "admin";

interface AppShellProps {
  active: ActivePage;
  user: {
    id?: string;
    name?: string | null;
    image?: string | null;
    quota?: number;
    role?: string;
  };
  quota?: number;
  children: React.ReactNode;
  hideFooter?: boolean;
}

const navItems = [
  { key: "generate", href: "/generate", label: "创作", icon: WandSparkles },
  { key: "gallery", href: "/gallery", label: "作品", icon: Images },
  { key: "rewards", href: "/rewards", label: "游戏", icon: Gamepad2 },
  { key: "profile", href: "/profile", label: "我的", icon: CircleUserRound },
] as const;

export function AppShell({ active, user, quota, children, hideFooter = false }: AppShellProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const result = await signOut();
      if (result.error) throw new Error(result.error.message || "退出登录失败");
      notify.success({ key: "sign-out", message: "已退出登录", position: "topRight" });
      router.push("/login");
    } catch (error) {
      notify.error({
        key: "sign-out",
        message: "退出登录失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
      setSigningOut(false);
    }
  }

  return (
    <div className="lumina-app-shell">
      <header className="lumina-app-header">
        <Link href="/generate" className="lumina-brand" aria-label="Lumina 首页">
          <span className="lumina-brand-mark" aria-hidden="true"><Sparkles /></span>
          <span>Lumina</span>
        </Link>

        <nav className="lumina-primary-nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`lumina-primary-nav-link${isActive ? " is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="lumina-header-actions">
          <Link href="/rewards" className="lumina-quota-pill" aria-label="查看灵点">
            <span>{quota ?? user.quota ?? 0}</span>
            <Sparkles aria-hidden="true" />
          </Link>
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" className="lumina-account-trigger" aria-label="打开账户菜单" />}>
                  <Avatar className="size-9">
                    <AvatarImage src={user.image ?? undefined} alt="" />
                    <AvatarFallback>{(user.name || "L").slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium sm:inline">{user.name || "用户"}</span>
                  <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="lumina-account-menu w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="lumina-account-menu-label">
                    <span className="lumina-account-menu-name">{user.name || "用户"}</span>
                    <span className="lumina-account-menu-role">
                      {user.role === "admin" ? "管理员账号" : "创作者账号"}
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem className="lumina-account-menu-item" onClick={() => router.push("/profile")}><CircleUserRound data-icon="inline-start" />个人中心</DropdownMenuItem>
                  {user.role === "admin" && (
                    <DropdownMenuItem className="lumina-account-menu-item" onClick={() => router.push("/admin")}><LayoutDashboard data-icon="inline-start" />管理后台</DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem className="lumina-account-menu-item" variant="destructive" onClick={() => void handleSignOut()} disabled={signingOut}>
                    <LogOut data-icon="inline-start" />{signingOut ? "正在退出…" : "退出登录"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="lumina-app-main">{children}</main>
      {!hideFooter && <AppFooter />}
    </div>
  );
}

export function AppLoading({ label = "正在加载 Lumina…" }: { label?: string }) {
  return (
    <div className="lumina-loading-page" role="status" aria-live="polite" aria-busy="true">
      <div className="lumina-loading-panel">
        <div className="lumina-loading-visual" aria-hidden="true">
          <span className="lumina-loading-orbit" />
          <span className="lumina-loading-mark"><Sparkles /></span>
        </div>
        <div className="lumina-loading-copy">
          <strong>{label}</strong>
          <span aria-hidden="true">片刻之间，灵感就绪</span>
        </div>
        <span className="lumina-loading-track" aria-hidden="true"><span /></span>
      </div>
    </div>
  );
}
