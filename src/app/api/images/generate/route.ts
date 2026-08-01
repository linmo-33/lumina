import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, imageHistory, quotaLogs } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { createChatgpt2ApiClient } from "@/lib/openai";
import { saveBase64Image } from "@/lib/image-store";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const currentUser = session.user as typeof session.user & {
      role: string;
      quota: number;
      used: number;
      isActive: boolean;
    };

    if (!currentUser.isActive) {
      return NextResponse.json({ error: "账号已被禁用" }, { status: 403 });
    }

    const body = await req.json();
    const {
      prompt,
      model = "gpt-image-2",
      size = "1024x1024",
      quality = "auto",
      n = 1,
    } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 });
    }

    const cost = Math.max(1, Math.min(4, Number(n) || 1)); // 每次最多 4 张，按张扣额度

    if (currentUser.quota < cost) {
      return NextResponse.json(
        { error: `额度不足，需要 ${cost} 次，当前剩余 ${currentUser.quota}` },
        { status: 403 }
      );
    }

    // 调用 chatgpt2api
    const client = createChatgpt2ApiClient();
    const result = await client.images.generate({
      model,
      prompt: prompt.trim(),
      n: cost,
      size: size as any,
      quality: quality as any,
      response_format: "b64_json",
    });

    const images: { path: string; b64: string }[] = [];
    const historyIds: string[] = [];

    // 保存图片 + 写历史 + 扣额度（事务）
    await db.transaction(async (tx) => {
      // 扣额度
      await tx
        .update(user)
        .set({
          quota: sql`${user.quota} - ${cost}`,
          used: sql`${user.used} + ${cost}`,
          updatedAt: new Date(),
        })
        .where(eq(user.id, currentUser.id));

      for (const item of result.data || []) {
        const b64 = item.b64_json;
        if (!b64) continue;

        const imagePath = saveBase64Image(b64);
        images.push({ path: imagePath, b64 });

        const historyId = randomUUID();
        historyIds.push(historyId);

        await tx.insert(imageHistory).values({
          id: historyId,
          userId: currentUser.id,
          type: "generate",
          model,
          prompt: prompt.trim(),
          size,
          quality,
          imagePath,
          cost: 1,
          status: "success",
          createdAt: new Date(),
        });
      }

      // 额度日志
      await tx.insert(quotaLogs).values({
        id: randomUUID(),
        userId: currentUser.id,
        change: -cost,
        reason: "generate",
        operatorId: null,
        createdAt: new Date(),
      });
    });

    return NextResponse.json({
      success: true,
      cost,
      remainingQuota: currentUser.quota - cost,
      images: images.map((img, i) => ({
        id: historyIds[i],
        path: img.path,
        url: `/${img.path}`, // 通过 next 静态或后续 API 提供
      })),
    });
  } catch (err: any) {
    console.error("[generate]", err);
    const message =
      err?.error?.message || err?.message || "生图失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
