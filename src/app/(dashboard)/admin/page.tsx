"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Icon,
  Table,
  Tag,
  Title,
  type TableColumn,
} from "animal-island-ui";
import { IslandLoading, IslandShell } from "@/components/island-shell";

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
    | (NonNullable<typeof session>["user"] & { role?: string; quota?: number })
    | undefined;

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (user?.role !== "admin") {
      router.replace("/generate");
      return;
    }
    loadUsers();
  }, [isPending, session, user?.role, router]);

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

  if (isPending) {
    return <IslandLoading label="正在联系服务处…" />;
  }

  if (!session || user?.role !== "admin") {
    return <IslandLoading label="正在确认访问权限…" />;
  }

  const columns: TableColumn[] = [
    {
      title: "岛民",
      dataIndex: "name",
      width: 230,
      render: (_value, record) => (
        <div>
          <div className="island-table-user">{String(record.name || "未命名")}</div>
          <div className="island-table-email">{String(record.email || "")}</div>
        </div>
      ),
    },
    {
      title: "身份",
      dataIndex: "role",
      width: 110,
      render: (value) => (
        <Tag
          size="small"
          variant="soft"
          color={value === "admin" ? "app-yellow" : "app-teal"}
        >
          {value === "admin" ? "管理员" : "岛民"}
        </Tag>
      ),
    },
    {
      title: "剩余额度",
      dataIndex: "quota",
      width: 110,
      align: "center",
      render: (value) => <strong>{Number(value ?? 0)}</strong>,
    },
    {
      title: "已使用",
      dataIndex: "used",
      width: 90,
      align: "center",
    },
    {
      title: "状态",
      dataIndex: "isActive",
      width: 100,
      render: (value) => (
        <Tag
          size="small"
          variant="solid"
          color={value ? "app-green" : "app-red"}
        >
          {value ? "正常" : "已停用"}
        </Tag>
      ),
    },
    {
      title: "服务操作",
      width: 260,
      render: (_value, record) => {
        const recordId = String(record.id);
        const isActive = Boolean(record.isActive);
        return (
          <div className="island-table-actions">
            <Button size="small" onClick={() => adjustQuota(recordId, 10)}>
              +10
            </Button>
            <Button size="small" onClick={() => adjustQuota(recordId, 50)}>
              +50
            </Button>
            <Button
              size="small"
              danger={isActive}
              onClick={() => toggleActive(recordId, !isActive)}
            >
              {isActive ? "停用" : "启用"}
            </Button>
          </div>
        );
      },
    },
  ];

  const tableData: Record<string, unknown>[] = users.map((entry) => ({
    ...entry,
  }));

  return (
    <IslandShell active="admin" user={user}>
      <div className="island-section-header">
        <div>
          <p className="island-kicker">RESIDENT SERVICES</p>
          <Title size="large" color="app-orange">
            岛民服务处
          </Title>
          <p className="island-section-copy">
            管理岛民状态与创作额度。额度调整会立即生效。
          </p>
        </div>
        <Icon name="icon-miles" size={72} bounce />
      </div>

      {msg && <div className="island-alert island-success">{msg}</div>}

      <Card className="island-table-panel" style={{ marginTop: msg ? 18 : 0 }}>
        <Table
          columns={columns}
          dataSource={tableData}
          rowKey="id"
          loading={loading}
          emptyText="还没有岛民登记"
          scroll={{ x: 960 }}
        />
      </Card>
    </IslandShell>
  );
}
