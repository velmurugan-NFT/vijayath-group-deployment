import { User } from '@prisma/client';
import { Role } from './constants.js';

export type Action =
  | 'read' | 'create' | 'update' | 'delete' | 'approve'
  | 'users:create' | 'settings:manage' | 'audit:read' | 'reports:export';

export interface ResourceContext {
  sectorId?: string | null;
  projectId?: string | null;
  requesterId?: string | null;
}

export interface UserWithScope extends User {
  projectIds?: string[];
}

export function can(user: UserWithScope, action: Action, resource?: ResourceContext): boolean {
  if (user.role === Role.SUPER_ADMIN) return true;

  if (action === 'users:create' || action === 'settings:manage') {
    return user.role === Role.SUPER_ADMIN;
  }

  if (action === 'audit:read') {
    return user.role === Role.SUPER_ADMIN || user.role === Role.CORPORATE_OFFICE;
  }

  if (action === 'reports:export') return true;

  if (user.role === Role.CORPORATE_OFFICE) {
    return true;
  }

  // Global master data (vendors etc.) — all four roles in POC
  if ((action === 'create' || action === 'update') && resource === undefined) {
    return true;
  }

  if (!resource) return false;

  if (user.role === Role.SECTOR_HEAD) {
    if (!user.sectorId) return false;
    if (resource.sectorId && resource.sectorId !== user.sectorId) return false;
    return true;
  }

  if (user.role === Role.PROJECT_HEAD) {
    const ids = user.projectIds ?? [];
    if (resource.projectId && !ids.includes(resource.projectId)) return false;
    return true;
  }

  return false;
}

export function assertCan(user: UserWithScope, action: Action, resource?: ResourceContext): void {
  if (!can(user, action, resource)) {
    const err = new Error('Forbidden');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

export function blockSelfApproval(approverId: string, requesterId: string | null | undefined): void {
  if (requesterId && approverId === requesterId) {
    const err = new Error('Self-approval is not allowed');
    (err as Error & { status: number }).status = 400;
    throw err;
  }
}

export function blockMakerChecker(amount: number, approverId: string, requesterId: string | null | undefined): void {
  if (amount > 50000) blockSelfApproval(approverId, requesterId);
}
