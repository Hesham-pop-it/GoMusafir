// ─── GoMusafir Unified Backend — Functions Entry Point ───────────────────────
// All Cloud Functions for both the website and the mobile app are exported here.
// Deploy with: firebase deploy --only functions (or target a specific group)

const authFunctions = require("./groups/authFunctions");
const orgFunctions  = require("./groups/orgFunctions");
const tripFunctions = require("./groups/tripFunctions");
const inviteFunctions  = require("./groups/inviteFunctions");
const paymentFunctions  = require("./groups/paymentFunctions");
const systemFunctions  = require("./groups/systemFunctions");

// ── Auth ──────────────────────────────────────────────────────────────────────
exports.onUserSignup          = authFunctions.onUserSignup;
exports.onSignIn              = authFunctions.onSignIn;
exports.revokeSession         = authFunctions.revokeSession;
exports.verifyMFAState        = authFunctions.verifyMFAState;
exports.sendCustomEmailOTP    = authFunctions.sendCustomEmailOTP;
exports.verifyCustomEmailOTP  = authFunctions.verifyCustomEmailOTP;
exports.checkUserExistence    = authFunctions.checkUserExistence;


// ── Organization ──────────────────────────────────────────────────────────────
exports.createOrganization    = orgFunctions.createOrganization;
exports.updateMemberRole      = orgFunctions.updateMemberRole;
exports.deleteOrganization    = orgFunctions.deleteOrganization;
exports.inviteTeamMember      = orgFunctions.inviteTeamMember;

// ── Trips ─────────────────────────────────────────────────────────────────────
exports.createTrip            = tripFunctions.createTrip;
exports.updateLiveLocation    = tripFunctions.updateLiveLocation;
exports.closeTrip             = tripFunctions.closeTrip;
exports.rotateInviteCode      = tripFunctions.rotateInviteCode;
exports.setMuteAll            = tripFunctions.setMuteAll;
exports.requestTripLink       = tripFunctions.requestTripLink;
exports.verifyLinkToken       = tripFunctions.verifyLinkToken;

// ── Invites ───────────────────────────────────────────────────────────────────
exports.redeemInvitation      = inviteFunctions.redeemInvitation;
exports.getInviteMetadata     = inviteFunctions.getInviteMetadata;

// ── Payments (replaces GoMusafir-Website/server/server.js) ───────────────────
exports.createCheckoutSession = paymentFunctions.createCheckoutSession;
exports.stripeWebhookHandler  = paymentFunctions.stripeWebhookHandler;
exports.verifyPayment         = paymentFunctions.verifyPayment;

// ── System ────────────────────────────────────────────────────────────────────
exports.auditLogger           = systemFunctions.auditLogger;
exports.dataCleanupCron       = systemFunctions.dataCleanupCron;
