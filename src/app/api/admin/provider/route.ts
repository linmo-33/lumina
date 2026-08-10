import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import {
  getPublicModelProvider,
  saveModelProvider,
} from "@/lib/model-provider";

const providerSchema = z.object({
  name: z.string().trim().min(1, "请输入供应商名称").max(80),
  baseUrl: z
    .string()
    .trim()
    .url("请输入有效的供应商地址")
    .max(500),
  apiKey: z.string().trim().max(1000).optional(),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    data: await getPublicModelProvider(),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsed = providerSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "供应商配置格式不正确" },
      { status: 400 },
    );
  }

  try {
    const data = await saveModelProvider({
      ...parsed.data,
      updatedBy: session.user.id,
    });
    await writeAdminAudit({
      operatorId: session.user.id,
      action: "model_provider_updated",
      detail: "更新 OpenAI 兼容生图供应商配置（密钥未记录）",
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "供应商配置保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
