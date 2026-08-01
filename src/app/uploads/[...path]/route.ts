import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { imageHistory, user } from "@/lib/schema";

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

type UploadRouteContext = {
  params: Promise<{ path: string[] }>;
};

function notFound() {
  return NextResponse.json({ error: "图片不存在" }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  context: UploadRouteContext,
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const segments = (await context.params).path;
    if (
      !segments.length ||
      segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          !/^[a-zA-Z0-9._-]+$/.test(segment),
      )
    ) {
      return notFound();
    }

    const extension = path.extname(segments.at(-1) || "").toLowerCase();
    const contentType = CONTENT_TYPES[extension];
    if (!contentType) return notFound();

    const imagePath = ["uploads", ...segments].join("/");
    const [[record], [viewer]] = await Promise.all([
      db
        .select({
          userId: imageHistory.userId,
        })
        .from(imageHistory)
        .where(
          and(
            eq(imageHistory.imagePath, imagePath),
            eq(imageHistory.status, "success"),
          ),
        )
        .limit(1),
      db
        .select({
          role: user.role,
          isActive: user.isActive,
        })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1),
    ]);

    if (!record || !viewer || !viewer.isActive) return notFound();
    if (record.userId !== session.user.id && viewer.role !== "admin") {
      return notFound();
    }

    const uploadsRoot = await realpath(path.join(process.cwd(), "uploads"));
    const requestedPath = await realpath(path.join(uploadsRoot, ...segments));
    if (
      requestedPath !== uploadsRoot &&
      !requestedPath.startsWith(`${uploadsRoot}${path.sep}`)
    ) {
      return notFound();
    }

    const fileStat = await stat(requestedPath);
    if (!fileStat.isFile()) return notFound();

    const etag = `W/"${fileStat.size}-${Math.trunc(fileStat.mtimeMs)}"`;
    const responseHeaders = {
      "Cache-Control": "private, max-age=3600, must-revalidate",
      "Content-Type": contentType,
      ETag: etag,
      "Last-Modified": fileStat.mtime.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    };

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: responseHeaders,
      });
    }

    const file = await readFile(requestedPath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        ...responseHeaders,
        "Content-Length": String(file.length),
        "Content-Disposition": `inline; filename="${path.basename(requestedPath)}"`,
      },
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === "ENOENT") return notFound();

    console.error(
      "[uploads]",
      error instanceof Error ? error.message : "读取图片失败",
    );
    return NextResponse.json({ error: "读取图片失败" }, { status: 500 });
  }
}
