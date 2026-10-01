// Only the current organization permission map can confer a chat staff badge.
// Never infer this from message fields, display names, profiles, or route params.
export function getChatStaffRole(staff, senderId) {
    if (!senderId || !staff || !Object.prototype.hasOwnProperty.call(staff, senderId)) return null;
    switch (staff[senderId]) {
        case 'admin': return 'Admin';
        case 'manager': return 'Manager';
        case 'co-host': return 'Co-Host';
        default: return null;
    }
}
