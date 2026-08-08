export const CHATGPT2API_MODELS = [
  "gpt-image-2",
  "codex-gpt-image-2",
] as const;

export const CHATGPT2API_SIZE_OPTIONS = [
  { value: "1024x1024", label: "1:1 · 1024 × 1024", codexOnly: false },
  { value: "1024x1536", label: "2:3 · 1024 × 1536", codexOnly: false },
  { value: "1536x1024", label: "3:2 · 1536 × 1024", codexOnly: false },
  { value: "1024x1365", label: "3:4 · 1024 × 1365", codexOnly: false },
  { value: "1365x1024", label: "4:3 · 1365 × 1024", codexOnly: false },
  { value: "1088x1920", label: "9:16 · 1088 × 1920", codexOnly: false },
  { value: "1920x1088", label: "16:9 · 1920 × 1088", codexOnly: false },
  { value: "2048x2048", label: "1:1 (2K) · 2048 × 2048", codexOnly: true },
  { value: "2560x1440", label: "16:9 (2K) · 2560 × 1440", codexOnly: true },
  { value: "1440x2560", label: "9:16 (2K) · 1440 × 2560", codexOnly: true },
  { value: "3840x2160", label: "16:9 (4K) · 3840 × 2160", codexOnly: true },
  { value: "2160x3840", label: "9:16 (4K) · 2160 × 3840", codexOnly: true },
  { value: "auto", label: "自动 · 按 1024 × 1024 传递", codexOnly: false },
] as const;

export const CHATGPT2API_QUALITIES = [
  "auto",
  "low",
  "medium",
  "high",
] as const;

export const CHATGPT2API_QUALITY_OPTIONS = [
  { value: "auto", label: "自动" },
  { value: "low", label: "快速" },
  { value: "medium", label: "标准" },
  { value: "high", label: "高清" },
] as const;

export const CHATGPT2API_MAX_IMAGES_PER_CALL = 4;
export const CHATGPT2API_PAGE_MAX_IMAGES = 10;

export function isImageSizeAllowedForModel(size: string, model: string) {
  const option = CHATGPT2API_SIZE_OPTIONS.find((item) => item.value === size);
  return Boolean(
    option && (!option.codexOnly || model.toLowerCase().includes("codex")),
  );
}
