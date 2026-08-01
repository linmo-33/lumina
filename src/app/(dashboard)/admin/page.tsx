"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Drawer,
  Icon,
  Input,
  Modal,
  Notification,
  Select,
  Table,
  Tabs,
  Tag,
  Title,
  type TableColumn,
} from "animal-island-ui";
import {
  CHATGPT2API_PAGE_MAX_IMAGES,
  CHATGPT2API_SIZE_OPTIONS,
} from "@/lib/image-options";
import { AppLoading, AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth-client";

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

interface UsageRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  type: string;
  model: string;
  prompt: string;
  size: string | null;
  quality: string | null;
  imageUrl: string | null;
  cost: number;
  status: string;
  errorMsg: string | null;
  createdAt: string;
}

interface UsageSummary {
  total: number;
  success: number;
  failed: number;
  totalCost: number;
}

interface SystemSettings {
  defaultModel: string;
  allowedModels: string[];
  defaultSize: string;
  allowedSizes: string[];
  defaultQuality: string;
  allowedQualities: string[];
  maxImagesPerRequest: number;
  promptMaxLength: number;
  defaultUserQuota: number;
}

interface UserDetail {
  target: UserRow & {
    emailVerified: boolean;
    updatedAt: string;
  };
  recentQuotaLogs: Array<{
    id: string;
    change: number;
    reason: string;
    operatorId: string | null;
    createdAt: string;
  }>;
  recentUsage: Array<{
    id: string;
    model: string;
    prompt: string;
    status: string;
    cost: number;
    createdAt: string;
  }>;
  audits: Array<{
    id: string;
    action: string;
    detail: string | null;
    createdAt: string;
  }>;
}

const sizeOptions = CHATGPT2API_SIZE_OPTIONS.map((option) => ({
  label: option.label,
  value: option.value,
}));

const qualityOptions = [
  { label: "自动", value: "auto" },
  { label: "快速", value: "low" },
  { label: "标准", value: "medium" },
  { label: "精细", value: "high" },
];

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getActionLabel(action: string) {
  const labels: Record<string, string> = {
    quota_added: "增加额度",
    quota_deducted: "扣减额度",
    user_blocked: "封禁用户",
    user_unblocked: "解除封禁",
    password_reset: "重置密码",
    system_settings_updated: "更新系统配置",
  };
  return labels[action] || action;
}

export default function AdminPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary>({
    total: 0,
    success: 0,
    failed: 0,
    totalCost: 0,
  });
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("users");
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [selectedUsage, setSelectedUsage] = useState<UsageRecord | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const currentUser = session?.user as
    | (NonNullable<typeof session>["user"] & { role?: string; quota?: number })
    | undefined;

  const loadAdminData = useCallback(async (showSuccess = false) => {
    setLoading(true);
    try {
      const responses = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/usage?pageSize=100"),
        fetch("/api/admin/settings"),
      ]);
      const payloads = await Promise.all(
        responses.map((response) => response.json()),
      );
      const failedIndex = responses.findIndex((response) => !response.ok);
      if (failedIndex >= 0) {
        throw new Error(payloads[failedIndex]?.error || "后台数据加载失败");
      }

      setUsers(payloads[0].data || []);
      setUsage(payloads[1].data || []);
      setUsageSummary(
        payloads[1].summary || { total: 0, success: 0, failed: 0, totalCost: 0 },
      );
      setSettings(payloads[2].data);
      if (showSuccess) {
        Notification.success({
          key: "admin-data",
          message: "后台数据已刷新",
          position: "topRight",
        });
      }
    } catch (caught) {
      Notification.error({
        key: "admin-data",
        message: "后台数据加载失败",
        description:
          caught instanceof Error ? caught.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (currentUser?.role !== "admin") {
      router.replace("/generate");
      return;
    }
    const loadTimer = window.setTimeout(() => void loadAdminData(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [isPending, session, currentUser?.role, router, loadAdminData]);

  const overview = useMemo(() => {
    const activeUsers = users.filter((entry) => entry.isActive).length;
    const totalQuota = users.reduce((total, entry) => total + entry.quota, 0);
    const successRate = usageSummary.total
      ? Math.round((usageSummary.success / usageSummary.total) * 100)
      : 0;
    return { activeUsers, totalQuota, successRate };
  }, [users, usageSummary]);

  async function runUserAction(
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        Notification.error({
          key: "admin-user-action",
          message: "操作失败",
          description: data.error || `请求失败（${response.status}）`,
          position: "topRight",
        });
        return false;
      }
      Notification.success({
        key: "admin-user-action",
        message: "操作成功",
        description: successMessage,
        position: "topRight",
      });
      await loadAdminData();
      return true;
    } catch (caught) {
      Notification.error({
        key: "admin-user-action",
        message: "操作失败",
        description:
          caught instanceof Error ? caught.message : "请稍后重试",
        position: "topRight",
      });
      return false;
    }
  }

  async function adjustQuota(userId: string, delta: number) {
    await runUserAction(
      { action: "quota", userId, delta },
      `额度已${delta > 0 ? "增加" : "减少"} ${Math.abs(delta)}`,
    );
  }

  async function toggleActive(target: UserRow) {
    await runUserAction(
      { action: "status", userId: target.id, isActive: !target.isActive },
      target.isActive ? "用户已封禁并撤销会话" : "用户已恢复访问",
    );
  }

  async function openUserDetail(userId: string) {
    setUserDetailLoading(true);
    setSelectedUser(null);
    try {
      const response = await fetch(
        `/api/admin/users?userId=${encodeURIComponent(userId)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "用户详情加载失败");
      setSelectedUser(data.data);
    } catch (caught) {
      Notification.error({
        key: "admin-user-detail",
        message: "用户详情加载失败",
        description:
          caught instanceof Error ? caught.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setUserDetailLoading(false);
    }
  }

  async function resetPassword() {
    if (!resetTarget || newPassword.length < 8) return;
    setResettingPassword(true);
    const success = await runUserAction(
      { action: "password", userId: resetTarget.id, newPassword },
      `已重置 ${resetTarget.name} 的密码，并撤销其全部会话`,
    );
    setResettingPassword(false);
    if (success) {
      setResetTarget(null);
      setNewPassword("");
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "配置保存失败");
      setSettings(data.data);
      Notification.success({
        key: "admin-settings",
        message: "系统配置已保存",
        description: "新的生图请求会立即使用该策略",
        position: "topRight",
      });
    } catch (caught) {
      Notification.error({
        key: "admin-settings",
        message: "配置保存失败",
        description:
          caught instanceof Error ? caught.message : "请稍后重试",
        position: "topRight",
      });
    } finally {
      setSavingSettings(false);
    }
  }

  if (isPending) return <AppLoading label="正在确认管理员身份…" />;
  if (!session || currentUser?.role !== "admin") {
    return <AppLoading label="正在确认访问权限…" />;
  }

  const userColumns: TableColumn[] = [
    {
      title: "用户",
      dataIndex: "name",
      width: 230,
      render: (_value, record) => (
        <div>
          <div className="lumina-table-user">{String(record.name || "未命名")}</div>
          <div className="lumina-table-email">{String(record.email || "")}</div>
        </div>
      ),
    },
    {
      title: "身份",
      dataIndex: "role",
      width: 100,
      render: (value) => (
        <Tag
          size="small"
          variant="soft"
          color={value === "admin" ? "app-yellow" : "app-teal"}
        >
          {value === "admin" ? "管理员" : "用户"}
        </Tag>
      ),
    },
    {
      title: "额度",
      dataIndex: "quota",
      width: 90,
      align: "center",
      render: (value) => <strong>{Number(value || 0)}</strong>,
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
          {value ? "正常" : "已封禁"}
        </Tag>
      ),
    },
    {
      title: "操作",
      width: 330,
      render: (_value, record) => {
        const target = record as unknown as UserRow;
        return (
          <div className="lumina-table-actions">
            <Button size="small" onClick={() => void openUserDetail(target.id)}>
              详情
            </Button>
            <Button size="small" onClick={() => setResetTarget(target)}>
              重置密码
            </Button>
            <Button
              size="small"
              danger={target.isActive}
              onClick={() => void toggleActive(target)}
            >
              {target.isActive ? "封禁" : "解除封禁"}
            </Button>
          </div>
        );
      },
    },
  ];

  const quotaColumns: TableColumn[] = [
    userColumns[0],
    {
      title: "当前额度",
      dataIndex: "quota",
      width: 120,
      align: "center",
      render: (value) => <strong className="admin-quota-value">{Number(value || 0)}</strong>,
    },
    {
      title: "累计使用",
      dataIndex: "used",
      width: 120,
      align: "center",
    },
    {
      title: "快捷调整",
      width: 360,
      render: (_value, record) => {
        const userId = String(record.id);
        return (
          <div className="lumina-table-actions">
            <Button size="small" danger onClick={() => void adjustQuota(userId, -10)}>
              -10
            </Button>
            <Button size="small" onClick={() => void adjustQuota(userId, 10)}>
              +10
            </Button>
            <Button size="small" onClick={() => void adjustQuota(userId, 50)}>
              +50
            </Button>
            <Button size="small" onClick={() => void adjustQuota(userId, 100)}>
              +100
            </Button>
          </div>
        );
      },
    },
  ];

  const usageColumns: TableColumn[] = [
    {
      title: "用户",
      dataIndex: "userName",
      width: 190,
      render: (_value, record) => (
        <div>
          <div className="lumina-table-user">{String(record.userName || "未知用户")}</div>
          <div className="lumina-table-email">{String(record.userEmail || "")}</div>
        </div>
      ),
    },
    { title: "模型", dataIndex: "model", width: 170 },
    { title: "尺寸", dataIndex: "size", width: 130 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value) => (
        <Tag
          size="small"
          variant="solid"
          color={value === "success" ? "app-green" : "app-red"}
        >
          {value === "success" ? "成功" : "失败"}
        </Tag>
      ),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value) => formatDate(String(value)),
    },
    {
      title: "详情",
      width: 90,
      render: (_value, record) => (
        <Button
          size="small"
          onClick={() => setSelectedUsage(record as unknown as UsageRecord)}
        >
          查看
        </Button>
      ),
    },
  ];

  const tableUsers = users.map((entry) => ({ ...entry }));
  const tableUsage = usage.map((entry) => ({ ...entry }));

  const tabs = [
    {
      key: "users",
      label: "用户管理",
      children: (
        <Card className="admin-workspace-card">
          <div className="admin-workspace-heading">
            <div>
              <strong>用户账号与访问控制</strong>
              <p>查看用户详情、封禁账号或安全地重置邮箱密码。</p>
            </div>
            <Tag color="app-teal" variant="soft">{users.length} 位用户</Tag>
          </div>
          <Table
            columns={userColumns}
            dataSource={tableUsers}
            rowKey="id"
            loading={loading}
            emptyText="还没有用户记录"
            scroll={{ x: 1040 }}
          />
        </Card>
      ),
    },
    {
      key: "quota",
      label: "额度管理",
      children: (
        <Card className="admin-workspace-card">
          <div className="admin-workspace-heading">
            <div>
              <strong>创作额度</strong>
              <p>减少额度时最低为 0，每次调整都会写入额度日志和管理员审计。</p>
            </div>
            <Tag color="app-yellow" variant="solid">共 {overview.totalQuota} 额度</Tag>
          </div>
          <Table
            columns={quotaColumns}
            dataSource={tableUsers}
            rowKey="id"
            loading={loading}
            emptyText="还没有用户记录"
            scroll={{ x: 900 }}
          />
        </Card>
      ),
    },
    {
      key: "usage",
      label: "调用记录",
      children: (
        <Card className="admin-workspace-card">
          <div className="admin-workspace-heading">
            <div>
              <strong>生图调用记录</strong>
              <p>包含成功与失败请求；点击“查看”在抽屉中检查完整提示词和结果。</p>
            </div>
            <Tag color="app-green" variant="soft">成功率 {overview.successRate}%</Tag>
          </div>
          <Table
            columns={usageColumns}
            dataSource={tableUsage}
            rowKey="id"
            loading={loading}
            emptyText="还没有调用记录"
            scroll={{ x: 950 }}
          />
        </Card>
      ),
    },
    {
      key: "settings",
      label: "系统配置",
      children: settings ? (
        <div className="admin-settings-grid">
          <Card className="admin-settings-card">
            <p className="lumina-kicker">IMAGE POLICY</p>
            <Title color="app-teal">生图策略</Title>
            <p className="lumina-description">
              配置会同时影响灵感工坊的选项与生成接口的服务端校验。
            </p>
            <Divider type="dashed-brown" style={{ margin: "18px 0" }} />

            <div className="lumina-form">
              <div className="lumina-field">
                <label className="lumina-field-label" htmlFor="allowed-models">
                  模型白名单
                </label>
                <textarea
                  id="allowed-models"
                  className="lumina-textarea admin-settings-textarea"
                  value={settings.allowedModels.join("\n")}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      allowedModels: Array.from(
                        new Set(
                          event.target.value
                            .split(/[\n,]/)
                            .map((value) => value.trim())
                            .filter(Boolean),
                        ),
                      ),
                    })
                  }
                />
                <span className="lumina-field-hint">每行一个模型标识，默认模型必须在白名单中。</span>
              </div>

              <div className="admin-settings-two-column">
                <div className="lumina-field lumina-select-wrap">
                  <label className="lumina-field-label" id="default-model-label">默认模型</label>
                  <Select
                    value={settings.defaultModel}
                    onChange={(value) => setSettings({ ...settings, defaultModel: value })}
                    options={settings.allowedModels.map((value) => ({ key: value, label: value }))}
                    aria-labelledby="default-model-label"
                  />
                </div>
                <div className="lumina-field">
                  <label className="lumina-field-label" htmlFor="max-images">单次最大图片数</label>
                  <Input
                    id="max-images"
                    type="number"
                    min={1}
                    max={CHATGPT2API_PAGE_MAX_IMAGES}
                    value={settings.maxImagesPerRequest}
                    onChange={(event) => setSettings({ ...settings, maxImagesPerRequest: Number(event.target.value) })}
                    shadow
                  />
                </div>
              </div>

              <div className="lumina-field">
                <span className="lumina-field-label">允许尺寸</span>
                <Checkbox
                  options={sizeOptions}
                  value={settings.allowedSizes}
                  onChange={(values) => setSettings({ ...settings, allowedSizes: values.map(String) })}
                />
              </div>
              <div className="lumina-field lumina-select-wrap">
                <label className="lumina-field-label" id="default-size-label">默认尺寸</label>
                <Select
                  value={settings.defaultSize}
                  onChange={(value) => setSettings({ ...settings, defaultSize: value })}
                  options={sizeOptions
                    .filter((option) => settings.allowedSizes.includes(option.value))
                    .map((option) => ({ key: option.value, label: option.label }))}
                  aria-labelledby="default-size-label"
                />
              </div>

              <div className="lumina-field">
                <span className="lumina-field-label">允许质量</span>
                <Checkbox
                  options={qualityOptions}
                  value={settings.allowedQualities}
                  onChange={(values) => setSettings({ ...settings, allowedQualities: values.map(String) })}
                />
              </div>
              <div className="lumina-field lumina-select-wrap">
                <label className="lumina-field-label" id="default-quality-label">默认质量</label>
                <Select
                  value={settings.defaultQuality}
                  onChange={(value) => setSettings({ ...settings, defaultQuality: value })}
                  options={qualityOptions
                    .filter((option) => settings.allowedQualities.includes(option.value))
                    .map((option) => ({ key: option.value, label: option.label }))}
                  aria-labelledby="default-quality-label"
                />
              </div>
            </div>
          </Card>

          <Card className="admin-settings-card">
            <p className="lumina-kicker">LIMITS & SECURITY</p>
            <Title color="app-yellow">限制与部署边界</Title>
            <p className="lumina-description">
              新用户额度和提示词限制存入数据库；密钥与服务地址仍由部署环境提供。
            </p>
            <Divider type="dashed-brown" style={{ margin: "18px 0" }} />

            <div className="lumina-form">
              <div className="lumina-field">
                <label className="lumina-field-label" htmlFor="prompt-limit">提示词最大字符数</label>
                <Input
                  id="prompt-limit"
                  type="number"
                  min={100}
                  max={20000}
                  value={settings.promptMaxLength}
                  onChange={(event) => setSettings({ ...settings, promptMaxLength: Number(event.target.value) })}
                  shadow
                />
              </div>
              <div className="lumina-field">
                <label className="lumina-field-label" htmlFor="default-quota">新用户默认额度</label>
                <Input
                  id="default-quota"
                  type="number"
                  min={0}
                  max={100000}
                  value={settings.defaultUserQuota}
                  onChange={(event) => setSettings({ ...settings, defaultUserQuota: Number(event.target.value) })}
                  shadow
                />
              </div>

              <div className="admin-security-note">
                <Icon name="icon-diy" size={34} />
                <div>
                  <strong>敏感配置不进入数据库</strong>
                  <p>
                    CHATGPT2API_KEY、CHATGPT2API_BASE_URL 与认证密钥继续通过服务器环境变量管理，后台不会读取或回显它们。
                  </p>
                </div>
              </div>

              <Button
                type="primary"
                size="large"
                block
                loading={savingSettings}
                disabled={savingSettings}
                onClick={() => void saveSettings()}
              >
                保存系统配置
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="admin-workspace-card">正在加载系统配置…</Card>
      ),
    },
  ];

  return (
    <AppShell active="admin" user={currentUser}>
      <section className="admin-hero">
        <div>
          <p className="lumina-kicker">LUMINA CONTROL CENTER</p>
          <Title size="large" color="app-orange">管理后台</Title>
          <p className="lumina-section-copy">
            管理用户访问、创作额度、调用记录与生图策略。所有敏感操作都会留下审计记录。
          </p>
        </div>
        <Button icon={<Icon name="icon-diy" size={20} />} onClick={() => void loadAdminData(true)}>
          刷新数据
        </Button>
      </section>

      <section className="admin-stats-grid" aria-label="后台概览">
        <Card className="admin-stat-card" color="default">
          <span className="admin-stat-icon is-teal"><Icon name="icon-variant" size={28} /></span>
          <div><strong>{users.length}</strong><span>全部用户</span></div>
          <small>{overview.activeUsers} 个账号可正常访问</small>
        </Card>
        <Card className="admin-stat-card" color="default">
          <span className="admin-stat-icon is-yellow"><Icon name="icon-miles" size={28} /></span>
          <div><strong>{overview.totalQuota}</strong><span>可用额度</span></div>
          <small>累计使用 {usageSummary.totalCost}</small>
        </Card>
        <Card className="admin-stat-card" color="default">
          <span className="admin-stat-icon is-green"><Icon name="icon-camera" size={28} /></span>
          <div><strong>{usageSummary.total}</strong><span>调用记录</span></div>
          <small>成功率 {overview.successRate}%</small>
        </Card>
        <Card className="admin-stat-card" color="default">
          <span className="admin-stat-icon is-red"><Icon name="icon-diy" size={28} /></span>
          <div><strong>{usageSummary.failed}</strong><span>失败调用</span></div>
          <small>可在调用详情中查看错误</small>
        </Card>
      </section>

      <Card className="admin-tabs-shell">
        <Tabs
          items={tabs}
          activeKey={activeTab}
          onChange={setActiveTab}
          leafAnimation={false}
        />
      </Card>

      {(selectedUser !== null || userDetailLoading) && (
        <Drawer
          open
          title="用户详情"
          width={540}
          pushBackground={false}
          onClose={() => setSelectedUser(null)}
        >
          {userDetailLoading && <p className="lumina-description">正在加载用户详情…</p>}
          {selectedUser && (
          <div className="admin-drawer-content">
            <div className="admin-detail-heading">
              <div><strong>{selectedUser.target.name}</strong><span>{selectedUser.target.email}</span></div>
              <Tag color={selectedUser.target.isActive ? "app-green" : "app-red"} variant="solid">
                {selectedUser.target.isActive ? "正常" : "已封禁"}
              </Tag>
            </div>
            <div className="admin-detail-grid">
              <div><span>身份</span><strong>{selectedUser.target.role === "admin" ? "管理员" : "用户"}</strong></div>
              <div><span>剩余额度</span><strong>{selectedUser.target.quota}</strong></div>
              <div><span>累计使用</span><strong>{selectedUser.target.used}</strong></div>
              <div><span>注册时间</span><strong>{formatDate(selectedUser.target.createdAt)}</strong></div>
            </div>

            <Divider type="dashed-brown" />
            <section className="admin-detail-section">
              <strong>最近额度变更</strong>
              {selectedUser.recentQuotaLogs.length === 0 && <p>暂无额度记录</p>}
              {selectedUser.recentQuotaLogs.map((log) => (
                <div className="admin-log-row" key={log.id}>
                  <span>{log.reason}</span>
                  <strong className={log.change > 0 ? "is-positive" : "is-negative"}>
                    {log.change > 0 ? "+" : ""}{log.change}
                  </strong>
                  <time>{formatDate(log.createdAt)}</time>
                </div>
              ))}
            </section>

            <Divider type="dashed-brown" />
            <section className="admin-detail-section">
              <strong>管理员审计</strong>
              {selectedUser.audits.length === 0 && <p>暂无管理操作</p>}
              {selectedUser.audits.map((audit) => (
                <div className="admin-audit-row" key={audit.id}>
                  <div><strong>{getActionLabel(audit.action)}</strong><p>{audit.detail || "—"}</p></div>
                  <time>{formatDate(audit.createdAt)}</time>
                </div>
              ))}
            </section>
          </div>
          )}
        </Drawer>
      )}

      {selectedUsage && (
        <Drawer
          open
          title="调用详情"
          width={560}
          pushBackground={false}
          onClose={() => setSelectedUsage(null)}
        >
          <div className="admin-drawer-content">
            <div className="admin-detail-heading">
              <div><strong>{selectedUsage.userName}</strong><span>{selectedUsage.userEmail}</span></div>
              <Tag color={selectedUsage.status === "success" ? "app-green" : "app-red"} variant="solid">
                {selectedUsage.status === "success" ? "调用成功" : "调用失败"}
              </Tag>
            </div>
            <div className="admin-detail-grid">
              <div><span>模型</span><strong>{selectedUsage.model}</strong></div>
              <div><span>尺寸</span><strong>{selectedUsage.size || "自动"}</strong></div>
              <div><span>质量</span><strong>{selectedUsage.quality || "自动"}</strong></div>
              <div><span>时间</span><strong>{formatDate(selectedUsage.createdAt)}</strong></div>
            </div>
            <section className="admin-detail-section">
              <strong>完整提示词</strong>
              <pre className="admin-prompt-box">{selectedUsage.prompt}</pre>
            </section>
            {selectedUsage.errorMsg && (
              <section className="admin-detail-section">
                <strong>错误信息</strong>
                <p className="admin-error-box">{selectedUsage.errorMsg}</p>
              </section>
            )}
            {selectedUsage.imageUrl && (
              <section className="admin-detail-section">
                <strong>生成结果</strong>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="admin-usage-image" src={selectedUsage.imageUrl} alt="调用生成结果" />
              </section>
            )}
          </div>
        </Drawer>
      )}

      {resetTarget && (
        <Modal
          open
          title="重置用户密码"
          width={480}
          typewriter={false}
          onClose={() => {
            setResetTarget(null);
            setNewPassword("");
          }}
          footer={
            <>
              <Button onClick={() => setResetTarget(null)}>取消</Button>
              <Button
                type="primary"
                loading={resettingPassword}
                disabled={newPassword.length < 8 || resettingPassword}
                onClick={() => void resetPassword()}
              >
                确认重置
              </Button>
            </>
          }
        >
          <div className="lumina-form admin-password-form">
            <p className="lumina-description">
              正在为 <strong>{resetTarget.name}</strong> 设置临时密码。完成后该用户的全部会话会被撤销。
            </p>
            <div className="lumina-field">
              <label className="lumina-field-label" htmlFor="admin-new-password">新密码</label>
              <Input
                id="admin-new-password"
                type="password"
                minLength={8}
                maxLength={128}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="至少 8 位"
                shadow
              />
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
