"use client";

import { useEffect, useRef, useState } from "react";
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

type CreationMode = "generate" | "edit";

const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_SOURCE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
  const [mode, setMode] = useState<CreationMode>("generate");
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const sourcePreviewRef = useRef("");

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

  useEffect(
    () => () => {
      if (sourcePreviewRef.current) {
        URL.revokeObjectURL(sourcePreviewRef.current);
      }
    },
    [],
  );

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

  function handleModeChange(nextMode: CreationMode) {
    if (loading || nextMode === mode) return;
    setMode(nextMode);
    setResults([]);
  }

  function handleSourceImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const hasSupportedExtension = /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!ACCEPTED_SOURCE_IMAGE_TYPES.has(file.type) && !hasSupportedExtension) {
      event.target.value = "";
      notify.error({
        key: "source-image",
        message: "图片格式不支持",
        description: "请选择 PNG、JPG 或 WebP 图片",
        position: "topRight",
      });
      return;
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      event.target.value = "";
      notify.error({
        key: "source-image",
        message: "图片文件过大",
        description: "参考图片不能超过 25 MB",
        position: "topRight",
      });
      return;
    }

    notify.destroy("source-image");
    if (sourcePreviewRef.current) {
      URL.revokeObjectURL(sourcePreviewRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    sourcePreviewRef.current = objectUrl;
    setSourcePreview(objectUrl);
    setSourceImage(file);
    setResults([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "edit" && !sourceImage) {
      notify.error({
        key: "image-create",
        message: "请先选择参考图片",
        description: "上传一张原图后，Lumina 才能按描述进行编辑",
        position: "topRight",
      });
      return;
    }

    notify.destroy("image-create");
    setGenerationProgress(8);
    setLoading(true);
    setResults([]);
    try {
      let res: Response;
      if (mode === "edit" && sourceImage) {
        const formData = new FormData();
        formData.append("image", sourceImage);
        formData.append("prompt", prompt);
        formData.append("model", model);
        formData.append("size", size);
        formData.append("quality", quality);
        formData.append("n", String(n));
        res = await fetch("/api/images/edit", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/images/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, model, size, quality, n }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        notify.error({
          key: "image-create",
          message: mode === "edit" ? "图片编辑失败" : "生图失败",
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
          key: "image-create",
          message: mode === "edit" ? "部分图片编辑完成" : "部分图片生成完成",
          description: data.warning,
          position: "topRight",
        });
      } else {
        notify.success({
          key: "image-create",
          message: mode === "edit" ? "图片编辑完成" : "图片生成完成",
          description: `本次共完成 ${images.length} 张图片，已保存到作品库`,
          position: "topRight",
        });
      }
      setGenerationProgress(100);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
    } catch (err: unknown) {
      notify.error({
        key: "image-create",
        message: mode === "edit" ? "图片编辑失败" : "生图失败",
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
                {mode === "edit"
                  ? "上传一张参考图，描述需要改变的内容。"
                  : "描述你想象中的画面，Lumina 会将它变成图像。"}
              </p>
            </div>
            <Icon name="icon-diy" size={62} bounce />
          </div>

          <Divider type="dashed-brown" style={{ marginBottom: 22 }} />

          <div className="lumina-mode-switch" aria-label="创作模式">
            <Button
              htmlType="button"
              type={mode === "generate" ? "primary" : "default"}
              size="small"
              disabled={loading}
              onClick={() => handleModeChange("generate")}
              icon={<Icon name="icon-design" size={18} />}
            >
              文字生图
            </Button>
            <Button
              htmlType="button"
              type={mode === "edit" ? "primary" : "default"}
              size="small"
              disabled={loading}
              onClick={() => handleModeChange("edit")}
              icon={<Icon name="icon-camera" size={18} />}
            >
              图片编辑
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="lumina-form">
            {mode === "edit" && (
              <div className="lumina-field">
                <label className="lumina-field-label" htmlFor="source-image">
                  参考图片
                </label>
                <div className="lumina-source-picker">
                  <div
                    className={`lumina-source-preview${sourcePreview ? " has-image" : ""}`}
                  >
                    {sourcePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sourcePreview} alt="待编辑的参考图片" />
                    ) : (
                      <span>
                        <Icon name="icon-camera" size={44} bounce />
                      </span>
                    )}
                  </div>
                  <div className="lumina-source-actions">
                    <p className="lumina-source-name">
                      {sourceImage ? sourceImage.name : "选择一张需要编辑的图片"}
                    </p>
                    <span className="lumina-field-hint">
                      支持 PNG、JPG、WebP，文件最大 25 MB。
                    </span>
                    <Button
                      htmlType="button"
                      type="default"
                      size="small"
                      disabled={loading}
                      onClick={() => sourceInputRef.current?.click()}
                    >
                      {sourceImage ? "更换图片" : "选择图片"}
                    </Button>
                    <input
                      ref={sourceInputRef}
                      id="source-image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                      hidden
                      onChange={handleSourceImageChange}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="lumina-field">
              <label className="lumina-field-label" htmlFor="prompt">
                {mode === "edit" ? "编辑描述" : "画面描述"}
              </label>
              <textarea
                id="prompt"
                required
                maxLength={config.promptMaxLength}
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="lumina-textarea"
                placeholder={
                  mode === "edit"
                    ? "例如：保留主体和构图，将背景改成雨后的森林，整体变为水彩插画风格…"
                    : "例如：雨后的森林小屋，窗户透出暖光，水彩插画风格…"
                }
              />
              <span className="lumina-field-hint">
                {mode === "edit"
                  ? "说明需要保留和修改的部分，结果会更准确。最多"
                  : "加上光线、构图和艺术风格，通常会得到更丰富的结果。最多"}
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
              disabled={
                loading || !prompt.trim() || (mode === "edit" && !sourceImage)
              }
              icon={
                <Icon
                  name={mode === "edit" ? "icon-camera" : "icon-design"}
                  size={22}
                />
              }
            >
              {loading
                ? mode === "edit"
                  ? "正在编辑图像…"
                  : "正在生成图像…"
                : `${mode === "edit" ? "开始编辑" : "开始创作"} · 消耗 ${n} 灵点`}
            </Button>
          </form>
        </Card>

        <Card className="lumina-panel" color="default" type="dashed">
          <div className="lumina-panel-heading">
            <div>
              <p className="lumina-kicker">
                {mode === "edit" ? "LATEST EDIT" : "LATEST CREATION"}
              </p>
              <Title color="app-yellow">
                {mode === "edit" ? "编辑结果" : "本次作品"}
              </Title>
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
                    aria-label={mode === "edit" ? "图片编辑进度" : "图片生成进度"}
                    infoFormat={(percent) => {
                      if (percent >= 100)
                        return mode === "edit" ? "图片编辑完成" : "图片生成完成";
                      if (percent < 36)
                        return mode === "edit" ? "正在上传参考图…" : "正在提交创意…";
                      if (percent < 72)
                        return mode === "edit" ? "正在理解编辑要求…" : "正在绘制画面…";
                      return "正在处理高清细节…";
                    }}
                  />
                </div>
                <p className="lumina-empty-title">
                  {mode === "edit" ? "正在重绘参考图片" : "正在绘制你的灵感"}
                </p>
                <p className="lumina-empty-copy">
                  {mode === "edit" ? "编辑" : "生成"}过程可能需要一点时间，
                  完成后作品会自动保存。
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
                  {mode === "edit"
                    ? "在左侧选择参考图并写下修改要求，结果会在这里出现。"
                    : "在左侧写下第一个创意，完成后的图片会在这里出现。"}
                </p>
              </div>
            </div>
          )}

          {results.length > 0 && !loading && (
            <div
              className={`lumina-results-grid${results.length === 1 ? " is-single" : ""}`}
            >
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
                      alt={mode === "edit" ? "AI 编辑作品" : "AI 生成作品"}
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
