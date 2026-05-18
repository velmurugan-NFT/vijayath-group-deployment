import { Role } from './constants.js';
import { prisma } from './prisma.js';

export async function getThreshold(role: Role): Promise<number> {
  const t = await prisma.approvalThreshold.findUnique({ where: { role } });
  const n = (v: bigint | undefined, fallback: number) => Number(v ?? BigInt(fallback));
  if (role === Role.PROJECT_HEAD) return n(t?.ceiling, 50000);
  if (role === Role.SECTOR_HEAD) return n(t?.ceiling, 500000);
  return n(t?.ceiling, Number.MAX_SAFE_INTEGER);
}

export function resolveRequiredApproverRole(amount: number): Role {
  if (amount <= 50000) return Role.PROJECT_HEAD;
  if (amount <= 500000) return Role.SECTOR_HEAD;
  return Role.CORPORATE_OFFICE;
}

export function canRoleApprove(role: Role, amount: number): boolean {
  const required = resolveRequiredApproverRole(amount);
  const hierarchy: Record<Role, number> = {
    [Role.PROJECT_HEAD]: 1,
    [Role.SECTOR_HEAD]: 2,
    [Role.CORPORATE_OFFICE]: 3,
    [Role.SUPER_ADMIN]: 4,
  };
  return hierarchy[role] >= hierarchy[required];
}
