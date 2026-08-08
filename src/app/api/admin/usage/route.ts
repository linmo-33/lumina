import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, gte, like, or, sql, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { imageHistory, user } from "@/lib/schema";

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const searchParams = new URL(req.url).searchParams;
  const requestedPage = Number(searchParams.get("page"));
  const requestedPageSize = Number(searchParams.get("pageSize"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const pageSize =
    Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
      ? Math.min(100, requestedPageSize)
      : 50;
  const status = searchParams.get("status");
  const userId = searchParams.get("userId");
  const search = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const filters: SQL[] = [];

  if (status === "success" || status === "failed") {
    filters.push(eq(imageHistory.status, status));
  }
  if (userId) filters.push(eq(imageHistory.userId, userId));
  if (search) {
    const searchPattern = `%${search}%`;
    const searchFilter = or(
      like(imageHistory.id, searchPattern),
      like(user.name, searchPattern),
      like(user.email, searchPattern),
      like(imageHistory.model, searchPattern),
      like(imageHistory.prompt, searchPattern),
    );
    if (searchFilter) filters.push(searchFilter);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const trendStart = new Date();
  trendStart.setHours(0, 0, 0, 0);
  trendStart.setDate(trendStart.getDate() - 6);

  const [records, totalRows, summaryRows, trendRows, typeRows] = await Promise.all([
    db
      .select({
        id: imageHistory.id,
        userId: imageHistory.userId,
        userName: user.name,
        userEmail: user.email,
        type: imageHistory.type,
        model: imageHistory.model,
        prompt: imageHistory.prompt,
        size: imageHistory.size,
        quality: imageHistory.quality,
        imagePath: imageHistory.imagePath,
        cost: imageHistory.cost,
        status: imageHistory.status,
        errorMsg: imageHistory.errorMsg,
        createdAt: imageHistory.createdAt,
      })
      .from(imageHistory)
      .innerJoin(user, eq(imageHistory.userId, user.id))
      .where(where)
      .orderBy(desc(imageHistory.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(imageHistory)
      .innerJoin(user, eq(imageHistory.userId, user.id))
      .where(where),
    db
      .select({
        total: count(),
        success: sql<number>`sum(case when ${imageHistory.status} = 'success' then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${imageHistory.status} = 'failed' then 1 else 0 end)`,
        totalCost: sql<number>`coalesce(sum(${imageHistory.cost}), 0)`,
      })
      .from(imageHistory),
    db
      .select({
        day: sql<string>`strftime('%Y-%m-%d', ${imageHistory.createdAt}, 'unixepoch', 'localtime')`,
        total: count(),
        cost: sql<number>`coalesce(sum(${imageHistory.cost}), 0)`,
      })
      .from(imageHistory)
      .where(gte(imageHistory.createdAt, trendStart))
      .groupBy(sql`strftime('%Y-%m-%d', ${imageHistory.createdAt}, 'unixepoch', 'localtime')`),
    db
      .select({ type: imageHistory.type, total: count() })
      .from(imageHistory)
      .groupBy(imageHistory.type),
  ]);

  const summary = summaryRows[0] || {
    total: 0,
    success: 0,
    failed: 0,
    totalCost: 0,
  };
  const normalizedSummary = {
    total: Number(summary.total ?? 0),
    success: Number(summary.success ?? 0),
    failed: Number(summary.failed ?? 0),
    totalCost: Number(summary.totalCost ?? 0),
  };
  const trendMap = new Map(trendRows.map((row) => [row.day, row]));
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(trendStart);
    date.setDate(date.getDate() + index);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const row = trendMap.get(day);
    return { day, total: Number(row?.total ?? 0), cost: Number(row?.cost ?? 0) };
  });

  return NextResponse.json({
    success: true,
    page,
    pageSize,
    total: totalRows[0]?.value ?? 0,
    summary: normalizedSummary,
    trend,
    typeDistribution: typeRows.map((row) => ({ type: row.type, total: Number(row.total) })),
    data: records.map((record) => ({
      ...record,
      imageUrl: record.imagePath ? `/${record.imagePath}` : null,
      imagePath: undefined,
    })),
  });
}
