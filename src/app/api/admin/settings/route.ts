import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import {
  getSystemSettings,
  SUPPORTED_QUALITIES,
  SUPPORTED_SIZES,
} from "@/lib/system-settings";
import { getPublicModelProvider } from "@/lib/model-provider";
import {
  CHATGPT2API_PAGE_MAX_IMAGES,
  isImageSizeAllowedForModel,
} from "@/lib/image-options";

const sizeSchema = z.string().refine(
  (value) => SUPPORTED_SIZES.some((supported) => supported === value),
  "不支持的图片尺寸",
);

const settingsSchema = z
  .object({
    defaultModel: z.string().trim().min(1).max(80),
    allowedModels: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
    defaultSize: sizeSchema,
    allowedSizes: z.array(sizeSchema).min(1),
    defaultQuality: z.enum(SUPPORTED_QUALITIES),
    allowedQualities: z.array(z.enum(SUPPORTED_QUALITIES)).min(1),
    maxImagesPerRequest: z
      .number()
      .int()
      .min(1)
      .max(CHATGPT2API_PAGE_MAX_IMAGES),
    promptMaxLength: z.number().int().min(100).max(20000),
    defaultUserQuota: z.number().int().min(0).max(100000),
  })
  .superRefine((value, context) => {
    if (!value.allowedModels.includes(value.defaultModel)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultModel"],
        message: "默认模型必须包含在模型白名单中",
      });
    }
    if (!value.allowedSizes.includes(value.defaultSize)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultSize"],
        message: "默认尺寸必须包含在允许尺寸中",
      });
    }
    if (!value.allowedQualities.includes(value.defaultQuality)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultQuality"],
        message: "默认质量必须包含在允许质量中",
      });
    }
    if (!isImageSizeAllowedForModel(value.defaultSize, value.defaultModel)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultSize"],
        message: "默认尺寸不适用于默认模型",
      });
    }
    for (const model of value.allowedModels) {
      if (
        !value.allowedSizes.some((size) =>
          isImageSizeAllowedForModel(size, model),
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowedSizes"],
          message: `模型 ${model} 没有可用尺寸`,
        });
      }
    }
  });

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json({ success: true, data: await getSystemSettings() });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsed = settingsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "配置格式不正确" },
      { status: 400 },
    );
  }

  const provider = await getPublicModelProvider();
  if (provider.source === "database" && provider.modelIds.length === 0) {
    return NextResponse.json(
      { error: "请先获取上游模型，再保存模型策略" },
      { status: 400 },
    );
  }
  if (
    provider.source === "database" &&
    parsed.data.allowedModels.some((model) => !provider.modelIds.includes(model))
  ) {
    return NextResponse.json(
      { error: "可用模型必须来自最近一次同步的上游模型列表" },
      { status: 400 },
    );
  }

  const now = new Date();
  const entries = Object.entries(parsed.data) as Array<
    [keyof typeof parsed.data, (typeof parsed.data)[keyof typeof parsed.data]]
  >;

  db.transaction((tx) => {
    for (const [key, value] of entries) {
      tx
        .insert(systemSettings)
        .values({
          key,
          value: JSON.stringify(value),
          updatedBy: session.user.id,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            value: JSON.stringify(value),
            updatedBy: session.user.id,
            updatedAt: now,
          },
        })
        .run();
    }
  });

  await writeAdminAudit({
    operatorId: session.user.id,
    action: "system_settings_updated",
    detail: "更新生图策略、请求限制与新用户初始灵点",
  });

  return NextResponse.json({ success: true, data: parsed.data });
}
