// ─── GoMusafir Unified Backend — Functions Entry Point ───────────────────────
process.on("uncaughtException", (err) => {
  console.error("DEBUG CRITICAL UNCAUGHT EXCEPTION:", err.stack || err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("DEBUG CRITICAL UNHANDLED REJECTION:", reason?.stack || reason || promise);
});

// Patch functions.config() removal in firebase-functions v7 to prevent emulator crashes
try {
  const f = require("firebase-functions");
  if (f) {
    f.config = () => ({});
  }
} catch (err) {
  console.warn("Failed to patch functions.config:", err.message);
}

// All Cloud Functions for both the website and the mobile app are exported here.
// Deploy with: firebase deploy --only functions (or target a specific group)

const authFunctions = require("./groups/authFunctions");
const orgFunctions  = require("./groups/orgFunctions");
const tripFunctions = require("./groups/tripFunctions");
const inviteFunctions  = require("./groups/inviteFunctions");
const paymentFunctions  = require("./groups/paymentFunctions");
const systemFunctions  = require("./groups/systemFunctions");
const voiceFunctions   = require("./groups/voiceFunctions");
const notificationFunctions = require("./groups/notificationFunctions");
const analyticsFunctions = require("./groups/analyticsFunctions");
const dashboardStatsFunctions = require("./groups/dashboardStatsFunctions");


// ── Auth ──────────────────────────────────────────────────────────────────────
exports.onUserSignup          = authFunctions.onUserSignup;
exports.onSignIn              = authFunctions.onSignIn;
exports.revokeSession         = authFunctions.revokeSession;
exports.verifyMFAState        = authFunctions.verifyMFAState;
exports.sendCustomEmailOTP    = authFunctions.sendCustomEmailOTP;
exports.verifyCustomEmailOTP  = authFunctions.verifyCustomEmailOTP;
exports.checkUserExistence    = authFunctions.checkUserExistence;
exports.deleteUserGlobally    = authFunctions.deleteUserGlobally;
exports.deleteMyAccount       = authFunctions.deleteMyAccount;
exports.createAuthHandoffToken = authFunctions.createAuthHandoffToken;
exports.exchangeAuthHandoffToken = authFunctions.exchangeAuthHandoffToken;


// ── Organization ──────────────────────────────────────────────────────────────
exports.createOrganization    = orgFunctions.createOrganization;
exports.updateMemberRole      = orgFunctions.updateMemberRole;
exports.deleteOrganization    = orgFunctions.deleteOrganization;
exports.inviteTeamMember      = orgFunctions.inviteTeamMember;

// ── Trips ─────────────────────────────────────────────────────────────────────
exports.createTrip            = tripFunctions.createTrip;
exports.deleteTrip            = tripFunctions.deleteTrip;
exports.updateLiveLocation    = tripFunctions.updateLiveLocation;
exports.closeTrip             = tripFunctions.closeTrip;
exports.rotateInviteCode      = tripFunctions.rotateInviteCode;
exports.setMuteAll            = tripFunctions.setMuteAll;
exports.requestTripLink       = tripFunctions.requestTripLink;
exports.verifyLinkToken       = tripFunctions.verifyLinkToken;
exports.removeParticipantFromTrip = tripFunctions.removeParticipantFromTrip;
exports.getParticipantProfile = tripFunctions.getParticipantProfile;
exports.updateParticipantProfile = tripFunctions.updateParticipantProfile;


// ── Invites ───────────────────────────────────────────────────────────────────
exports.redeemInvitation      = inviteFunctions.redeemInvitation;
exports.redeemTeamInvitation  = inviteFunctions.redeemTeamInvitation;
exports.getInviteMetadata     = inviteFunctions.getInviteMetadata;
exports.getTeamInviteMetadata = inviteFunctions.getTeamInviteMetadata;

// ── Payments (replaces GoMusafir-Website/server/server.js) ───────────────────
exports.createCheckoutSession = paymentFunctions.createCheckoutSession;
exports.requestSeatTopupLink  = paymentFunctions.requestSeatTopupLink;
exports.stripeWebhookHandler  = paymentFunctions.stripeWebhookHandler;
exports.verifyPayment         = paymentFunctions.verifyPayment;
exports.getRegionalPricing    = paymentFunctions.getRegionalPricing;
exports.generateSeatTopupToken = paymentFunctions.generateSeatTopupToken;
exports.previewSeatTopup      = paymentFunctions.previewSeatTopup;
exports.verifyAndPaySeatTopup = paymentFunctions.verifyAndPaySeatTopup;
exports.creditPrepaidSeats    = paymentFunctions.creditPrepaidSeats;
exports.requestSeats          = paymentFunctions.requestSeats;
exports.verifyAppleIAPReceipt = paymentFunctions.verifyAppleIAPReceipt;

// ── System ────────────────────────────────────────────────────────────────────
exports.auditLogger           = systemFunctions.auditLogger;
exports.dataCleanupCron       = systemFunctions.dataCleanupCron;
exports.secureCleanupPII      = systemFunctions.secureCleanupPII;

// ── Voice Chat ────────────────────────────────────────────────────────────────
exports.generateLiveKitToken  = voiceFunctions.generateLiveKitToken;
exports.toggleChannelStatus   = voiceFunctions.toggleChannelStatus;
exports.onActiveHostsUpdated  = voiceFunctions.onActiveHostsUpdated;
exports.livekitWebhook        = voiceFunctions.livekitWebhook;

// ── Notifications ─────────────────────────────────────────────────────────────
exports.onNotificationCreated = notificationFunctions.onNotificationCreated;
exports.onChatCreated         = notificationFunctions.onChatCreated;
exports.onVoiceChannelUpdated = notificationFunctions.onVoiceChannelUpdated;
exports.onParticipantJoined   = notificationFunctions.onParticipantJoined;
exports.onTripSeatsUpdated    = notificationFunctions.onTripSeatsUpdated;
exports.onPrepaidSeatsUpdated = notificationFunctions.onPrepaidSeatsUpdated;

// ── Analytics ─────────────────────────────────────────────────────────────────
exports.analyticsCompanies    = analyticsFunctions.analyticsCompanies;
exports.analyticsOverview     = analyticsFunctions.analyticsOverview;
exports.analyticsMetrics      = analyticsFunctions.analyticsMetrics;

// ── Dashboard Stats ───────────────────────────────────────────────────────────
exports.getDashboardStats     = dashboardStatsFunctions.getDashboardStats;
exports.getPlatformDashboardStats = dashboardStatsFunctions.getPlatformDashboardStats;
exports.getCompanyMetrics     = dashboardStatsFunctions.getCompanyMetrics;
exports.getPlatformMetrics    = dashboardStatsFunctions.getPlatformMetrics;
exports.onPaymentWrite        = dashboardStatsFunctions.onPaymentWrite;
exports.onTripWrite           = dashboardStatsFunctions.onTripWrite;
exports.onStaffWrite          = dashboardStatsFunctions.onStaffWrite;
exports.dashboardStatsCron    = dashboardStatsFunctions.dashboardStatsCron;
