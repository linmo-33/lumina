import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * 将 base64 图片保存到本地 uploads 目录
 * @returns 相对路径，例如 "uploads/2026-08-01/xxx.png"
 */
export function saveBase64Image(b64: string, ext = "png"): string {
  ensureUploadsDir();

  const dateDir = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dir = path.join(UPLOADS_DIR, dateDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filename = `${randomUUID()}.${ext}`;
  const fullPath = path.join(dir, filename);
  const buffer = Buffer.from(b64, "base64");
  fs.writeFileSync(fullPath, buffer);

  return path.join("uploads", dateDir, filename).replace(/\\/g, "/");
}

/**
 * 根据相对路径读取图片绝对路径
 */
export function getImageAbsolutePath(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}
