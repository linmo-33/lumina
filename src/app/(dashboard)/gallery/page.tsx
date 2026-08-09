"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppLoading, AppShell } from "@/components/app-shell";
import { notify } from "@/components/app-notifications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowDownToLine, ArrowUpDown, ChevronDown, Copy, ImagePlus, LoaderCircle, Minus, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

interface HistoryItem { id: string; type: string; model: string; prompt: string; size: string | null; quality: string | null; imageUrl: string | null; cost: number; createdAt: string; }
interface ImageDimensions { width: number; height: number }
type Filter = "all" | "generate" | "edit";

function getImageAspectRatio(size: string | null) {
  if (!size || size === "auto") return "1 / 1";
  const [width, height] = size.split("x").map(Number);
  return width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";
}

export default function GalleryPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [galleryAspectRatios, setGalleryAspectRatios] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [zoom, setZoom] = useState(1);
  const [imageNaturalSize, setImageNaturalSize] = useState<ImageDimensions | null>(null);
  const [stageSize, setStageSize] = useState<ImageDimensions | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [lightboxDeleteConfirm, setLightboxDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const zoomCenterRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { if (!isPending && !session) router.replace("/login"); }, [isPending, session, router]);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: "20", sort });
      if (filter !== "all") params.set("type", filter);
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/images/history?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "作品加载失败");
      setItems((current) => append ? [...current, ...(payload.data ?? [])] : (payload.data ?? []));
      setPage(nextPage); setHasMore(Boolean(payload.hasMore));
    } catch (error) {
      notify.error({ key: "gallery-load", message: "作品加载失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" });
    } finally { setLoading(false); setLoadingMore(false); }
  }, [filter, query, sort]);

  const rememberGalleryAspectRatio = useCallback((id: string, image: HTMLImageElement) => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const ratio = `${image.naturalWidth} / ${image.naturalHeight}`;
    setGalleryAspectRatios((current) => current[id] === ratio ? current : { ...current, [id]: ratio });
  }, []);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => void load(1, false), 0);
    return () => window.clearTimeout(timer);
  }, [session, load]);

  const gridItems = useMemo(() => items.filter((item) => item.imageUrl), [items]);
  const fittedImageSize = useMemo(() => {
    if (!imageNaturalSize || !stageSize) return null;
    const availableWidth = Math.max(1, stageSize.width - 24);
    const availableHeight = Math.max(1, stageSize.height - 24);
    const ratio = Math.min(availableWidth / imageNaturalSize.width, availableHeight / imageNaturalSize.height);
    return { width: Math.max(1, imageNaturalSize.width * ratio), height: Math.max(1, imageNaturalSize.height * ratio) };
  }, [imageNaturalSize, stageSize]);

  const closeLightbox = useCallback(() => {
    setSelected(null); setZoom(1); setImageNaturalSize(null); setStageSize(null); setPromptExpanded(false); setLightboxDeleteConfirm(false); setDeleting(false);
  }, []);

  function openLightbox(item: HistoryItem) {
    setSelected(item); setZoom(1); setImageNaturalSize(null); setStageSize(null); setPromptExpanded(false); setLightboxDeleteConfirm(false);
  }

  const rememberZoomCenter = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    zoomCenterRef.current = { x: (stage.scrollLeft + stage.clientWidth / 2) / stage.scrollWidth, y: (stage.scrollTop + stage.clientHeight / 2) / stage.scrollHeight };
  }, []);

  const changeZoom = useCallback((delta: number) => {
    rememberZoomCenter();
    setZoom((current) => Math.min(3, Math.max(0.5, Number((current + delta).toFixed(2)))));
  }, [rememberZoomCenter]);

  const resetZoom = useCallback(() => { rememberZoomCenter(); setZoom(1); }, [rememberZoomCenter]);

  async function copyPrompt() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.prompt);
      notify.success({ key: "gallery-copy-prompt", message: "提示词已复制", position: "topRight" });
    } catch {
      notify.error({ key: "gallery-copy-prompt", message: "提示词复制失败", description: "请手动选择提示词后复制", position: "topRight" });
    }
  }

  async function deleteSelectedItem() {
    if (!selected || deleting) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/images/history", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "删除失败");
      setItems((current) => current.filter((item) => item.id !== selected.id));
      closeLightbox();
      notify.success({ key: "gallery-delete", message: "作品已删除", position: "topRight" });
    } catch (error) {
      setDeleting(false);
      notify.error({ key: "gallery-delete", message: "删除失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" });
    }
  }

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { closeLightbox(); return; }
      if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(0.25); return; }
      if (event.key === "-") { event.preventDefault(); changeZoom(-0.25); return; }
      if (event.key === "0") { event.preventDefault(); resetZoom(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(lightboxRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") || []);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [selected, changeZoom, closeLightbox, resetZoom]);

  useEffect(() => {
    if (!selected || !stageRef.current) return;
    const stage = stageRef.current;
    const measure = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(stage);
    return () => observer.disconnect();
  }, [selected]);

  useLayoutEffect(() => {
    const stage = stageRef.current; const center = zoomCenterRef.current;
    if (!stage || !center) return;
    stage.scrollLeft = center.x * stage.scrollWidth - stage.clientWidth / 2;
    stage.scrollTop = center.y * stage.scrollHeight - stage.clientHeight / 2;
    zoomCenterRef.current = null;
  }, [zoom]);
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/images/history", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deleteTarget.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "删除失败");
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) setSelected(null);
      notify.success({ key: "gallery-delete", message: "作品已删除", position: "topRight" });
    } catch (error) { notify.error({ key: "gallery-delete", message: "删除失败", description: error instanceof Error ? error.message : "请稍后重试", position: "topRight" }); }
    finally { setDeleting(false); setDeleteTarget(null); }
  }

  if (isPending || !session) return <AppLoading label={session ? "正在加载作品…" : "正在前往登录页…"} />;

  const user = session.user as typeof session.user & { quota?: number; role?: string; image?: string | null };
  return <AppShell active="gallery" user={user}>
    <div className="lumina-page-heading"><div><p className="lumina-eyebrow">YOUR WORKS</p><h1>我的作品</h1><p>每一幅作品，都是灵感的记录</p></div></div>
    <div className="lumina-gallery-toolbar"><Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}><TabsList><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="generate">文生图</TabsTrigger><TabsTrigger value="edit">图生图</TabsTrigger></TabsList></Tabs><div className="lumina-gallery-actions"><div className="relative lumina-gallery-search"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(1, false); }} placeholder="搜索作品名称或描述…" className="lumina-gallery-search-input pl-10" aria-label="搜索作品" /></div><Select value={sort} onValueChange={(value) => value && setSort(value as "newest" | "oldest")}><SelectTrigger className="lumina-gallery-sort" aria-label="作品排序"><ArrowUpDown /><SelectValue /></SelectTrigger><SelectContent align="end"><SelectGroup><SelectItem value="newest">最近创建</SelectItem><SelectItem value="oldest">最早创建</SelectItem></SelectGroup></SelectContent></Select></div></div>
    {loading ? <div className="grid min-h-80 place-items-center"><LoaderCircle className="size-8 animate-spin text-primary" /></div> : gridItems.length === 0 ? <Card className="grid min-h-80 place-items-center text-center"><div><ImagePlus className="mx-auto mb-3 size-10 text-muted-foreground/50" /><p className="font-medium">还没有符合条件的作品</p><p className="mt-2 text-sm text-muted-foreground">去创作页完成第一幅作品吧。</p></div></Card> : <div className="lumina-gallery-masonry">{gridItems.map((item) => {
      const aspectRatio = galleryAspectRatios[item.id] ?? getImageAspectRatio(item.size);
      return <article key={item.id} className="lumina-gallery-card">
        <div className="lumina-gallery-card-media" style={{ aspectRatio }}>
          <button type="button" className="lumina-gallery-card-trigger" onClick={() => openLightbox(item)}>
            <img src={item.imageUrl!} alt={item.prompt} loading="lazy" decoding="async" onLoad={(event) => rememberGalleryAspectRatio(item.id, event.currentTarget)} />
          </button>
        </div>
        <div className="lumina-gallery-overlay"><div><strong>{item.prompt}</strong><span>{item.type === "edit" ? "图生图" : "文生图"} · {item.size ?? "自动尺寸"}</span></div><div className="lumina-gallery-overlay-actions"><a className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted" href={item.imageUrl!} download={`lumina-${item.id}.png`} aria-label="下载作品"><ArrowDownToLine className="size-4" /></a><Button variant="ghost" size="icon" aria-label="删除作品" onClick={(event) => { event.stopPropagation(); setDeleteTarget(item); }}><Trash2 /></Button></div></div>
      </article>;
    })}</div>}
    {!loading && gridItems.length > 0 && <div className="lumina-load-more">{hasMore ? <Button variant="outline" disabled={loadingMore} onClick={() => void load(page + 1, true)}>{loadingMore ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}加载更多</Button> : <span>已经看到全部作品</span>}</div>}

    {selected?.imageUrl && createPortal(<div ref={lightboxRef} className="lumina-lightbox" role="dialog" aria-modal="true" aria-label="作品图片预览" onMouseDown={(event) => { if (event.target === event.currentTarget) closeLightbox(); }}>
      <div className="lumina-lightbox-toolbar" aria-label="图片操作">
        <Button type="button" variant="ghost" size="icon" className="lumina-lightbox-action" onClick={() => changeZoom(-0.25)} disabled={zoom <= 0.5} aria-label="缩小图片" title="缩小（-）"><Minus /></Button>
        <span className="lumina-lightbox-zoom" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <Button type="button" variant="ghost" size="icon" className="lumina-lightbox-action" onClick={() => changeZoom(0.25)} disabled={zoom >= 3} aria-label="放大图片" title="放大（+）"><Plus /></Button>
        <Button type="button" variant="ghost" size="icon" className="lumina-lightbox-action" onClick={resetZoom} disabled={zoom === 1} aria-label="恢复原始缩放" title="恢复（0）"><RefreshCw /></Button>
        <span className="lumina-lightbox-divider" aria-hidden="true" />
        <a className="lumina-lightbox-action" href={selected.imageUrl} download={`lumina-${selected.id}.png`} aria-label="下载图片" title="下载"><ArrowDownToLine /></a>
        <Button ref={closeButtonRef} type="button" variant="ghost" size="icon" className="lumina-lightbox-action" onClick={closeLightbox} aria-label="关闭图片预览" title="关闭（Esc）"><X /></Button>
      </div>
      <div ref={stageRef} className="lumina-lightbox-stage"><div className="lumina-lightbox-stage-inner" style={{ width: fittedImageSize ? fittedImageSize.width * zoom + 24 : "100%", height: fittedImageSize ? fittedImageSize.height * zoom + 24 : "100%" }}><img src={selected.imageUrl} alt={selected.prompt} className="lumina-lightbox-image" style={fittedImageSize ? { width: fittedImageSize.width * zoom, height: fittedImageSize.height * zoom, maxWidth: "none", maxHeight: "none" } : undefined} onLoad={(event) => setImageNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} draggable={false} /></div></div>
      <section className={`lumina-lightbox-prompt${promptExpanded ? " is-expanded" : ""}`} aria-label="作品提示词">
        <button type="button" className="lumina-lightbox-prompt-toggle" onClick={() => { setPromptExpanded((current) => !current); setLightboxDeleteConfirm(false); }} aria-expanded={promptExpanded}><span className="lumina-lightbox-prompt-label">PROMPT</span><span className="lumina-lightbox-prompt-preview">{selected.prompt}</span><ChevronDown className="lumina-lightbox-prompt-chevron" style={{ transform: promptExpanded ? "rotate(180deg)" : undefined }} /></button>
        {promptExpanded && <div className="lumina-lightbox-prompt-content"><p>{selected.prompt}</p><div className="lumina-lightbox-prompt-meta"><span>{selected.model}</span><span>{selected.size || "自动尺寸"}</span><span>{selected.type === "edit" ? "图生图" : "文生图"}</span><time>{new Date(selected.createdAt).toLocaleString("zh-CN")}</time></div><div className="lumina-lightbox-prompt-actions"><Button type="button" variant="ghost" size="sm" onClick={() => void copyPrompt()}><Copy data-icon="inline-start" />复制提示词</Button>{lightboxDeleteConfirm ? <div className="lumina-lightbox-delete-confirm"><span>删除后无法恢复，也不会退还灵点。</span><Button type="button" variant="ghost" size="sm" onClick={() => setLightboxDeleteConfirm(false)} disabled={deleting}>取消</Button><Button type="button" variant="ghost" size="sm" className="is-danger" onClick={() => void deleteSelectedItem()} disabled={deleting}>{deleting ? "删除中…" : "确认删除"}</Button></div> : <Button type="button" variant="ghost" size="sm" className="is-danger" onClick={() => setLightboxDeleteConfirm(true)}><Trash2 data-icon="inline-start" />删除作品</Button>}</div></div>}
      </section>
    </div>, document.body)}
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这幅作品？</AlertDialogTitle><AlertDialogDescription>删除后无法恢复，也不会退还灵点。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} onClick={(event) => { event.preventDefault(); void confirmDelete(); }}>{deleting ? "删除中…" : "确认删除"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </AppShell>;
}
