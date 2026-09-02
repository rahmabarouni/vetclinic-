import { PrismaClient } from "@prisma/client";

interface AuditLogParams {
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
}

export async function logAudit(
  prisma: PrismaClient,
  params: AuditLogParams,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
      },
    });
  } catch (err) {
    console.error("[AuditLog] Echec d'ecriture:", err);
  }
}