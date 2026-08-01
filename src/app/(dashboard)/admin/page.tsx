"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  quota: number;
  used: number;
  isActive: boolean;
  createdAt: string;
}

export default function AdminPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const user = session?.user as
    | (typeof session.user & { role?: string; quota?: number })
    | undefined;

  useEffect(() => {
    if (!session) return;
    if (user?.role !== "admin") {
      router.push("/generate");
      return;
    }
    loadUsers();
  }, [session]);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.success) setUsers(data.data || []);
    } finally {
      setLoading(false);
    }
  }

  async function adjustQuota(userId: string, delta: number) {
    setMsg("");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, quotaDelta: delta }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "操作失败");
      return;
    }
    setMsg(`已调整额度 ${delta > 0 ? "+" : ""}${delta}`);
    loadUsers();
  }

  async function toggleActive(userId: string, isActive: boolean) {
    setMsg("");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "操作失败");
      return;
    }
    loadUsers();
  }

  if (isPending || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        加载中...
      </div>
    );
  }

  if (!session || user?.role !== "admin") return null;

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
              <Link href="/gallery" className="hover:text-white transition">
                图库
              </Link>
              <Link href="/admin" className="text-white">
                管理
              </Link>
            </nav>
          </div>
          <button
            onClick={() => signOut().then(() => router.push("/login"))}
            className="text-sm text-zinc-400 hover:text-white transition"
          >
            退出
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold mb-2">用户管理</h2>
        {msg && (
          <p className="text-sm text-violet-400 mb-4">{msg}</p>
        )}

        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">额度</th>
                <th className="px-4 py-3 font-medium">已用</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-zinc-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.role === "admin"
                          ? "text-amber-400"
                          : "text-zinc-400"
                      }
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-violet-400 font-medium">
                    {u.quota}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{u.used}</td>
                  <td className="px-4 py-3">
                    {u.isActive ? (
                      <span className="text-emerald-400">正常</span>
                    ) : (
                      <span className="text-red-400">禁用</span>
                    )}
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    <button
                      onClick={() => adjustQuota(u.id, 10)}
                      className="text-xs text-violet-400 hover:underline"
                    >
                      +10
                    </button>
                    <button
                      onClick={() => adjustQuota(u.id, 50)}
                      className="text-xs text-violet-400 hover:underline"
                    >
                      +50
                    </button>
                    <button
                      onClick={() => toggleActive(u.id, !u.isActive)}
                      className="text-xs text-zinc-400 hover:underline"
                    >
                      {u.isActive ? "禁用" : "启用"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
