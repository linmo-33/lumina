"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    if (!session) return;
    fetch("/api/images/history")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setItems(d.data || []);
      })
      .finally(() => setLoading(false));
  }, [session]);

  if (isPending) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        加载中...
      </div>
    );
  }

  if (!session) {
    router.push("/login");
    return null;
  }

  const user = session.user as typeof session.user & {
    quota?: number;
    role?: string;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/generate" className="font-bold text-lg tracking-tight">
              PixelForge
            </Link>
            <nav className="hidden sm:flex gap-4 text-sm text-zinc-400">
              <Link href="/generate" className="hover:text-white transition">
                生图
              </Link>
              <Link href="/gallery" className="text-white">
                图库
              </Link>
              {user.role === "admin" && (
                <Link href="/admin" className="hover:text-white transition">
                  管理
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-400">
              额度：
              <span className="text-violet-400 font-medium">{user.quota ?? 0}</span>
            </span>
            <button
              onClick={() => signOut().then(() => router.push("/login"))}
              className="text-zinc-400 hover:text-white transition"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold mb-6">我的图库</h2>

        {loading && (
          <p className="text-zinc-500 text-sm">加载中...</p>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-700 h-48 flex items-center justify-center text-zinc-500 text-sm">
            还没有生成过图片，去{" "}
            <Link href="/generate" className="text-violet-400 mx-1 hover:underline">
              生图
            </Link>{" "}
            试试吧
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900"
            >
              {item.imageUrl ? (
                <a href={item.imageUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.prompt}
                    className="w-full aspect-square object-cover group-hover:opacity-90 transition"
                  />
                </a>
              ) : (
                <div className="w-full aspect-square bg-zinc-800" />
              )}
              <div className="p-2.5">
                <p className="text-xs text-zinc-400 line-clamp-2">{item.prompt}</p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  {item.model} · {item.size}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
