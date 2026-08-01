import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { adminAuditLogs } from "@/lib/schema";

interface WriteAdminAuditInput {
  operatorId: string;
  targetUserId?: string | null;
  action: string;
  detail?: string | null;
}

export async function writeAdminAudit(input: WriteAdminAuditInput) {
  await db.insert(adminAuditLogs).values({
    id: randomUUID(),
    operatorId: input.operatorId,
    targetUserId: input.targetUserId ?? null,
    action: input.action,
    detail: input.detail ?? null,
    createdAt: new Date(),
  });
}
