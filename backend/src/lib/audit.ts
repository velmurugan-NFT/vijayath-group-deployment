import { prisma } from './prisma.js';

export async function writeAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}
