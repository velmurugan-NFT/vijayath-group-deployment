import { projectFilter } from './scope.js';
import { UserWithScope } from './rbac.js';

export async function scopedProjectWhere(user: UserWithScope, projectId?: string) {
  const pf = await projectFilter(user);
  if (projectId) {
    if ('id' in pf && pf.id && 'in' in pf.id) {
      const allowed = (pf.id as { in: string[] }).in;
      if (!allowed.includes(projectId)) return { id: '__denied__' };
    }
    return { ...pf, id: projectId };
  }
  return pf;
}

export function projectIdFromQuery(query: Record<string, unknown>): string | undefined {
  const v = query.projectId;
  return typeof v === 'string' && v ? v : undefined;
}
