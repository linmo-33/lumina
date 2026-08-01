"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Cursor,
  Divider,
  Footer,
  Icon,
  Input,
  Progress,
  Tag,
  Title,
} from "animal-island-ui";
import { IslandLoading } from "@/components/island-shell";

interface SetupStatus {
  configured: boolean;
  adminExists: boolean;
  canInitialize: boolean;
  checks: {
    database: boolean;
    authSecret: boolean;
    appUrl: boolean;
    imageApiUrl: boolean;
    imageApiKey: boolean;
  };
}

const checkItems = [
  {
    key: "database" as const,
    label: "SQLite 数据库",
    description: "用户、额度和图片记录的数据表",
    required: true,
    icon: "icon-critterpedia" as const,
  },
  {
    key: "authSecret" as const,
    label: "认证安全密钥",
    description: "BETTER_AUTH_SECRET，至少 32 位",
    required: true,
    icon: "icon-miles" as const,
  },
  {
    key: "appUrl" as const,
    label: "应用访问地址",
    description: "BETTER_AUTH_URL",
    required: false,
    icon: "icon-map" as const,
  },
  {
    key: "imageApiUrl" as const,
    label: "生图服务地址",
    description: "CHATGPT2API_BASE_URL",
    required: false,
    icon: "icon-design" as const,
  },
  {
    key: "imageApiKey" as const,
    label: "生图服务密钥",
    description: "CHATGPT2API_KEY，仅在服务端读取",
    required: false,
    icon: "icon-diy" as const,
  },
];

async function fetchSetupStatus() {
  const response = await fetch("/api/setup", { cache: "no-store" });
  return (await response.json()) as SetupStatus;
}

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [initialQuota, setInitialQuota] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchSetupStatus();
      setError("");
      setStatus(data);
      if (data.configured) setStep(2);
    } catch {
      setError("无法读取部署状态，请检查服务日志后重试");
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchSetupStatus()
      .then((data) => {
        if (!active) return;
        setStatus(data);
        if (data.configured) setStep(2);
      })
      .catch(() => {
        if (active) setError("无法读取部署状态，请检查服务日志后重试");
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSetup(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, initialQuota }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "初始化失败");
        return;
      }
      setStatus((current) =>
        current ? { ...current, configured: true, adminExists: true } : current,
      );
      setStep(2);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "网络请求失败");
    } finally {
      setLoading(false);
    }
  }

  if (!status && !error) {
    return <IslandLoading label="正在检查部署环境…" />;
  }

  const currentStatus: SetupStatus = status || {
    configured: false,
    adminExists: false,
    canInitialize: false,
    checks: {
      database: false,
      authSecret: false,
      appUrl: false,
      imageApiUrl: false,
      imageApiKey: false,
    },
  };

  return (
    <Cursor>
      <div className="island-page setup-page">
        <div className="island-layer">
          <main className="setup-shell">
            <header className="setup-hero">
              <div className="setup-logo">
                <span className="island-brand-mark">
                  <Icon name="icon-diy" size={32} />
                </span>
                <span>Lumina 部署向导</span>
              </div>
              <Tag color="app-yellow" variant="solid" size="large">
                FIRST ISLAND TOUR
              </Tag>
              <h1>欢迎登岛，先完成三项准备。</h1>
              <p>
                向导会检查运行环境、创建第一个管理员账号，然后锁定初始化入口。
              </p>
            </header>

            <Card className="setup-card">
              <div className="setup-progress-header">
                <div className="setup-steps" aria-label="设置进度">
                  {["环境检查", "创建管理员", "完成设置"].map((label, index) => (
                    <div
                      key={label}
                      className={`setup-step ${index <= step ? "is-active" : ""}`}
                    >
                      <span>{index + 1}</span>
                      <strong>{label}</strong>
                    </div>
                  ))}
                </div>
                <Progress
                  percent={step === 0 ? 33 : step === 1 ? 66 : 100}
                  size="small"
                  showInfo={false}
                  aria-label="首次部署设置进度"
                />
              </div>

              <Divider type="dashed-brown" style={{ margin: "22px 0 28px" }} />

              {error && <div className="island-alert setup-error">{error}</div>}

              {step === 0 && (
                <section>
                  <div className="setup-section-title">
                    <div>
                      <p className="island-kicker">DEPLOYMENT CHECK</p>
                      <Title color="app-teal">部署体检</Title>
                    </div>
                    <Icon name="icon-map" size={58} bounce />
                  </div>

                  <p className="island-description">
                    必需项目全部通过后即可创建管理员；推荐项目可以稍后补充，但生图前必须完成配置。
                  </p>

                  <div className="setup-check-list">
                    {checkItems.map((item) => {
                      const ready = currentStatus.checks[item.key];
                      return (
                        <div className="setup-check" key={item.key}>
                          <span className="setup-check-icon">
                            <Icon name={item.icon} size={28} />
                          </span>
                          <div>
                            <strong>{item.label}</strong>
                            <p>{item.description}</p>
                          </div>
                          <Tag
                            size="small"
                            variant={ready ? "solid" : "soft"}
                            color={ready ? "app-green" : "app-orange"}
                          >
                            {ready ? "已就绪" : item.required ? "必需" : "待配置"}
                          </Tag>
                        </div>
                      );
                    })}
                  </div>

                  {!currentStatus.checks.database && (
                    <div className="setup-help-card">
                      <strong>数据库自动迁移失败</strong>
                      <p>
                        Lumina 会在启动时自动建表。请确认 data 目录可写，然后重启服务。
                      </p>
                      <code>data/app.db</code>
                    </div>
                  )}

                  {!currentStatus.checks.authSecret && (
                    <div className="setup-help-card">
                      <strong>补全服务器环境变量</strong>
                      <p>
                        在 <code>.env.local</code> 或部署平台中配置，并重启服务。
                      </p>
                      <pre>{`BETTER_AUTH_SECRET=至少32位随机字符串
BETTER_AUTH_URL=https://你的域名
CHATGPT2API_BASE_URL=https://生图服务/v1
CHATGPT2API_KEY=你的服务密钥`}</pre>
                    </div>
                  )}

                  <div className="setup-actions">
                    <Button onClick={() => void loadStatus()}>
                      重新检查
                    </Button>
                    <Button
                      type="primary"
                      size="large"
                      disabled={!currentStatus.canInitialize}
                      onClick={() => setStep(1)}
                      icon={<Icon name="icon-helicopter" size={22} />}
                    >
                      下一步：创建管理员
                    </Button>
                  </div>
                </section>
              )}

              {step === 1 && (
                <section>
                  <div className="setup-section-title">
                    <div>
                      <p className="island-kicker">ISLAND REPRESENTATIVE</p>
                      <Title color="app-yellow">创建首位管理员</Title>
                    </div>
                    <Icon name="icon-miles" size={58} bounce />
                  </div>

                  <p className="island-description">
                    该账号拥有用户管理和额度调整权限。初始化完成后，向导将自动锁定。
                  </p>

                  <form onSubmit={handleSetup} className="island-form setup-form">
                    <div className="setup-form-grid">
                      <div className="island-field">
                        <label className="island-field-label" htmlFor="setup-name">
                          管理员名称
                        </label>
                        <Input
                          id="setup-name"
                          required
                          minLength={2}
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          prefix={<Icon name="icon-variant" size={20} />}
                          size="large"
                          shadow
                          allowClear
                          placeholder="例如：岛主"
                        />
                      </div>

                      <div className="island-field">
                        <label className="island-field-label" htmlFor="setup-quota">
                          初始创作额度
                        </label>
                        <Input
                          id="setup-quota"
                          required
                          type="number"
                          min={1}
                          max={100000}
                          value={initialQuota}
                          onChange={(event) =>
                            setInitialQuota(Number(event.target.value))
                          }
                          prefix={<Icon name="icon-miles" size={20} />}
                          size="large"
                          shadow
                        />
                      </div>
                    </div>

                    <div className="island-field">
                      <label className="island-field-label" htmlFor="setup-email">
                        管理员邮箱
                      </label>
                      <Input
                        id="setup-email"
                        required
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        prefix={<Icon name="icon-chat" size={20} />}
                        size="large"
                        shadow
                        allowClear
                        placeholder="admin@example.com"
                      />
                    </div>

                    <div className="island-field">
                      <label className="island-field-label" htmlFor="setup-password">
                        管理员密码
                      </label>
                      <Input
                        id="setup-password"
                        required
                        type="password"
                        minLength={8}
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        prefix={<Icon name="icon-diy" size={20} />}
                        size="large"
                        shadow
                        placeholder="至少 8 位"
                      />
                    </div>

                    <div className="setup-actions">
                      <Button onClick={() => setStep(0)}>返回检查</Button>
                      <Button
                        htmlType="submit"
                        type="primary"
                        size="large"
                        loading={loading}
                        disabled={loading || !name || !email || password.length < 8}
                        icon={<Icon name="icon-miles" size={22} />}
                      >
                        创建管理员并完成设置
                      </Button>
                    </div>
                  </form>
                </section>
              )}

              {step === 2 && (
                <section className="setup-complete">
                  <span className="setup-complete-icon">
                    <Icon name="icon-helicopter" size={76} bounce />
                  </span>
                  <p className="island-kicker">READY FOR TAKEOFF</p>
                  <Title size="large" color="app-teal">
                    小岛已准备就绪
                  </Title>
                  <p>
                    {currentStatus.configured
                      ? "首次部署设置已经完成。请使用管理员账号登录，开始管理和创作。"
                      : "管理员账号创建成功，现在可以登录并开始使用 Lumina。"}
                  </p>
                  <div className="setup-complete-tags">
                    <Tag color="app-green" variant="solid">环境已确认</Tag>
                    <Tag color="app-teal" variant="solid">管理员已创建</Tag>
                    <Tag color="app-yellow" variant="solid">向导已锁定</Tag>
                  </div>
                  <Button
                    type="primary"
                    size="large"
                    onClick={() => router.push("/login")}
                    icon={<Icon name="icon-map" size={22} />}
                  >
                    前往登录
                  </Button>
                </section>
              )}
            </Card>
          </main>
          <Footer type="sea" seamless className="island-footer" />
        </div>
      </div>
    </Cursor>
  );
}
