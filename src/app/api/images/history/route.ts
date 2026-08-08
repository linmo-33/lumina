import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { imageHistory } from "@/lib/schema";
import { and, asc, count, desc, eq, like } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 20));
    const offset = (page - 1) * pageSize;
    const type = searchParams.get("type");
    const query = searchParams.get("q")?.trim().slice(0, 100) || "";
    const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
    const filters = [
      eq(imageHistory.userId, session.user.id),
      eq(imageHistory.status, "success"),
    ];
    if (type === "generate" || type === "edit") filters.push(eq(imageHistory.type, type));
    if (query) filters.push(like(imageHistory.prompt, `%${query}%`));
    const where = and(...filters);

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(imageHistory)
        .where(where)
        .orderBy(sort === "oldest" ? asc(imageHistory.createdAt) : desc(imageHistory.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(imageHistory).where(where),
    ]);
    const total = Number(totalRows[0]?.value ?? 0);

    return NextResponse.json({
      success: true,
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        model: r.model,
        prompt: r.prompt,
        size: r.size,
        quality: r.quality,
        imageUrl: r.imagePath ? `/${r.imagePath}` : null,
        cost: r.cost,
        createdAt: r.createdAt,
      })),
    });
  } catch (err: unknown) {
    console.error("[history]", err);
    return NextResponse.json({ error: "获取历史失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const imageId =
      body && typeof body.id === "string" ? body.id.trim() : "";
    if (!imageId || imageId.length > 100) {
      return NextResponse.json({ error: "作品参数无效" }, { status: 400 });
    }

    const [record] = await db
      .select({ imagePath: imageHistory.imagePath })
      .from(imageHistory)
      .where(
        and(
          eq(imageHistory.id, imageId),
          eq(imageHistory.userId, session.user.id),
        ),
      )
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "作品不存在" }, { status: 404 });
    }

    const deletion = db
      .delete(imageHistory)
      .where(
        and(
          eq(imageHistory.id, imageId),
          eq(imageHistory.userId, session.user.id),
        ),
      )
      .run();
    if (deletion.changes === 0) {
      return NextResponse.json({ error: "作品不存在" }, { status: 404 });
    }

    if (record.imagePath) {
      const uploadsRoot = path.resolve(process.cwd(), "uploads");
      const absolutePath = path.resolve(process.cwd(), record.imagePath);
      if (
        absolutePath.startsWith(`${uploadsRoot}${path.sep}`) &&
        path.extname(absolutePath)
      ) {
        try {
          await unlink(absolutePath);
        } catch (fileError) {
          const code =
            fileError && typeof fileError === "object" && "code" in fileError
              ? (fileError as { code?: string }).code
              : undefined;
          if (code !== "ENOENT") {
            console.error(
              "[history:delete-file]",
              fileError instanceof Error ? fileError.message : "文件删除失败",
            );
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "[history:delete]",
      error instanceof Error ? error.message : "作品删除失败",
    );
    return NextResponse.json({ error: "作品删除失败" }, { status: 500 });
  }
}
