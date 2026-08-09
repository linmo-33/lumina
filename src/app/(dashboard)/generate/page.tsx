"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppLoading, AppShell } from "@/components/app-shell";
import { notify } from "@/components/app-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Images, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { CHATGPT2API_MAX_SOURCE_IMAGE_BYTES, CHATGPT2API_MAX_SOURCE_IMAGE_MB, CHATGPT2API_PAGE_MAX_IMAGES, CHATGPT2API_QUALITY_OPTIONS, CHATGPT2API_SIZE_OPTIONS, isImageSizeAllowedForModel } from "@/lib/image-options";

type CreationMode = "generate" | "edit";
interface ImageConfig { defaultModel: string; allowedModels: string[]; defaultSize: string; allowedSizes: string[]; defaultQuality: string; allowedQualities: string[]; maxImagesPerRequest: number; promptMaxLength: number; }
const allSizes = CHATGPT2API_SIZE_OPTIONS;
const allQualities = CHATGPT2API_QUALITY_OPTIONS;
const fallbackConfig: ImageConfig = { defaultModel: "gpt-image-2", allowedModels: ["gpt-image-2"], defaultSize: "1024x1024", allowedSizes: allSizes.map((item) => item.value), defaultQuality: "auto", allowedQualities: allQualities.map((item) => item.value), maxImagesPerRequest: CHATGPT2API_PAGE_MAX_IMAGES, promptMaxLength: 4000 };
const initialImage = fallbackConfig;

export default function GeneratePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [config, setConfig] = useState<ImageConfig>(initialImage);
  const [mode, setMode] = useState<CreationMode>("generate");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(initialImage.defaultModel);
  const [size, setSize] = useState(initialImage.defaultSize);
  const [quality, setQuality] = useState(initialImage.defaultQuality);
  const [count, setCount] = useState(1);
  const [source, setSource] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [results, setResults] = useState<{ id: string; url: string }[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!isPending && !session) router.replace("/login"); }, [isPending, session, router]);
  useEffect(() => {
    if (!session) return;
    fetch("/api/images/config").then((response) => response.json()).then((payload) => {
      if (!payload.success) return;
      const next = payload.data as ImageConfig;
      setConfig(next); setModel(next.defaultModel); setQuality(next.defaultQuality);
      setSize(next.allowedSizes.find((value) => isImageSizeAllowedForModel(value, next.defaultModel)) ?? "1024x1024");
    }).catch(() => notify.error({ key: "image-config", message: "生图配置加载失败", description: "当前使用默认配置", position: "topRight" }));
  }, [session]);
  useEffect(() => { if (!loading) return; const timer = window.setInterval(() => setProgress((value) => Math.min(value + (value < 36 ? 7 : value < 72 ? 4 : 1), 92)), 800); return () => window.clearInterval(timer); }, [loading]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const sizeOptions = useMemo(() => config.allowedSizes.filter((value) => isImageSizeAllowedForModel(value, model)), [config.allowedSizes, model]);
  const canSubmit = Boolean(prompt.trim()) && !loading && (mode === "generate" || source);
  function changeModel(value: string) { setModel(value); if (!isImageSizeAllowedForModel(size, value)) setSize(config.allowedSizes.find((item) => isImageSizeAllowedForModel(item, value)) ?? "1024x1024"); }
  function changeMode(value: string) { if (loading) return; setMode(value as CreationMode); setResults([]); }
  function chooseSource(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > CHATGPT2API_MAX_SOURCE_IMAGE_BYTES) { notify.error({ key: "source", message: "参考图片不可用", description: `请选择 PNG、JPG 或 WebP，且不超过 ${CHATGPT2API_MAX_SOURCE_IMAGE_MB} MB`, position: "topRight" }); return; }
    if (preview) URL.revokeObjectURL(preview);
    setSource(file); setPreview(URL.createObjectURL(file)); setResults([]);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true); setProgress(8); setResults([]);
    try {
      let response: Response;
      if (mode === "edit" && source) {
        const body = new FormData(); body.append("image", source); body.append("prompt", prompt); body.append("model", model); body.append("size", size); body.append("quality", quality); body.append("n", String(count));
        response = await fetch("/api/images/edit", { method: "POST", body });
      } else response = await fetch("/api/images/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, model, size, quality, n: count }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "请求失败");
      setResults(payload.images ?? []); setRemaining(payload.remainingQuota ?? null); setProgress(100);
      notify.success({ key: "image-create", message: mode === "edit" ? "图片编辑完成" : "图片生成完成", description: `已保存 ${payload.images?.length ?? 0} 张作品`, position: "topRight" });
    } catch (error) {
      notify.error({ key: "image-create", message: mode === "edit" ? "图片编辑失败" : "图片生成失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" });
    } finally { window.setTimeout(() => { setLoading(false); setProgress(0); }, 350); }
  }

  if (isPending) return <AppLoading />;
  if (!session) return <AppLoading label="正在前往登录页…" />;
  const user = session.user as NonNullable<typeof session>["user"] & { quota?: number; role?: string; image?: string | null };

  return <AppShell active="generate" user={user} quota={remaining ?? user.quota}>
    <div className="lumina-page-heading"><div><p className="lumina-eyebrow">CREATE</p><h1>今天，想创造什么？</h1><p>把你的想法变成独一无二的图像</p></div></div>
    <div className="lumina-create-workspace">
      <Card className="lumina-create-controls">
        <CardHeader>
          <CardTitle>创作控制台</CardTitle>
          <CardDescription>描述画面并设置生成参数</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={changeMode} className="mb-6"><TabsList className="grid w-full grid-cols-2 rounded-full"><TabsTrigger value="generate" className="rounded-full">文生图</TabsTrigger><TabsTrigger value="edit" className="rounded-full">图生图</TabsTrigger></TabsList></Tabs>
          <form onSubmit={submit} className="lumina-create-form">
            <FieldGroup>
              {mode === "edit" && <Field><FieldLabel>参考图片</FieldLabel><div className="lumina-upload-box overflow-hidden p-4">{preview ? <img src={preview} alt="参考图预览" className="h-full max-h-40 w-full rounded-lg object-cover" /> : <ImagePlus aria-hidden="true" />}<strong>{source?.name ?? "添加参考图"}</strong><span>支持 JPG / PNG / WebP，最大 {CHATGPT2API_MAX_SOURCE_IMAGE_MB} MB</span><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => chooseSource(event.target.files?.[0])} /><Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>{source ? "更换图片" : "选择图片"}</Button></div></Field>}
              <Field>
                <FieldLabel htmlFor="prompt">{mode === "edit" ? "编辑描述" : "画面描述"}</FieldLabel>
                <Textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={config.promptMaxLength} rows={mode === "edit" ? 5 : 9} className="lumina-prompt-box" placeholder={mode === "edit" ? "描述需要改变的内容，同时说明要保留的主体…" : "描述你想象中的画面…"} required />
              </Field>
              <div className="lumina-create-settings-grid">
                <Field><FieldLabel>模型</FieldLabel><Select value={model} onValueChange={(value) => value && changeModel(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{config.allowedModels.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <Field><FieldLabel>画布</FieldLabel><Select value={size} onValueChange={(value) => value && setSize(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{sizeOptions.map((item) => <SelectItem key={item} value={item}>{allSizes.find((option) => option.value === item)?.label ?? item}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <Field><FieldLabel>质量</FieldLabel><Select value={quality} onValueChange={(value) => value && setQuality(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{config.allowedQualities.map((item) => <SelectItem key={item} value={item}>{allQualities.find((option) => option.value === item)?.label ?? item}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <Field><FieldLabel>数量</FieldLabel><Select value={String(count)} onValueChange={(value) => value && setCount(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Array.from({ length: config.maxImagesPerRequest }, (_, index) => <SelectItem key={index} value={String(index + 1)}>{index + 1} 张</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              </div>
            </FieldGroup>
            <Button type="submit" size="lg" className="lumina-create-button" disabled={!canSubmit}>{loading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}{loading ? "正在生成…" : `开始创作 · ${count} 灵点`}</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lumina-create-canvas">
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>{loading ? "正在绘制你的灵感" : results.length ? "本次作品" : "创作画布"}</CardTitle><CardDescription>{loading ? "完成后作品会自动保存" : results.length ? `${results.length} 张作品已完成` : "生成结果会直接出现在这里"}</CardDescription></div>
          {results.length > 0 && <Button variant="ghost" size="sm" onClick={() => setResults([])}><RefreshCw data-icon="inline-start" />清空</Button>}
        </CardHeader>
        <CardContent className="lumina-canvas-content">{loading ? <div className="lumina-canvas-state"><div className="grid w-full max-w-md gap-4"><span className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-primary"><LoaderCircle className="size-7 animate-spin" /></span><Progress value={progress} /><span className="text-center text-sm text-muted-foreground">正在处理高清细节…</span></div></div> : results.length ? <div className="lumina-result-grid">{results.map((image) => <a key={image.id} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt="生成结果" /></a>)}</div> : <div className="lumina-canvas-state"><span className="lumina-canvas-empty-icon"><Images /></span><div><strong>画布还是空白的</strong><p>在左侧写下第一个创意，完成后的图片会在这里出现。</p></div></div>}</CardContent>
      </Card>
    </div>
  </AppShell>;
}
