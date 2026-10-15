// Pure helpers for the phone login approval screen. No native dependencies.
const FINAL = ['approved', 'denied', 'expired'];

// What the screen should show for the public approval node at time `now`.
// A pending request past its expiry is shown as expired even before the server marks it.
function approvalView(approval, now = Date.now()) {
    if (!approval || typeof approval !== 'object') return { state: 'missing', secondsLeft: 0 };
    const secondsLeft = Number.isFinite(approval.expires_at) ? Math.max(0, Math.ceil((approval.expires_at - now) / 1000)) : 0;
    if (FINAL.includes(approval.status)) return { state: approval.status, secondsLeft };
    if (approval.status === 'pending') return { state: secondsLeft > 0 ? 'pending' : 'expired', secondsLeft };
    return { state: 'missing', secondsLeft: 0 };
}

// m:ss for the countdown.
function formatCountdown(seconds) {
    const s = Math.max(0, Math.floor(seconds) || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Push payloads carry data { type: 'login_approval', id }.
function isLoginApprovalPayload(item) {
    const data = item?.data || item;
    return !!data && data.type === 'login_approval' && typeof data.id === 'string' && data.id.length > 0;
}

module.exports = { approvalView, formatCountdown, isLoginApprovalPayload };
