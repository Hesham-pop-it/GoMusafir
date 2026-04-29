// ─── Schema Validator ────────────────────────────────────────────────────────
// S17: All incoming data is validated against a strict schema before any DB write.
// Uses Zod for runtime type checking.

const { z } = require("zod");
const { HttpsError } = require("firebase-functions/v2/https");

/**
 * Validates data against a Zod schema.
 * Throws HttpsError with field details on failure.
 * @param {z.ZodSchema} schema
 * @param {unknown} data
 * @returns {object} parsed and validated data
 */
function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new HttpsError("invalid-argument", `Validation failed: ${issues}`);
  }
  return result.data;
}

// ── Schema Definitions ────────────────────────────────────────────────────────

const createOrgSchema = z.object({
  companyName: z.string().min(2).max(100),
  email: z.string().email(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  phoneCode: z.string().regex(/^\+\d{1,4}$/),
  phoneNumber: z.string().min(5).max(20),
  country: z.object({ name: z.string(), code: z.string() }),
  password: z.string().min(8),
  isAuthorized: z.literal(true),
});

const createTripSchema = z.object({
  title: z.string().min(2).max(100),
  destination: z.string().min(2).max(100),
  startDate: z.number().int().positive(),
  endDate: z.number().int().positive(),
});

const redeemInviteSchema = z.object({
  inviteCode: z.string().uuid(),
});

const updateLocationSchema = z.object({
  tripId: z.string().min(1),
  busId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const redeemTeamInviteSchema = z.object({
  token: z.string().uuid(),
});

const getTeamInviteMetadataSchema = z.object({
  token: z.string().uuid(),
});

const updateRoleSchema = z.object({
  targetUid: z.string().min(1),
  newRole: z.enum(["manager", "co-host", "none"]),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["manager", "co-host"]),
});

const checkoutSchema = z.object({
  planId: z.enum(["seat_only", "basic_pack", "plus_pack", "elite_wireless"]),
  planName: z.string().min(1),
  seats: z.number().int().positive().max(10000),
  journeyName: z.string().min(1).max(100),
  countryCode: z.string().max(5).optional(),
  linkToken: z.string().optional(),
});

module.exports = {
  validate,
  schemas: {
    createOrg: createOrgSchema,
    createTrip: createTripSchema,
    redeemInvite: redeemInviteSchema,
    redeemTeamInvite: redeemTeamInviteSchema,
    getTeamInviteMetadata: getTeamInviteMetadataSchema,
    updateLocation: updateLocationSchema,
    updateRole: updateRoleSchema,
    inviteMember: inviteMemberSchema,
    checkout: checkoutSchema,
  },
};
