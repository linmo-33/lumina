"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Divider,
  Icon,
  Loading,
  Progress,
  Select,
  Tag,
  Title,
} from "animal-island-ui";
import { IslandLoading, IslandShell } from "@/components/island-shell";

const modelOptions = [
  { key: "gpt-image-2", label: "GPT Image 2" },
  { key: "codex-gpt-image-2", label: "Codex Image 2" },
];

const sizeOptions = [
  { key: "1024x1024", label: "正方形 · 1024 × 1024" },
  { key: "1536x1024", label: "横向 · 1536 × 1024" },
  { key: "1024x1536", label: "竖向 · 1024 × 1536" },
  { key: "auto", label: "自动尺寸" },
];

const qualityOptions = [
  { key: "auto", label: "自动" },
  { key: "low", label: "快速" },
  { key: "medium", label: "标准" },
  { key: "high", label: "精细" },
];

const countOptions = [1, 2, 3, 4].map((value) => ({
  key: String(value),
  label: `${value} 张图片`,
}));

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

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  if (isPending) {
    return <IslandLoading />;
  }

  if (!session) {
    return <IslandLoading label="正在前往登录页…" />;
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <IslandShell active="generate" user={user} quota={remaining ?? undefined}>
      <div className="island-grid">
        <Card className="island-panel" color="default">
          <div className="island-panel-heading">
            <div>
              <p className="island-kicker">CREATIVE WORKSHOP</p>
              <Title size="large" color="app-teal">
                灵感工坊
              </Title>
              <p className="island-description">
                描述你想看到的画面，岛上的创作助手会把它变成图像。
              </p>
            </div>
            <Icon name="icon-diy" size={62} bounce />
          </div>

          <Divider type="dashed-brown" style={{ marginBottom: 22 }} />

          <form onSubmit={handleGenerate} className="island-form">
            {error && <div className="island-alert">{error}</div>}

            <div className="island-field">
              <label className="island-field-label" htmlFor="prompt">
                画面描述
              </label>
              <textarea
                id="prompt"
                required
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="island-textarea"
                placeholder="例如：雨后的森林小屋，窗户透出暖光，水彩插画风格…"
              />
              <span className="island-field-hint">
                加上光线、构图和艺术风格，通常会得到更丰富的结果。
              </span>
            </div>

            <div className="island-options-grid">
              <div className="island-field island-select-wrap">
                <label className="island-field-label" id="model-label">
                  模型
                </label>
                <Select
                  value={model}
                  onChange={setModel}
                  options={modelOptions}
                  aria-labelledby="model-label"
                />
              </div>
              <div className="island-field island-select-wrap">
                <label className="island-field-label" id="size-label">
                  画布
                </label>
                <Select
                  value={size}
                  onChange={setSize}
                  options={sizeOptions}
                  aria-labelledby="size-label"
                />
              </div>
              <div className="island-field island-select-wrap">
                <label className="island-field-label" id="quality-label">
                  质量
                </label>
                <Select
                  value={quality}
                  onChange={setQuality}
                  options={qualityOptions}
                  aria-labelledby="quality-label"
                />
              </div>
              <div className="island-field island-select-wrap">
                <label className="island-field-label" id="count-label">
                  数量
                </label>
                <Select
                  value={String(n)}
                  onChange={(value) => setN(Number(value))}
                  options={countOptions}
                  aria-labelledby="count-label"
                />
              </div>
            </div>

            <Button
              htmlType="submit"
              type="primary"
              size="large"
              block
              loading={loading}
              disabled={loading || !prompt.trim()}
              icon={<Icon name="icon-design" size={22} />}
            >
              {loading ? "正在收集灵感…" : `开始创作 · 消耗 ${n} 额度`}
            </Button>
          </form>
        </Card>

        <Card className="island-panel" color="default" type="dashed">
          <div className="island-panel-heading">
            <div>
              <p className="island-kicker">LATEST CREATION</p>
              <Title color="app-yellow">本次作品</Title>
            </div>
            {results.length > 0 && (
              <Tag color="app-teal" variant="soft">
                {results.length} 张已完成
              </Tag>
            )}
          </div>

          {loading && (
            <div className="island-result-empty">
              <div>
                <Loading active />
                <p className="island-empty-title">正在绘制你的灵感</p>
                <p className="island-empty-copy">
                  生成过程可能需要一点时间，请留在这座小岛上。
                </p>
                <Progress
                  percent={72}
                  showInfo={false}
                  size="small"
                  aria-label="图片生成中"
                  style={{ marginTop: 18 }}
                />
              </div>
            </div>
          )}

          {results.length === 0 && !loading && (
            <div className="island-result-empty">
              <div>
                <span className="island-empty-icon">
                  <Icon name="icon-camera" size={54} bounce />
                </span>
                <p className="island-empty-title">画布还是空白的</p>
                <p className="island-empty-copy">
                  在左侧写下第一个创意，完成后的图片会在这里出现。
                </p>
              </div>
            </div>
          )}

          {results.length > 0 && !loading && (
            <div className="island-results-grid">
              {results.map((img) => (
                <Card key={img.id} className="island-image-card" hoverable>
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noreferrer"
                    className="island-image-link"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt="AI 生成作品"
                      className="island-image"
                    />
                  </a>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>
    </IslandShell>
  );
}
