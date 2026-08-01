"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  Icon,
  Notification,
  Tag,
  Title,
} from "animal-island-ui";
import { AppLoading, AppShell } from "@/components/app-shell";

interface HistoryItem {
  id: string;
  type: string;
  model: string;
  prompt: string;
  size: string | null;
  imageUrl: string | null;
  cost: number;
  createdAt: string;
}

type LightboxIconName =
  | "close"
  | "copy"
  | "delete"
  | "download"
  | "reset"
  | "zoomIn"
  | "zoomOut";

type ImageDimensions = {
  width: number;
  height: number;
};

function LightboxIcon({ name }: { name: LightboxIconName }) {
  const paths: Record<LightboxIconName, React.ReactNode> = {
    close: <path d="M6 6l12 12M18 6 6 18" />,
    copy: <path d="M9 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Zm-2 8H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" />,
    delete: <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" />,
    download: <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" />,
    reset: <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68M4 4v4.68h4.68" />,
    zoomIn: <path d="M11 8v6m-3-3h6m4.5 7.5L15 15m2-4a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />,
    zoomOut: <path d="M8 11h6m4.5 7.5L15 15m2-4a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name]}
      </g>
    </svg>
  );
}

export default function GalleryPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [zoom, setZoom] = useState(1);
  const [imageNaturalSize, setImageNaturalSize] =
    useState<ImageDimensions | null>(null);
  const [stageSize, setStageSize] = useState<ImageDimensions | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const zoomCenterRef = useRef<{ x: number; y: number } | null>(null);

  const fittedImageSize = useMemo(() => {
    if (!imageNaturalSize || !stageSize) return null;
    const availableWidth = Math.max(1, stageSize.width - 24);
    const availableHeight = Math.max(1, stageSize.height - 24);
    const ratio = Math.min(
      availableWidth / imageNaturalSize.width,
      availableHeight / imageNaturalSize.height,
    );
    return {
      width: Math.max(1, imageNaturalSize.width * ratio),
      height: Math.max(1, imageNaturalSize.height * ratio),
    };
  }, [imageNaturalSize, stageSize]);

  const closeLightbox = useCallback(() => {
    setSelectedItem(null);
    setZoom(1);
    setImageNaturalSize(null);
    setStageSize(null);
    setPromptExpanded(false);
    setDeleteConfirm(false);
    setDeleting(false);
  }, []);

  const rememberZoomCenter = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    zoomCenterRef.current = {
      x: (stage.scrollLeft + stage.clientWidth / 2) / stage.scrollWidth,
      y: (stage.scrollTop + stage.clientHeight / 2) / stage.scrollHeight,
    };
  }, []);

  const changeZoom = useCallback((delta: number) => {
    rememberZoomCenter();
    setZoom((current) =>
      Math.min(3, Math.max(0.5, Number((current + delta).toFixed(2)))),
    );
  }, [rememberZoomCenter]);

  const resetZoom = useCallback(() => {
    rememberZoomCenter();
    setZoom(1);
  }, [rememberZoomCenter]);

  function openLightbox(item: HistoryItem) {
    setSelectedItem(item);
    setZoom(1);
    setImageNaturalSize(null);
    setStageSize(null);
    setPromptExpanded(false);
    setDeleteConfirm(false);
  }

  async function copyPrompt() {
    if (!selectedItem) return;
    try {
      await navigator.clipboard.writeText(selectedItem.prompt);
      Notification.success({
        key: "gallery-copy-prompt",
        message: "提示词已复制",
        position: "topRight",
      });
    } catch {
      Notification.error({
        key: "gallery-copy-prompt",
        message: "提示词复制失败",
        description: "请手动选择提示词后复制",
        position: "topRight",
      });
    }
  }

  async function deleteSelectedItem() {
    if (!selectedItem || deleting) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/images/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedItem.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "作品删除失败");

      setItems((current) =>
        current.filter((item) => item.id !== selectedItem.id),
      );
      closeLightbox();
      Notification.success({
        key: "gallery-delete",
        message: "作品已删除",
        description: "作品已从你的作品库移除",
        position: "topRight",
      });
    } catch (error) {
      setDeleting(false);
      Notification.error({
        key: "gallery-delete",
        message: "作品删除失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        position: "topRight",
      });
    }
  }

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/images/history")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "作品加载失败");
        setItems(data.data || []);
      })
      .catch((caught: unknown) => {
        Notification.error({
          key: "gallery-load",
          message: "作品库加载失败",
          description: caught instanceof Error ? caught.message : "请稍后重试",
          position: "topRight",
        });
      })
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    if (!selectedItem) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeLightbox();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeZoom(0.25);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        changeZoom(-0.25);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetZoom();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        lightboxRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href]",
        ) || [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [selectedItem, changeZoom, closeLightbox, resetZoom]);

  useEffect(() => {
    if (!selectedItem || !stageRef.current) return;
    const stage = stageRef.current;
    const measure = () => {
      setStageSize({
        width: stage.clientWidth,
        height: stage.clientHeight,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [selectedItem]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const center = zoomCenterRef.current;
    if (!stage || !center) return;
    stage.scrollLeft = center.x * stage.scrollWidth - stage.clientWidth / 2;
    stage.scrollTop = center.y * stage.scrollHeight - stage.clientHeight / 2;
    zoomCenterRef.current = null;
  }, [zoom]);

  if (isPending) {
    return <AppLoading label="正在加载作品库…" />;
  }

  if (!session) {
    return <AppLoading label="正在前往登录页…" />;
  }

  if (loading) {
    return <AppLoading label="正在加载作品库…" />;
  }

  const user = session.user as typeof session.user & {
    quota?: number;
    role?: string;
  };

  return (
    <AppShell active="gallery" user={user}>
      <div className="lumina-section-header">
        <div>
          <p className="lumina-kicker">YOUR COLLECTION</p>
          <Title size="large" color="app-yellow">
            作品库
          </Title>
          <p className="lumina-section-copy">
            每一次生成都会被妥善收藏。点击图片，可以查看完整尺寸的作品。
          </p>
        </div>
        <Tag color="app-teal" variant="solid" size="large">
          共 {items.length} 件作品
        </Tag>
      </div>

      {items.length === 0 && (
        <Card className="lumina-panel lumina-result-empty" type="dashed">
          <div>
            <span className="lumina-empty-icon">
              <Icon name="icon-camera" size={54} bounce />
            </span>
            <p className="lumina-empty-title">作品库还是空的</p>
            <p className="lumina-empty-copy">
              去{" "}
              <Link href="/generate" className="lumina-inline-link">
                灵感工坊
              </Link>{" "}
              完成第一幅创作吧。
            </p>
          </div>
        </Card>
      )}

      {items.length > 0 && (
        <div className="lumina-gallery-grid">
          {items.map((item) => (
            <Card key={item.id} className="lumina-image-card" hoverable>
              {item.imageUrl ? (
                <button
                  type="button"
                  className="lumina-image-preview-trigger"
                  onClick={() => openLightbox(item)}
                  aria-label={`预览作品：${item.prompt}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.prompt}
                    className="lumina-image"
                  />
                  <span className="lumina-image-preview-hint">查看大图</span>
                </button>
              ) : (
                <div className="lumina-image" />
              )}
              <div className="lumina-image-meta">
                <p className="lumina-image-prompt">{item.prompt}</p>
                <p className="lumina-image-detail">
                  {item.model} · {item.size || "自动尺寸"}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedItem?.imageUrl &&
        createPortal(
          <div
            ref={lightboxRef}
            className="lumina-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="作品图片预览"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeLightbox();
            }}
          >
            <div className="lumina-lightbox-toolbar" aria-label="图片操作">
              <button
                type="button"
                className="lumina-lightbox-action"
                onClick={() => changeZoom(-0.25)}
                disabled={zoom <= 0.5}
                aria-label="缩小图片"
                title="缩小（-）"
              >
                <LightboxIcon name="zoomOut" />
              </button>
              <span className="lumina-lightbox-zoom" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="lumina-lightbox-action"
                onClick={() => changeZoom(0.25)}
                disabled={zoom >= 3}
                aria-label="放大图片"
                title="放大（+）"
              >
                <LightboxIcon name="zoomIn" />
              </button>
              <button
                type="button"
                className="lumina-lightbox-action"
                onClick={resetZoom}
                disabled={zoom === 1}
                aria-label="恢复原始缩放"
                title="恢复（0）"
              >
                <LightboxIcon name="reset" />
              </button>
              <span className="lumina-lightbox-divider" aria-hidden="true" />
              <a
                className="lumina-lightbox-action"
                href={selectedItem.imageUrl}
                download={`lumina-${selectedItem.id}.png`}
                aria-label="下载图片"
                title="下载"
              >
                <LightboxIcon name="download" />
              </a>
              <button
                ref={closeButtonRef}
                type="button"
                className="lumina-lightbox-action"
                onClick={closeLightbox}
                aria-label="关闭图片预览"
                title="关闭（Esc）"
              >
                <LightboxIcon name="close" />
              </button>
            </div>

            <div ref={stageRef} className="lumina-lightbox-stage">
              <div
                className="lumina-lightbox-stage-inner"
                style={{
                  width: fittedImageSize
                    ? fittedImageSize.width * zoom + 24
                    : "100%",
                  height: fittedImageSize
                    ? fittedImageSize.height * zoom + 24
                    : "100%",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedItem.imageUrl}
                  alt={selectedItem.prompt}
                  className="lumina-lightbox-image"
                  style={
                    fittedImageSize
                      ? {
                          width: fittedImageSize.width * zoom,
                          height: fittedImageSize.height * zoom,
                          maxWidth: "none",
                          maxHeight: "none",
                        }
                      : undefined
                  }
                  onLoad={(event) =>
                    setImageNaturalSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
                  draggable={false}
                />
              </div>
            </div>

            <section
              className={`lumina-lightbox-prompt${promptExpanded ? " is-expanded" : ""}`}
              aria-label="作品提示词"
            >
              <button
                type="button"
                className="lumina-lightbox-prompt-toggle"
                onClick={() => {
                  setPromptExpanded((current) => !current);
                  setDeleteConfirm(false);
                }}
                aria-expanded={promptExpanded}
              >
                <span className="lumina-lightbox-prompt-label">PROMPT</span>
                <span className="lumina-lightbox-prompt-preview">
                  {selectedItem.prompt}
                </span>
                <span className="lumina-lightbox-prompt-chevron" aria-hidden="true">
                  {promptExpanded ? "↓" : "↑"}
                </span>
              </button>

              {promptExpanded && (
                <div className="lumina-lightbox-prompt-content">
                  <p>{selectedItem.prompt}</p>
                  <div className="lumina-lightbox-prompt-meta">
                    <span>{selectedItem.model}</span>
                    <span>{selectedItem.size || "自动尺寸"}</span>
                    <time>{new Date(selectedItem.createdAt).toLocaleString("zh-CN")}</time>
                  </div>

                  <div className="lumina-lightbox-prompt-actions">
                    <button type="button" onClick={() => void copyPrompt()}>
                      <LightboxIcon name="copy" />
                      复制提示词
                    </button>

                    {deleteConfirm ? (
                      <div className="lumina-lightbox-delete-confirm">
                        <span>删除后无法恢复，也不会退还额度。</span>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(false)}
                          disabled={deleting}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          onClick={() => void deleteSelectedItem()}
                          disabled={deleting}
                        >
                          {deleting ? "删除中…" : "确认删除"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => setDeleteConfirm(true)}
                      >
                        <LightboxIcon name="delete" />
                        删除作品
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>,
          document.body,
        )}
    </AppShell>
  );
}
