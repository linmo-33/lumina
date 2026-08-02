"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Cursor,
  Icon,
  Wallet,
} from "animal-island-ui";
import item476 from "animal-island-ui/items/item-476.png";
import item306 from "animal-island-ui/items/item-306.png";
import { AppFooter } from "@/components/app-footer";
import { notify } from "@/components/app-notifications";
import { signOut } from "@/lib/auth-client";

type ActivePage = "generate" | "gallery" | "rewards" | "admin";

interface AppShellProps {
  active: ActivePage;
  user: {
    name?: string | null;
    quota?: number;
    role?: string;
  };
  quota?: number;
  children: React.ReactNode;
}

const rewardsNavIcon = typeof item476 === "string" ? item476 : item476.src;
const accountIcon = typeof item306 === "string" ? item306 : item306.src;

const navItems = [
  { key: "generate", href: "/generate", label: "创作", iconName: "icon-design" },
  { key: "gallery", href: "/gallery", label: "作品库", iconName: "icon-camera" },
  { key: "rewards", href: "/rewards", label: "灵海", iconSrc: rewardsNavIcon },
] as const;

export function AppShell({
  active,
  user,
  quota,
  children,
}: AppShellProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function handleSignOut() {
    setMenuOpen(false);
    notify.destroy("sign-out");
    try {
      const result = await signOut();
      if (result.error) {
        throw new Error(result.error.message || "退出登录失败");
      }
      notify.success({
        key: "sign-out",
        message: "已退出登录",
        position: "topRight",
      });
      router.push("/login");
    } catch (caught) {
      notify.error({
        key: "sign-out",
        message: "退出登录失败",
        description: caught instanceof Error ? caught.message : "请稍后重试",
        position: "topRight",
      });
    }
  }

  return (
    <Cursor>
      <div className="lumina-page">
        <div className="lumina-layer">
          <header className="lumina-header-wrap">
            <Card className="lumina-header-card">
              <Link href="/generate" className="lumina-brand">
                <span className="lumina-brand-mark">
                  <span className="lumina-logo-glyph" aria-hidden="true" />
                </span>
                <span>Lumina</span>
              </Link>

              <nav className="lumina-nav" aria-label="主导航">
                {navItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`lumina-nav-link ${
                      active === item.key ? "is-active" : ""
                    }`}
                  >
                    {"iconSrc" in item ? (
                      <Icon src={item.iconSrc} size={20} />
                    ) : (
                      <Icon name={item.iconName} size={20} />
                    )}
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>

              <div className="lumina-user-actions">
                <Link href="/rewards" className="lumina-wallet-link" aria-label="进入灵海">
                  <Wallet value={quota ?? user.quota ?? 0} size="small" />
                  <span className="lumina-wallet-label">灵点</span>
                </Link>
                <div className="lumina-account" ref={accountMenuRef}>
                  <Button
                    className="lumina-account-trigger"
                    size="small"
                    type="text"
                    icon={<Icon src={accountIcon} size={18} />}
                    onClick={() => setMenuOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    {user.name || "用户"}
                    <span className="lumina-account-chevron" aria-hidden="true">
                      ▾
                    </span>
                  </Button>

                  {menuOpen && (
                    <Card className="lumina-account-menu" role="menu">
                      <div className="lumina-account-summary">
                        <strong>{user.name || "用户"}</strong>
                        <span>{user.role === "admin" ? "管理员账号" : "创作者账号"}</span>
                      </div>

                      {user.role === "admin" && (
                        <Link
                          href="/admin/users"
                          className="lumina-account-menu-item"
                          role="menuitem"
                          onClick={() => setMenuOpen(false)}
                        >
                          <Icon name="icon-miles" size={20} />
                          <span>管理后台</span>
                        </Link>
                      )}

                      <button
                        type="button"
                        className="lumina-account-menu-item is-danger"
                        role="menuitem"
                        onClick={() => void handleSignOut()}
                      >
                        <Icon name="icon-map" size={20} />
                        <span>退出登录</span>
                      </button>
                    </Card>
                  )}
                </div>
              </div>
            </Card>
          </header>

          <main className="lumina-content">{children}</main>
          <AppFooter />
        </div>
      </div>
    </Cursor>
  );
}

export function AppLoading({ label = "正在加载 Lumina…" }: { label?: string }) {
  return (
    <div
      className="lumina-loading-page"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Card className="lumina-loading-card">
        <div className="lumina-loading-brand">
          <span className="lumina-loading-mark">
            <span className="lumina-logo-glyph" aria-hidden="true" />
          </span>
          <div>
            <strong>Lumina</strong>
            <span>让灵感成为画面</span>
          </div>
        </div>

        <div className="lumina-loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <p className="lumina-loading-label">{label}</p>
        <div className="lumina-loading-track" aria-hidden="true">
          <span />
        </div>
      </Card>
    </div>
  );
}
