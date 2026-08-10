import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, imageHistory, quotaLogs } from "@/lib/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { createImageApiClient } from "@/lib/openai";
import { saveBase64Image } from "@/lib/image-store";
import { randomUUID } from "crypto";
import { getSystemSettings } from "@/lib/system-settings";
import {
  CHATGPT2API_MAX_IMAGES_PER_CALL,
  isImageSizeAllowedForModel,
} from "@/lib/image-options";

type UpstreamFailure = {
  responseStatus: number;
  upstreamStatus: number | null;
  message: string;
  logMessage: string;
  server: string | null;
};

function readHeader(headersValue: unknown, name: string) {
  if (!headersValue || typeof headersValue !== "object") return null;
  if ("get" in headersValue && typeof headersValue.get === "function") {
    const value = headersValue.get(name);
    return typeof value === "string" ? value : null;
  }

  const record = headersValue as Record<string, unknown>;
  const value = record[name] ?? record[name.toLowerCase()];
  return typeof value === "string" ? value : null;
}

function getUpstreamFailure(error: unknown): UpstreamFailure | null {
  if (!error || typeof error !== "object") return null;

  const record = error as Record<string, unknown>;
  const upstreamStatus =
    typeof record.status === "number" ? record.status : null;
  const logMessage =
    error instanceof Error ? error.message : "Unknown upstream error";
  const server = readHeader(record.headers, "server");
  const normalizedMessage = logMessage.toLowerCase();
  const normalizedServer = server?.toLowerCase() || "";
  const isCloudflareBlock =
    upstreamStatus === 403 &&
    (normalizedMessage.includes("request was blocked") ||
      normalizedServer.includes("cloudflare"));

  if (isCloudflareBlock) {
    return {
      responseStatus: 502,
      upstreamStatus,
      message:
        "请求被上游 Cloudflare/WAF 拦截，请检查后台供应商地址是否指向可访问的 API 源站，并在上游放行 POST /v1/images/generations",
      logMessage,
      server,
    };
  }

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      responseStatus: 502,
      upstreamStatus,
      message:
        "生图服务认证或访问权限校验失败，请检查后台供应商 API Key 与上游访问策略",
      logMessage,
      server,
    };
  }

  if (upstreamStatus === 429) {
    return {
      responseStatus: 503,
      upstreamStatus,
      message: "上游生图服务请求过于频繁，请稍后重试",
      logMessage,
      server,
    };
  }

  if (upstreamStatus !== null) {
    return {
      responseStatus: 502,
      upstreamStatus,
      message:
        upstreamStatus >= 500
          ? "上游生图服务暂时不可用，请稍后重试"
          : `上游生图服务拒绝了请求（${upstreamStatus}）`,
      logMessage,
      server,
    };
  }

  if (
    error instanceof Error &&
    (error.name === "APIConnectionTimeoutError" ||
      normalizedMessage.includes("timed out"))
  ) {
    return {
      responseStatus: 504,
      upstreamStatus: null,
      message: "连接上游生图服务超时，请稍后重试",
      logMessage,
      server,
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  let currentUserId: string | null = null;
  let requestPrompt = "";
  let requestModel = "gpt-image-2";
  let requestSize = "1024x1024";
  let requestQuality = "auto";
  let completed = false;

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    currentUserId = session.user.id;
    const [currentUser] = await db
      .select({
        id: user.id,
        quota: user.quota,
        used: user.used,
        isActive: user.isActive,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    if (!currentUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (!currentUser.isActive) {
      return NextResponse.json({ error: "账号已被禁用" }, { status: 403 });
    }

    const settings = await getSystemSettings();
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model =
      typeof body.model === "string" ? body.model : settings.defaultModel;
    const size = typeof body.size === "string" ? body.size : settings.defaultSize;
    const quality =
      typeof body.quality === "string"
        ? body.quality
        : settings.defaultQuality;
    const count = Number(body.n ?? 1);

    requestPrompt = prompt;
    requestModel = model;
    requestSize = size;
    requestQuality = quality;

    if (!prompt) {
      return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 });
    }
    if (prompt.length > settings.promptMaxLength) {
      return NextResponse.json(
        { error: `画面描述不能超过 ${settings.promptMaxLength} 个字符` },
        { status: 400 },
      );
    }
    if (!settings.allowedModels.includes(model)) {
      return NextResponse.json({ error: "模型未被系统允许" }, { status: 400 });
    }
    if (!settings.allowedSizes.includes(size)) {
      return NextResponse.json({ error: "图片尺寸未被系统允许" }, { status: 400 });
    }
    if (!isImageSizeAllowedForModel(size, model)) {
      return NextResponse.json(
        { error: "当前模型不支持该图片尺寸" },
        { status: 400 },
      );
    }
    if (!settings.allowedQualities.includes(quality)) {
      return NextResponse.json({ error: "图片质量未被系统允许" }, { status: 400 });
    }
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > settings.maxImagesPerRequest
    ) {
      return NextResponse.json(
        { error: `单次最多生成 ${settings.maxImagesPerRequest} 张图片` },
        { status: 400 },
      );
    }

    if (currentUser.quota < count) {
      return NextResponse.json(
        { error: `灵点不足，需要 ${count} 点，当前剩余 ${currentUser.quota}` },
        { status: 403 },
      );
    }

    // chatgpt2api 的网页允许一次选择多张，但 OpenAI 兼容接口单次 n 最大为 4。
    // 这里按上游限制分批请求，并按实际返回的有效图片数扣减灵点。
    const client = await createImageApiClient();
    const resultItems: Array<{ b64_json?: string | null }> = [];
    let upstreamError: unknown = null;
    const upstreamSize = size === "auto" ? "1024x1024" : size;

    for (let remaining = count; remaining > 0; ) {
      const batchSize = Math.min(remaining, CHATGPT2API_MAX_IMAGES_PER_CALL);
      try {
        const result = await client.images.generate({
          model,
          prompt,
          n: batchSize,
          size: upstreamSize as
            | "auto"
            | "1024x1024"
            | "1536x1024"
            | "1024x1536",
          quality: quality as "auto" | "low" | "medium" | "high",
          response_format: "b64_json",
        });
        resultItems.push(
          ...(result.data || []).filter((item) => item.b64_json),
        );
      } catch (error) {
        upstreamError = error;
        break;
      }
      remaining -= batchSize;
    }

    if (resultItems.length === 0) {
      if (upstreamError) throw upstreamError;
      throw new Error("生图服务未返回有效图片");
    }

    const validResultItems = resultItems.slice(0, count);
    const cost = validResultItems.length;

    const images: { path: string }[] = [];
    const historyIds: string[] = [];

    db.transaction((tx) => {
      const quotaUpdate = tx
        .update(user)
        .set({
          quota: sql`${user.quota} - ${cost}`,
          used: sql`${user.used} + ${cost}`,
          updatedAt: new Date(),
        })
        .where(and(eq(user.id, currentUser.id), gte(user.quota, cost)))
        .run();

      if (quotaUpdate.changes === 0) {
        throw new Error("灵点发生变化，请刷新页面后重试");
      }

      for (const item of validResultItems) {
        const b64 = item.b64_json;
        if (!b64) continue;

        const imagePath = saveBase64Image(b64);
        images.push({ path: imagePath });

        const historyId = randomUUID();
        historyIds.push(historyId);

        tx
          .insert(imageHistory)
          .values({
            id: historyId,
            userId: currentUser.id,
            type: "generate",
            model,
            prompt,
            size,
            quality,
            imagePath,
            cost: 1,
            status: "success",
            createdAt: new Date(),
          })
          .run();
      }

      tx
        .insert(quotaLogs)
        .values({
          id: randomUUID(),
          userId: currentUser.id,
          change: -cost,
          reason: "generate",
          operatorId: null,
          createdAt: new Date(),
        })
        .run();
    });

    completed = true;

    return NextResponse.json({
      success: true,
      cost,
      requestedCount: count,
      partial: cost < count,
      warning:
        cost < count
          ? `请求 ${count} 张，实际生成 ${cost} 张，仅按实际结果扣除灵点`
          : undefined,
      remainingQuota: currentUser.quota - cost,
      images: images.map((img, i) => ({
        id: historyIds[i],
        path: img.path,
        url: `/${img.path}`, // 通过 next 静态或后续 API 提供
      })),
    });
  } catch (err: unknown) {
    const upstreamFailure = getUpstreamFailure(err);
    if (upstreamFailure) {
      console.error("[generate:upstream]", {
        status: upstreamFailure.upstreamStatus,
        server: upstreamFailure.server,
        message: upstreamFailure.logMessage,
      });
    } else {
      console.error("[generate]", err);
    }
    const nestedError =
      typeof err === "object" && err && "error" in err
        ? (err as { error?: { message?: string } }).error
        : undefined;
    const message =
      upstreamFailure?.message ||
      nestedError?.message ||
      (err instanceof Error ? err.message : "生图失败，请稍后重试");

    if (currentUserId && requestPrompt && !completed) {
      try {
        await db.insert(imageHistory).values({
          id: randomUUID(),
          userId: currentUserId,
          type: "generate",
          model: requestModel,
          prompt: requestPrompt,
          size: requestSize,
          quality: requestQuality,
          imagePath: null,
          cost: 0,
          status: "failed",
          errorMsg: message.slice(0, 500),
          createdAt: new Date(),
        });
      } catch (historyError) {
        console.error("[generate:failed-history]", historyError);
      }
    }

    return NextResponse.json(
      { error: message },
      { status: upstreamFailure?.responseStatus || 500 },
    );
  }
}
