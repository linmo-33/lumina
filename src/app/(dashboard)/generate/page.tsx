"use client";

import { useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function GeneratePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-image-2");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("auto");
  const [n, setN] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ id: string; url: string }[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);

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
    used?: number;
    role?: string;
  };

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, size, quality, n }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "生图失败");
        return;
      }
      setResults(data.images || []);
      setRemaining(data.remainingQuota);
    } catch (err: any) {
      setError(err.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* 顶栏 */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/generate" className="font-bold text-lg tracking-tight">
              PixelForge
            </Link>
            <nav className="hidden sm:flex gap-4 text-sm text-zinc-400">
              <Link href="/generate" className="text-white">
                生图
              </Link>
              <Link href="/gallery" className="hover:text-white transition">
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
              <span className="text-violet-400 font-medium">
                {remaining ?? user.quota ?? 0}
              </span>
            </span>
            <span className="text-zinc-500">{user.name}</span>
            <button
              onClick={() => signOut().then(() => router.push("/login"))}
              className="text-zinc-400 hover:text-white transition"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-8">
        {/* 左侧表单 */}
        <form onSubmit={handleGenerate} className="space-y-5">
          <h2 className="text-xl font-semibold">文生图</h2>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">提示词</label>
            <textarea
              required
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              placeholder="一只漂浮在太空里的猫，赛博朋克风格..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">模型</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white focus:border-violet-500 focus:outline-none"
              >
                <option value="gpt-image-2">gpt-image-2</option>
                <option value="codex-gpt-image-2">codex-gpt-image-2</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">尺寸</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white focus:border-violet-500 focus:outline-none"
              >
                <option value="1024x1024">1024×1024</option>
                <option value="1536x1024">1536×1024</option>
                <option value="1024x1536">1024×1536</option>
                <option value="auto">auto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">质量</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white focus:border-violet-500 focus:outline-none"
              >
                <option value="auto">auto</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">数量</label>
              <select
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white focus:border-violet-500 focus:outline-none"
              >
                {[1, 2, 3, 4].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 transition"
          >
            {loading ? "生成中，请稍候..." : `生成（消耗 ${n} 额度）`}
          </button>
        </form>

        {/* 右侧结果 */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">生成结果</h2>
          {results.length === 0 && !loading && (
            <div className="rounded-xl border border-dashed border-zinc-700 h-64 flex items-center justify-center text-zinc-500 text-sm">
              生成的图片会显示在这里
            </div>
          )}
          {loading && (
            <div className="rounded-xl border border-zinc-700 h-64 flex items-center justify-center text-zinc-400 text-sm animate-pulse">
              正在请求 chatgpt2api...
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map((img) => (
              <a
                key={img.id}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl overflow-hidden border border-zinc-800 hover:border-violet-500/50 transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt="generated"
                  className="w-full aspect-square object-cover bg-zinc-900"
                />
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
