import { Role } from './constants.js';
import { prisma } from './prisma.js';

/** 10 lakh (₹10,00,000) — default per-user approval ceiling */
export const DEFAULT_APPROVAL_LIMIT = 1_000_000;

export async function getThreshold(role: Role): Promise<number> {
  const t = await prisma.approvalThreshold.findUnique({ where: { role } });
  const n = (v: bigint | undefined, fallback: number) => Number(v ?? BigInt(fallback));
  if (role === Role.PROJECT_HEAD) return n(t?.ceiling, 50000);
  if (role === Role.SECTOR_HEAD) return n(t?.ceiling, 500000);
  return n(t?.ceiling, Number.MAX_SAFE_INTEGER);
}

export async function getUserApprovalLimit(user: {
  role: Role;
  approvalLimit?: bigint | null;
}): Promise<number> {
  const personal = Number(user.approvalLimit ?? 0);
  if (personal > 0) return personal;
  return getThreshold(user.role);
}

export async function resolveRequiredApproverRole(amount: number): Promise<Role> {
  const ph = await getThreshold(Role.PROJECT_HEAD);
  const sh = await getThreshold(Role.SECTOR_HEAD);
  if (amount <= ph) return Role.PROJECT_HEAD;
  if (amount <= sh) return Role.SECTOR_HEAD;
  return Role.CORPORATE_OFFICE;
}

export async function canRoleApprove(role: Role, amount: number): Promise<boolean> {
  const required = await resolveRequiredApproverRole(amount);
  const hierarchy: Record<Role, number> = {
    [Role.PROJECT_HEAD]: 1,
    [Role.SECTOR_HEAD]: 2,
    [Role.CORPORATE_OFFICE]: 3,
    [Role.SUPER_ADMIN]: 4,
  };
  return hierarchy[role] >= hierarchy[required];
}

/** True when this user may approve the given amount (personal limit + role tier). */
export async function canUserApprove(
  user: { role: Role; approvalLimit?: bigint | null },
  amount: number,
): Promise<boolean> {
  if (user.role === Role.SUPER_ADMIN) return true;
  const limit = await getUserApprovalLimit(user);
  if (amount > limit) return false;
  if (Number(user.approvalLimit ?? 0) > 0) return true;
  return canRoleApprove(user.role, amount);
}
