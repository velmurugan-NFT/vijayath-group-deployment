import { projectFilter } from './scope.js';
export async function scopedProjectWhere(user, projectId) {
    const pf = await projectFilter(user);
    if (projectId) {
        if ('id' in pf && pf.id && 'in' in pf.id) {
            const allowed = pf.id.in;
            if (!allowed.includes(projectId))
                return { id: '__denied__' };
        }
        return { ...pf, id: projectId };
    }
    return pf;
}
export function projectIdFromQuery(query) {
    const v = query.projectId;
    return typeof v === 'string' && v ? v : undefined;
}
