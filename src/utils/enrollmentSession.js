// Enrollment is a temporary UI state, never a backend access grant. It must be
// established before authentication so the global watcher cannot race sign-in.
let expiresAt = 0;
export function beginEnrollment() { expiresAt = Date.now() + 15 * 60 * 1000; }
export function finishEnrollment() { expiresAt = 0; }
export function isEnrolling() { return Date.now() < expiresAt; }
