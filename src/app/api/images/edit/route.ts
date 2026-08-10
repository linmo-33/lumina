import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { toFile } from "openai";
import { and, eq, gte, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CHATGPT2API_MAX_IMAGES_PER_CALL,
  CHATGPT2API_MAX_SOURCE_IMAGE_BYTES,
  CHATGPT2API_MAX_SOURCE_IMAGE_MB,
  isImageSizeAllowedForModel,
} from "@/lib/image-options";
import { saveBase64Image } from "@/lib/image-store";
import { createImageApiClient } from "@/lib/openai";
import { imageHistory, quotaLogs, user } from "@/lib/schema";
import { getSystemSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

type SupportedSourceImage = {
  extension: "jpg" | "png" | "webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

type UpstreamFailure = {
  responseStatus: number;
  upstreamStatus: number | null;
  message: string;
  logMessage: string;
  server: string | null;
};

function getTextField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function detectSourceImage(bytes: Uint8Array): SupportedSourceImage | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { extension: "png", mimeType: "image/png" };
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }

  return null;
}

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
        "请求被上游 Cloudflare/WAF 拦截，请在上游放行 POST /v1/images/edits",
      logMessage,
      server,
    };
  }

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      responseStatus: 502,
      upstreamStatus,
      message:
        "图片编辑服务认证或访问权限校验失败，请检查服务配置与上游访问策略",
      logMessage,
      server,
    };
  }

  if (upstreamStatus === 429) {
    return {
      responseStatus: 503,
      upstreamStatus,
      message: "上游图片编辑服务请求过于频繁，请稍后重试",
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
          ? "上游图片编辑服务暂时不可用，请稍后重试"
          : `上游图片编辑服务拒绝了请求（${upstreamStatus}）`,
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
      message: "连接上游图片编辑服务超时，请稍后重试",
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
    const session = await auth.api.getSession({ headers: await headers() });
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

    const contentLength = Number(req.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > CHATGPT2API_MAX_SOURCE_IMAGE_BYTES + 1024 * 1024
    ) {
      return NextResponse.json(
        { error: `参考图片不能超过 ${CHATGPT2API_MAX_SOURCE_IMAGE_MB} MB` },
        { status: 413 },
      );
    }

    const formData = await req.formData();
    const settings = await getSystemSettings();
    const prompt = getTextField(formData, "prompt").trim();
    const model = getTextField(formData, "model") || settings.defaultModel;
    const size = getTextField(formData, "size") || settings.defaultSize;
    const quality =
      getTextField(formData, "quality") || settings.defaultQuality;
    const count = Number(getTextField(formData, "n") || "1");
    const imageValue = formData.get("image");

    requestPrompt = prompt;
    requestModel = model;
    requestSize = size;
    requestQuality = quality;

    if (!prompt) {
      return NextResponse.json({ error: "编辑描述不能为空" }, { status: 400 });
    }
    if (prompt.length > settings.promptMaxLength) {
      return NextResponse.json(
        { error: `编辑描述不能超过 ${settings.promptMaxLength} 个字符` },
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
        { error: `单次最多编辑生成 ${settings.maxImagesPerRequest} 张图片` },
        { status: 400 },
      );
    }
    if (!(imageValue instanceof File) || imageValue.size === 0) {
      return NextResponse.json({ error: "请选择一张参考图片" }, { status: 400 });
    }
    if (imageValue.size > CHATGPT2API_MAX_SOURCE_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `参考图片不能超过 ${CHATGPT2API_MAX_SOURCE_IMAGE_MB} MB` },
        { status: 413 },
      );
    }
    if (currentUser.quota < count) {
      return NextResponse.json(
        { error: `灵点不足，需要 ${count} 点，当前剩余 ${currentUser.quota}` },
        { status: 403 },
      );
    }

    const sourceBuffer = Buffer.from(await imageValue.arrayBuffer());
    const sourceType = detectSourceImage(sourceBuffer);
    if (!sourceType) {
      return NextResponse.json(
        { error: "仅支持 PNG、JPG 或 WebP 格式的参考图片" },
        { status: 415 },
      );
    }

    const client = await createImageApiClient();
    const sourceImage = await toFile(
      sourceBuffer,
      `source.${sourceType.extension}`,
      { type: sourceType.mimeType },
    );
    const resultItems: Array<{ b64_json?: string | null }> = [];
    let upstreamError: unknown = null;
    const upstreamSize = size === "auto" ? "1024x1024" : size;

    for (let remaining = count; remaining > 0; ) {
      const batchSize = Math.min(remaining, CHATGPT2API_MAX_IMAGES_PER_CALL);
      try {
        const result = await client.images.edit({
          image: sourceImage,
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
      throw new Error("图片编辑服务未返回有效图片");
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
        if (!item.b64_json) continue;
        const imagePath = saveBase64Image(item.b64_json);
        const historyId = randomUUID();
        images.push({ path: imagePath });
        historyIds.push(historyId);

        tx.insert(imageHistory)
          .values({
            id: historyId,
            userId: currentUser.id,
            type: "edit",
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

      tx.insert(quotaLogs)
        .values({
          id: randomUUID(),
          userId: currentUser.id,
          change: -cost,
          reason: "edit",
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
          ? `请求 ${count} 张，实际完成 ${cost} 张，仅按实际结果扣除灵点`
          : undefined,
      remainingQuota: currentUser.quota - cost,
      images: images.map((image, index) => ({
        id: historyIds[index],
        path: image.path,
        url: `/${image.path}`,
      })),
    });
  } catch (error: unknown) {
    const upstreamFailure = getUpstreamFailure(error);
    if (upstreamFailure) {
      console.error("[edit:upstream]", {
        status: upstreamFailure.upstreamStatus,
        server: upstreamFailure.server,
        message: upstreamFailure.logMessage,
      });
    } else {
      console.error("[edit]", error);
    }

    const nestedError =
      typeof error === "object" && error && "error" in error
        ? (error as { error?: { message?: string } }).error
        : undefined;
    const message =
      upstreamFailure?.message ||
      nestedError?.message ||
      (error instanceof Error ? error.message : "图片编辑失败，请稍后重试");

    if (currentUserId && requestPrompt && !completed) {
      try {
        await db.insert(imageHistory).values({
          id: randomUUID(),
          userId: currentUserId,
          type: "edit",
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
        console.error("[edit:failed-history]", historyError);
      }
    }

    return NextResponse.json(
      { error: message },
      { status: upstreamFailure?.responseStatus || 500 },
    );
  }
}
