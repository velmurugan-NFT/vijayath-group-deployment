export function can(user, action, resource) {
    // SUPER ADMIN
    if (user.role === 'SUPER_ADMIN') {
        return true;
    }
    // CORPORATE OFFICE
    if (user.role === 'CORPORATE_OFFICE') {
        if (action === 'read' ||
            action === 'create' ||
            action === 'update' ||
            action === 'approve' ||
            action === 'audit:read' ||
            action === 'reports:export') {
            return true;
        }
        return false;
    }
    // SECTOR HEAD
    if (user.role === 'SECTOR_HEAD') {
        if (action === 'read' ||
            action === 'create' ||
            action === 'update' ||
            action === 'approve') {
            // no sector context
            if (!resource?.sectorId) {
                return true;
            }
            return user.sectorId === resource.sectorId;
        }
        return false;
    }
    // PROJECT HEAD
    if (user.role === 'PROJECT_HEAD') {
        if (action === 'read' ||
            action === 'update') {
            return true;
        }
        return false;
    }
    return false;
}
export function assertCan(user, action, resource) {
    const allowed = can(user, action, resource);
    if (!allowed) {
        console.warn(`Forbidden: ${user.role} cannot perform ${action}`);
        return false;
    }
    return true;
}
/**
 * Prevent maker-checker conflicts
 */
export function blockMakerChecker(makerId, checkerId) {
    if (makerId === checkerId) {
        console.warn('Maker-checker violation detected');
        return false;
    }
    return true;
}
/**
 * Prevent approving own records
 */
export function blockSelfApproval(requesterId, approverId) {
    if (requesterId === approverId) {
        console.warn('Self approval blocked');
        return false;
    }
    return true;
}
