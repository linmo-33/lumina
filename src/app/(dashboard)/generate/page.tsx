"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Divider,
  Icon,
  Progress,
  Select,
  Tag,
  Title,
} from "animal-island-ui";
import { AppLoading, AppShell } from "@/components/app-shell";
import { notify } from "@/components/app-notifications";
import {
  CHATGPT2API_PAGE_MAX_IMAGES,
  CHATGPT2API_SIZE_OPTIONS,
  isImageSizeAllowedForModel,
} from "@/lib/image-options";

const allSizeOptions = CHATGPT2API_SIZE_OPTIONS.map((option) => ({
  key: option.value,
  label: option.label,
}));

const allQualityOptions = [
  { key: "auto", label: "自动" },
  { key: "low", label: "快速" },
  { key: "medium", label: "标准" },
  { key: "high", label: "精细" },
];

interface ImageConfig {
  defaultModel: string;
  allowedModels: string[];
  defaultSize: string;
  allowedSizes: string[];
  defaultQuality: string;
  allowedQualities: string[];
  maxImagesPerRequest: number;
  promptMaxLength: number;
}

const fallbackConfig: ImageConfig = {
  defaultModel: "gpt-image-2",
  allowedModels: ["gpt-image-2", "codex-gpt-image-2"],
  defaultSize: "1024x1024",
  allowedSizes: allSizeOptions.map((option) => option.key),
  defaultQuality: "auto",
  allowedQualities: allQualityOptions.map((option) => option.key),
  maxImagesPerRequest: CHATGPT2API_PAGE_MAX_IMAGES,
  promptMaxLength: 4000,
};

export default function GeneratePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-image-2");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("auto");
  const [n, setN] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [results, setResults] = useState<{ id: string; url: string }[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [config, setConfig] = useState<ImageConfig>(fallbackConfig);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session) return;

    fetch("/api/images/config")
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) return;
        const nextConfig = data.data as ImageConfig;
        setConfig(nextConfig);
        setModel(nextConfig.defaultModel);
        setSize(
          isImageSizeAllowedForModel(
            nextConfig.defaultSize,
            nextConfig.defaultModel,
          )
            ? nextConfig.defaultSize
            : nextConfig.allowedSizes.find((value) =>
                isImageSizeAllowedForModel(value, nextConfig.defaultModel),
              ) || "1024x1024",
        );
        setQuality(nextConfig.defaultQuality);
        setN((current) => Math.min(current, nextConfig.maxImagesPerRequest));
      })
      .catch(() =>
        notify.error({
          key: "image-config",
          message: "生图配置加载失败",
          description: "当前将使用默认配置，请刷新页面后重试",
          position: "topRight",
        }),
      );
  }, [session]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (current >= 92) return current;
        if (current < 36) return Math.min(92, current + 7);
        if (current < 72) return Math.min(92, current + 4);
        return Math.min(92, current + 1);
      });
    }, 800);
    return () => window.clearInterval(timer);
  }, [loading]);

  if (isPending) {
    return <AppLoading />;
  }

  if (!session) {
    return <AppLoading label="正在前往登录页…" />;
  }

  const user = session.user as typeof session.user & {
    quota?: number;
    used?: number;
    role?: string;
  };
  const modelOptions = config.allowedModels.map((value) => ({
    key: value,
    label: value,
  }));
  const sizeOptions = allSizeOptions.filter(
    (option) =>
      config.allowedSizes.includes(option.key) &&
      isImageSizeAllowedForModel(option.key, model),
  );
  const qualityOptions = allQualityOptions.filter((option) =>
    config.allowedQualities.includes(option.key),
  );
  const countOptions = Array.from(
    { length: config.maxImagesPerRequest },
    (_, index) => ({
      key: String(index + 1),
      label: `${index + 1} 张图片`,
    }),
  );

  function handleModelChange(nextModel: string) {
    setModel(nextModel);
    if (isImageSizeAllowedForModel(size, nextModel)) return;

    const nextSize = config.allowedSizes.find((value) =>
      isImageSizeAllowedForModel(value, nextModel),
    );
    if (nextSize) setSize(nextSize);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    notify.destroy("image-generate");
    setGenerationProgress(8);
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
        notify.error({
          key: "image-generate",
          message: "生图失败",
          description: data.error || "请稍后重试",
          position: "topRight",
        });
        return;
      }
      const images = data.images || [];
      setResults(images);
      setRemaining(data.remainingQuota);
      if (data.warning) {
        notify.warning({
          key: "image-generate",
          message: "部分图片生成完成",
          description: data.warning,
          position: "topRight",
        });
      } else {
        notify.success({
          key: "image-generate",
          message: "图片生成完成",
          description: `本次共生成 ${images.length} 张图片，已保存到作品库`,
          position: "topRight",
        });
      }
      setGenerationProgress(100);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
    } catch (err: unknown) {
      notify.error({
        key: "image-generate",
        message: "生图失败",
        description: err instanceof Error ? err.message : "网络请求失败",
        position: "topRight",
      });
    } finally {
      setLoading(false);
      setGenerationProgress(0);
    }
  }

  return (
    <AppShell active="generate" user={user} quota={remaining ?? undefined}>
      <div className="lumina-grid">
        <Card className="lumina-panel" color="default">
          <div className="lumina-panel-heading">
            <div>
              <p className="lumina-kicker">LUMINA WORKSHOP</p>
              <Title size="large" color="app-teal">
                灵感工坊
              </Title>
              <p className="lumina-description">
                描述你想象中的画面，Lumina 会将它变成图像。
              </p>
            </div>
            <Icon name="icon-diy" size={62} bounce />
          </div>

          <Divider type="dashed-brown" style={{ marginBottom: 22 }} />

          <form onSubmit={handleGenerate} className="lumina-form">
            <div className="lumina-field">
              <label className="lumina-field-label" htmlFor="prompt">
                画面描述
              </label>
              <textarea
                id="prompt"
                required
                maxLength={config.promptMaxLength}
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="lumina-textarea"
                placeholder="例如：雨后的森林小屋，窗户透出暖光，水彩插画风格…"
              />
              <span className="lumina-field-hint">
                加上光线、构图和艺术风格，通常会得到更丰富的结果。最多
                {config.promptMaxLength} 个字符。
              </span>
            </div>

            <div className="lumina-options-grid">
              <div className="lumina-field lumina-select-wrap">
                <label className="lumina-field-label" id="model-label">
                  模型
                </label>
                <Select
                  value={model}
                  onChange={handleModelChange}
                  options={modelOptions}
                  aria-labelledby="model-label"
                />
              </div>
              <div className="lumina-field lumina-select-wrap">
                <label className="lumina-field-label" id="size-label">
                  画布
                </label>
                <Select
                  value={size}
                  onChange={setSize}
                  options={sizeOptions}
                  aria-labelledby="size-label"
                />
              </div>
              <div className="lumina-field lumina-select-wrap">
                <label className="lumina-field-label" id="quality-label">
                  质量
                </label>
                <Select
                  value={quality}
                  onChange={setQuality}
                  options={qualityOptions}
                  aria-labelledby="quality-label"
                />
              </div>
              <div className="lumina-field lumina-select-wrap">
                <label className="lumina-field-label" id="count-label">
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
              {loading ? "正在生成图像…" : `开始创作 · 消耗 ${n} 额度`}
            </Button>
          </form>
        </Card>

        <Card className="lumina-panel" color="default" type="dashed">
          <div className="lumina-panel-heading">
            <div>
              <p className="lumina-kicker">LATEST CREATION</p>
              <Title color="app-yellow">本次作品</Title>
            </div>
            {results.length > 0 && (
              <Tag color="app-teal" variant="soft">
                {results.length} 张已完成
              </Tag>
            )}
          </div>

          {loading && (
            <div className="lumina-result-empty">
              <div>
                <div className="lumina-generation-progress">
                  <Progress
                    percent={generationProgress}
                    size="large"
                    infoPosition="top"
                    aria-label="图片生成进度"
                    infoFormat={(percent) => {
                      if (percent >= 100) return "图片生成完成";
                      if (percent < 36) return "正在提交创意…";
                      if (percent < 72) return "正在绘制画面…";
                      return "正在处理高清细节…";
                    }}
                  />
                </div>
                <p className="lumina-empty-title">正在绘制你的灵感</p>
                <p className="lumina-empty-copy">
                  生成过程可能需要一点时间，完成后作品会自动保存。
                </p>
              </div>
            </div>
          )}

          {results.length === 0 && !loading && (
            <div className="lumina-result-empty">
              <div>
                <span className="lumina-empty-icon">
                  <Icon name="icon-camera" size={54} bounce />
                </span>
                <p className="lumina-empty-title">画布还是空白的</p>
                <p className="lumina-empty-copy">
                  在左侧写下第一个创意，完成后的图片会在这里出现。
                </p>
              </div>
            </div>
          )}

          {results.length > 0 && !loading && (
            <div className="lumina-results-grid">
              {results.map((img) => (
                <Card key={img.id} className="lumina-image-card" hoverable>
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noreferrer"
                    className="lumina-image-link"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt="AI 生成作品"
                      className="lumina-image"
                    />
                  </a>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
