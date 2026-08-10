import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import {
  getPublicModelProvider,
  refreshUpstreamModels,
} from "@/lib/model-provider";

export async function POST() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const data = await refreshUpstreamModels();
    await writeAdminAudit({
      operatorId: session.user.id,
      action: "model_provider_models_refreshed",
      detail: `从 OpenAI 兼容供应商同步 ${data.modelIds.length} 个模型`,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上游模型获取失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

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
