"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type NoticeType = "success" | "warning" | "error";

interface NoticeOptions {
  key?: string;
  message: string;
  description?: string;
  duration?: number;
  position?: "topRight";
}

interface NoticeItem extends NoticeOptions {
  key: string;
  type: NoticeType;
}

type NoticeEventDetail =
  | { action: "show"; notice: NoticeItem }
  | { action: "destroy"; key?: string };

const NOTICE_EVENT = "lumina:notice";
let noticeSequence = 0;

function dispatchNotice(detail: NoticeEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NoticeEventDetail>(NOTICE_EVENT, { detail }));
}

function showNotice(type: NoticeType, options: NoticeOptions) {
  dispatchNotice({
    action: "show",
    notice: {
      ...options,
      key: options.key || `notice-${Date.now()}-${noticeSequence++}`,
      type,
    },
  });
}

export const notify = {
  success: (options: NoticeOptions) => showNotice("success", options),
  warning: (options: NoticeOptions) => showNotice("warning", options),
  error: (options: NoticeOptions) => showNotice("error", options),
  destroy: (key?: string) => dispatchNotice({ action: "destroy", key }),
};

const noticeSymbols: Record<NoticeType, string> = {
  success: "✓",
  warning: "!",
  error: "×",
};

export function AppNotifications() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const removeNotice = useCallback((key: string) => {
    const timer = timers.current.get(key);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(key);
    setNotices((current) => current.filter((notice) => notice.key !== key));
  }, []);

  useEffect(() => {
    const activeTimers = timers.current;

    const handleNotice = (event: Event) => {
      const detail = (event as CustomEvent<NoticeEventDetail>).detail;

      if (detail.action === "destroy") {
        if (detail.key) {
          removeNotice(detail.key);
          return;
        }

        activeTimers.forEach((timer) => window.clearTimeout(timer));
        activeTimers.clear();
        setNotices([]);
        return;
      }

      const { notice } = detail;
      const existingTimer = activeTimers.get(notice.key);
      if (existingTimer) window.clearTimeout(existingTimer);

      setNotices((current) => {
        const next = current.filter((item) => item.key !== notice.key);
        return [...next, notice].slice(-4);
      });

      const duration = notice.duration ?? (notice.type === "error" ? 6 : 4);
      if (duration > 0) {
        const timer = window.setTimeout(
          () => removeNotice(notice.key),
          duration * 1000,
        );
        activeTimers.set(notice.key, timer);
      }
    };

    window.addEventListener(NOTICE_EVENT, handleNotice);
    return () => {
      window.removeEventListener(NOTICE_EVENT, handleNotice);
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
    };
  }, [removeNotice]);

  return (
    <div className="lumina-notice-viewport" aria-live="polite">
      {notices.map((notice) => (
        <section
          key={notice.key}
          className={`lumina-notice is-${notice.type}`}
          role={notice.type === "error" ? "alert" : "status"}
        >
          <span className="lumina-notice-symbol" aria-hidden="true">
            {noticeSymbols[notice.type]}
          </span>
          <span className="lumina-notice-content">
            <strong>{notice.message}</strong>
            {notice.description && <span>{notice.description}</span>}
          </span>
          <button
            type="button"
            className="lumina-notice-close"
            aria-label="关闭通知"
            onClick={() => removeNotice(notice.key)}
          >
            ×
          </button>
        </section>
      ))}
    </div>
  );
}
