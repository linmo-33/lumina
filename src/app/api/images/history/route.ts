import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { imageHistory } from "@/lib/schema";
import { eq, desc, and } from "drizzle-orm";

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

    const rows = await db
      .select()
      .from(imageHistory)
      .where(
        and(
          eq(imageHistory.userId, session.user.id),
          eq(imageHistory.status, "success")
        )
      )
      .orderBy(desc(imageHistory.createdAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      success: true,
      page,
      pageSize,
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
  } catch (err: any) {
    console.error("[history]", err);
    return NextResponse.json({ error: "获取历史失败" }, { status: 500 });
  }
}
