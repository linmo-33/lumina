"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Icon, Loading, Tag, Title } from "animal-island-ui";
import { IslandLoading, IslandShell } from "@/components/island-shell";

interface HistoryItem {
  id: string;
  type: string;
  model: string;
  prompt: string;
  size: string | null;
  imageUrl: string | null;
  cost: number;
  createdAt: string;
}

export default function GalleryPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/images/history")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setItems(d.data || []);
      })
      .finally(() => setLoading(false));
  }, [session]);

  if (isPending) {
    return <IslandLoading label="正在翻开你的图鉴…" />;
  }

  if (!session) {
    return <IslandLoading label="正在前往登录页…" />;
  }

  const user = session.user as typeof session.user & {
    quota?: number;
    role?: string;
  };

  return (
    <IslandShell active="gallery" user={user}>
      <div className="island-section-header">
        <div>
          <p className="island-kicker">YOUR COLLECTION</p>
          <Title size="large" color="app-yellow">
            我的灵感图鉴
          </Title>
          <p className="island-section-copy">
            每一次生成都会被妥善收藏。点击图片，可以查看完整尺寸的作品。
          </p>
        </div>
        <Tag color="app-teal" variant="solid" size="large">
          共 {items.length} 件作品
        </Tag>
      </div>

      {loading && (
        <Card className="island-panel island-result-empty">
          <div>
            <Loading active />
            <p className="island-empty-title">正在整理图鉴…</p>
          </div>
        </Card>
      )}

      {!loading && items.length === 0 && (
        <Card className="island-panel island-result-empty" type="dashed">
          <div>
            <span className="island-empty-icon">
              <Icon name="icon-critterpedia" size={54} bounce />
            </span>
            <p className="island-empty-title">图鉴里还没有作品</p>
            <p className="island-empty-copy">
              去{" "}
              <Link href="/generate" className="island-inline-link">
                灵感工坊
              </Link>{" "}
              完成第一幅创作吧。
            </p>
          </div>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <div className="island-gallery-grid">
          {items.map((item) => (
            <Card key={item.id} className="island-image-card" hoverable>
              {item.imageUrl ? (
                <a
                  href={item.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="island-image-link"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.prompt}
                    className="island-image"
                  />
                </a>
              ) : (
                <div className="island-image" />
              )}
              <div className="island-image-meta">
                <p className="island-image-prompt">{item.prompt}</p>
                <p className="island-image-detail">
                  {item.model} · {item.size || "自动尺寸"}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </IslandShell>
  );
}
