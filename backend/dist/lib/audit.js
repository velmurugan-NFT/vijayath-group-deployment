import { prisma } from './prisma.js';
export async function writeAudit(userId, action, entityType, entityId, metadata) {
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
