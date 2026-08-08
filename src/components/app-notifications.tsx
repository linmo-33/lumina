"use client";

import { toast, type ExternalToast } from "sonner";

type NoticeType = "success" | "warning" | "error";

interface NoticeOptions {
  key?: string;
  message: string;
  description?: string;
  duration?: number;
  position?: "topRight";
}

function getToastOptions(type: NoticeType, options: NoticeOptions): ExternalToast {
  const durationSeconds = options.duration ?? (type === "error" ? 6 : 4);
  return {
    id: options.key,
    description: options.description,
    duration: durationSeconds === 0 ? Infinity : durationSeconds * 1000,
    position: options.position === "topRight" ? "top-right" : undefined,
  };
}

function showNotice(type: NoticeType, options: NoticeOptions) {
  const toastOptions = getToastOptions(type, options);
  if (type === "success") {
    toast.success(options.message, toastOptions);
    return;
  }
  if (type === "warning") {
    toast.warning(options.message, toastOptions);
    return;
  }
  toast.error(options.message, toastOptions);
}

export const notify = {
  success: (options: NoticeOptions) => showNotice("success", options),
  warning: (options: NoticeOptions) => showNotice("warning", options),
  error: (options: NoticeOptions) => showNotice("error", options),
  destroy: (key?: string) => toast.dismiss(key),
};
