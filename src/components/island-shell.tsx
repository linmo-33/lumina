"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Cursor,
  Footer,
  Icon,
  Loading,
  Tag,
  Wallet,
} from "animal-island-ui";
import { signOut } from "@/lib/auth-client";

type ActivePage = "generate" | "gallery" | "admin";

interface IslandShellProps {
  active: ActivePage;
  user: {
    name?: string | null;
    quota?: number;
    role?: string;
  };
  quota?: number;
  children: React.ReactNode;
}

const navItems = [
  { key: "generate", href: "/generate", label: "创作", icon: "icon-design" },
  { key: "gallery", href: "/gallery", label: "图鉴", icon: "icon-camera" },
] as const;

export function IslandShell({
  active,
  user,
  quota,
  children,
}: IslandShellProps) {
  const router = useRouter();
  const items =
    user.role === "admin"
      ? [
          ...navItems,
          {
            key: "admin" as const,
            href: "/admin",
            label: "管理",
            icon: "icon-miles" as const,
          },
        ]
      : navItems;

  return (
    <Cursor>
      <div className="island-page">
        <div className="island-layer">
          <header className="island-header-wrap">
            <Card className="island-header-card">
              <Link href="/generate" className="island-brand">
                <span className="island-brand-mark">
                  <Icon name="icon-design" size={26} />
                </span>
                <span>Lumina 岛</span>
              </Link>

              <nav className="island-nav" aria-label="主导航">
                {items.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`island-nav-link ${
                      active === item.key ? "is-active" : ""
                    }`}
                  >
                    <Icon name={item.icon} size={20} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>

              <div className="island-user-actions">
                <Wallet value={quota ?? user.quota ?? 0} size="small" />
                <Tag size="small" variant="soft" color="app-teal">
                  {user.name || "岛民"}
                </Tag>
                <Button
                  type="text"
                  size="small"
                  onClick={() => signOut().then(() => router.push("/login"))}
                >
                  退出
                </Button>
              </div>
            </Card>
          </header>

          <main className="island-content">{children}</main>
          <Footer type="sea" seamless className="island-footer" />
        </div>
      </div>
    </Cursor>
  );
}

export function IslandLoading({ label = "正在准备小岛…" }: { label?: string }) {
  return (
    <div className="island-loading-page">
      <div className="island-loading-box">
        <Loading active />
        <span>{label}</span>
      </div>
    </div>
  );
}
