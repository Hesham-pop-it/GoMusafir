// ─── Dashboard Stats Functions ────────────────────────────────────────────────
// Recalculates organization metrics and stores them in the Realtime Database.

const { HttpsError } = require("firebase-functions/v2/https");
const { onCall } = require("../middleware/participantAccessMiddleware");
const { onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { admin, db } = require("../admin");
const {
  FX_RATES_TO_EUR,
  getPaymentAmountInEur,
  calculateCompanyMetrics,
  calculatePlatformMetrics
} = require("../services/analyticsMetricsService");

/**
 * Helper function to calculate all 8 dashboard metrics for an organization
 * and save them to orgs/$orgId/dashboard_stats.
 */
// The headline numbers need only payments, trips, staff and the checkout count.
// Trip `participants` and `total_seats` are counters kept by the join and seat code.
function headlineStats(org, initiatedCheckoutCount) {
  // 1. Total Revenue (converted to EUR base currency)
  let totalRevenue = 0;
  if (org.payments) {
    for (const paymentId in org.payments) {
      totalRevenue += getPaymentAmountInEur(org.payments[paymentId]);
    }
  }
  totalRevenue = Math.round(totalRevenue * 100) / 100;

  // 2. Total Accounts (Staff in company)
  const totalAccounts = org.staff ? Object.keys(org.staff).length : 0;

  // 3-5. Journeys, registered participants (sum of trip.participants) and seats
  let activeJourneys = 0;
  let registeredParticipants = 0;
  let totalSeats = 0;
  let totalJourneys = 0;
  if (org.trips) {
    for (const tripId in org.trips) {
      const trip = org.trips[tripId];
      totalJourneys++;
      if (trip.status === "active") activeJourneys++;
      registeredParticipants += trip.participants || 0;
      totalSeats += trip.total_seats || 0;
    }
  }
  let utilisationPercentage = 0;
  if (totalSeats > 0) {
    utilisationPercentage = Math.round((registeredParticipants / totalSeats) * 1000) / 10;
  }

  // 6. Payment Conversion Rate
  let conversionRate = 100;
  let completedCheckouts = 0;
  if (org.payments) {
    for (const paymentId in org.payments) {
      if (org.payments[paymentId].gateway === "stripe") completedCheckouts++;
    }
  }
  const initiatedCheckouts = Math.max(initiatedCheckoutCount, completedCheckouts);
  if (initiatedCheckouts > 0) {
    conversionRate = Math.round((completedCheckouts / initiatedCheckouts) * 1000) / 10;
  }

  // 8. Revenue per Journey
  let revenuePerJourney = 0;
  if (totalJourneys > 0) {
    revenuePerJourney = Math.round((totalRevenue / totalJourneys) * 100) / 100;
  }

  return {
    financial: { totalRevenue, revenuePerJourney },
    users: { totalAccounts },
    journeys: { active: activeJourneys },
    participants: { registered: registeredParticipants },
    seats: { utilisationPercentage },
    payments: { conversionRate },
  };
}

// Trigger path: reads four small children and rewrites only the headline fields.
// currentlyConnected and detailed_metrics keep their last value until the next
// full recalculation (the 12 hour cron, or the first dashboard open).
async function updateHeadlineStats(orgId) {
  const child = (name) => db.ref(`orgs/${orgId}/${name}`).once("value");
  // Nothing stored yet: the first dashboard open or the cron does the full calculation.
  if (!(await child("dashboard_stats/updated_at")).exists()) return;
  const [metadata, payments, trips, staff, checkoutSessions] =
    await Promise.all(["metadata", "payments", "trips", "staff", "checkout_sessions"].map(child));
  if (!metadata.exists()) {
    console.log(`Org ${orgId} does not exist. Skipping stats calculation.`);
    return;
  }
  const org = { payments: payments.val(), trips: trips.val(), staff: staff.val() };
  const checkoutCount = checkoutSessions.exists() ? Object.keys(checkoutSessions.val()).length : 0;
  const stats = headlineStats(org, checkoutCount);
  await db.ref(`orgs/${orgId}/dashboard_stats`).update({
    financial: stats.financial,
    users: stats.users,
    journeys: stats.journeys,
    "participants/registered": stats.participants.registered,
    seats: stats.seats,
    payments: stats.payments,
    updated_at: admin.database.ServerValue.TIMESTAMP,
  });
}

/**
 * Full recalculation of the dashboard metrics for an organization, saved to
 * orgs/$orgId/dashboard_stats. `prefetched` lets the cron share one read of
 * `orgs` and `trips_active` across all organizations.
 */
async function calculateAndStoreStats(orgId, prefetched = {}) {
  if (!orgId) return;

  try {
    const org = prefetched.org ?? (await db.ref(`orgs/${orgId}`).once("value")).val();
    if (!org) {
      console.log(`Org ${orgId} does not exist. Skipping stats calculation.`);
      return;
    }

    const checkoutCount = org.checkout_sessions ? Object.keys(org.checkout_sessions).length : 0;
    const headline = headlineStats(org, checkoutCount);

    // 7. Currently Connected participants (recent location updates in active trips)
    let currentlyConnected = 0;
    const orgActiveTrips = prefetched.activeTrips !== undefined ? prefetched.activeTrips
      : (await db.ref(`trips_active/${orgId}`).once("value")).val();
    if (orgActiveTrips) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      for (const tripId in orgActiveTrips) {
        const locations = orgActiveTrips[tripId]?.locations;
        for (const uid in locations || {}) {
          const loc = locations[uid];
          if (loc && loc.updated_at && loc.updated_at > fiveMinutesAgo) currentlyConnected++;
        }
      }
    }

    // Calculate all 68 detailed metrics for company
    const detailedMetrics = calculateCompanyMetrics(org, orgId, {}, orgActiveTrips ? { [orgId]: orgActiveTrips } : {});

    const stats = {
      ...headline,
      participants: { ...headline.participants, currentlyConnected },
      detailed_metrics: detailedMetrics,
      updated_at: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref(`orgs/${orgId}/dashboard_stats`).set(stats);
    console.log(`Successfully calculated and stored dashboard stats for Org ${orgId}`);
  } catch (error) {
    console.error(`Error calculating dashboard stats for Org ${orgId}:`, error);
  }
}

/**
 * Calculates all 8 platform-wide metrics across all organizations
 * and saves them to platform_stats/overview in the Realtime Database.
 */
async function calculateAndStorePlatformStats(prefetched = {}) {
  try {
    const orgs = prefetched.orgs ?? (await db.ref("orgs").once("value")).val();
    if (!orgs) {
      return;
    }

    let totalRevenue = 0;
    let stripeRevenue = 0;
    let iapRevenue = 0;
    let totalOrganizations = 0;
    let activeOrganizations = 0;
    let totalJourneys = 0;
    let activeJourneys = 0;
    let registeredParticipants = 0;
    let totalSeats = 0;
    let completedCheckouts = 0;
    let initiatedCheckouts = 0;

    for (const orgId in orgs) {
      const org = orgs[orgId];
      if (!org) continue;

      totalOrganizations++;
      if (org.metadata && !org.metadata.deleted_at) {
        activeOrganizations++;
      }

      // Payments (converted to EUR)
      if (org.payments) {
        for (const paymentId in org.payments) {
          const payment = org.payments[paymentId];
          const amountEur = getPaymentAmountInEur(payment);
          totalRevenue += amountEur;

          if (payment.gateway === "apple_iap" || payment.paymentMethod === "apple_iap") {
            iapRevenue += amountEur;
          } else {
            stripeRevenue += amountEur;
          }

          if (payment.gateway === "stripe" || payment.status === "succeeded" || payment.status === "paid") {
            completedCheckouts++;
          }
        }
      }

      // Checkout sessions
      if (org.checkout_sessions) {
        initiatedCheckouts += Object.keys(org.checkout_sessions).length;
      }

      // Trips
      if (org.trips) {
        for (const tripId in org.trips) {
          const trip = org.trips[tripId];
          totalJourneys++;
          if (trip.status === "active") {
            activeJourneys++;
          }
          registeredParticipants += trip.participants || 0;
          totalSeats += trip.total_seats || 0;
        }
      }
    }

    // Currently connected from trips_active
    let currentlyConnected = 0;
    let activeTripsData = {};
    try {
      activeTripsData = prefetched.activeTrips !== undefined ? (prefetched.activeTrips || {})
        : ((await db.ref("trips_active").once("value")).val() || {});
      {
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        for (const orgId in activeTripsData) {
          for (const tripId in activeTripsData[orgId]) {
            const locs = activeTripsData[orgId][tripId]?.locations || {};
            for (const uid in locs) {
              if (locs[uid]?.updated_at && locs[uid].updated_at > fiveMinutesAgo) {
                currentlyConnected++;
              }
            }
          }
        }
      }
    } catch (e) {
      console.log("trips_active query failed in calculateAndStorePlatformStats:", e.message);
    }

    totalRevenue = Math.round(totalRevenue * 100) / 100;
    stripeRevenue = Math.round(stripeRevenue * 100) / 100;
    iapRevenue = Math.round(iapRevenue * 100) / 100;

    const utilisationPercentage = totalSeats > 0
      ? Math.round((registeredParticipants / totalSeats) * 1000) / 10
      : 0;

    initiatedCheckouts = Math.max(initiatedCheckouts, completedCheckouts);
    const conversionRate = initiatedCheckouts > 0
      ? Math.round((completedCheckouts / initiatedCheckouts) * 1000) / 10
      : 100;

    const customerLifetimeValue = activeOrganizations > 0
      ? Math.round((totalRevenue / activeOrganizations) * 100) / 100
      : 0;

    const revenuePerJourney = totalJourneys > 0
      ? Math.round((totalRevenue / totalJourneys) * 100) / 100
      : 0;

    const revenuePerUser = registeredParticipants > 0
      ? Math.round((totalRevenue / registeredParticipants) * 100) / 100
      : 0;

    const detailedPlatformMetrics = calculatePlatformMetrics(orgs, {}, activeTripsData);

    const platformStats = {
      financial: {
        totalRevenue,
        revenuePerJourney,
        stripeRevenue,
        iapRevenue,
      },
      organizations: {
        active: activeOrganizations,
        total: totalOrganizations,
        inactive: totalOrganizations - activeOrganizations,
      },
      journeys: {
        active: activeJourneys,
        total: totalJourneys,
      },
      participants: {
        registered: registeredParticipants,
        currentlyConnected,
      },
      seats: {
        totalCapacity: totalSeats,
        assigned: registeredParticipants,
        utilisationPercentage,
      },
      payments: {
        conversionRate,
        completed: completedCheckouts,
        initiated: initiatedCheckouts,
      },
      business: {
        customerLifetimeValue,
        revenuePerUser,
      },
      detailed_metrics: detailedPlatformMetrics,
      updated_at: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref("platform_stats/overview").set(platformStats);

    // Also compile and save lightweight companies summary list (prevents full orgs database scans on analyticsCompanies)
    try {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const companiesSummary = [];
      for (const orgId in orgs) {
        const org = orgs[orgId];
        if (!org || !org.metadata) continue;
        const staffCount = org.staff ? Object.keys(org.staff).length : 0;
        let tripParticipantsCount = 0;
        let orgTotalSeats = 0;
        let orgActiveJourneys = 0;
        let orgJourneys = 0;
        const tripsList = [];
        if (org.trips) {
          for (const tripId in org.trips) {
            const trip = org.trips[tripId];
            if (!trip) continue;
            orgJourneys++;
            if (trip.status === "active") orgActiveJourneys++;
            const pCount = typeof trip.participants === "number" ? trip.participants : (trip.participants ? Object.keys(trip.participants).length : 0);
            tripParticipantsCount += pCount;
            orgTotalSeats += trip.total_seats || trip.seats || 0;
            tripsList.push({
              id: tripId,
              name: trip.name || trip.title || trip.tripName || trip.destination || "Journey " + tripId.slice(0, 6),
              status: trip.status || (trip.deleted_at ? "cancelled" : (trip.completed_at ? "completed" : "active")),
              startDate: trip.start_date || trip.startDate || trip.departureDate || (trip.created_at ? new Date(trip.created_at).toISOString().slice(0, 10) : null),
              endDate: trip.end_date || trip.endDate || trip.returnDate || null,
              totalSeats: trip.total_seats || trip.seats || 0,
              participants: pCount,
              companyId: orgId,
              companyName: org.metadata.name || "Unnamed Company"
            });
          }
        }
        let orgRevenue = 0, orgStripeRevenue = 0, orgIapRevenue = 0, orgCompleted = 0;
        if (org.payments) {
          for (const paymentId in org.payments) {
            const payment = org.payments[paymentId];
            const amountEur = getPaymentAmountInEur(payment);
            orgRevenue += amountEur;
            if (payment.gateway === "apple_iap" || payment.paymentMethod === "apple_iap") orgIapRevenue += amountEur;
            else orgStripeRevenue += amountEur;
            if (payment.status === "succeeded" || payment.status === "paid" || payment.status === "success" || payment.gateway === "stripe" || payment.gateway === "apple_iap" || (payment.status !== "failed" && payment.status !== "pending" && !payment.refunded && amountEur > 0)) orgCompleted++;
          }
        }
        let orgInitiated = org.checkout_sessions ? Object.keys(org.checkout_sessions).length : 0;
        orgInitiated = Math.max(orgInitiated, orgCompleted);
        const orgConversion = orgInitiated > 0 ? Math.round((orgCompleted / orgInitiated) * 1000) / 10 : 100;
        let orgConnected = 0;
        if (activeTripsData[orgId]) {
          for (const tripId in activeTripsData[orgId]) {
            const locs = activeTripsData[orgId][tripId]?.locations || {};
            for (const uid in locs) {
              if (locs[uid]?.updated_at && locs[uid].updated_at > fiveMinutesAgo) orgConnected++;
            }
          }
        }
        const rawCountry = org.metadata.country;
        let country = "Netherlands";
        if (rawCountry) country = typeof rawCountry === "object" ? (rawCountry.name || rawCountry.country || rawCountry.code || "Netherlands") : String(rawCountry);
        companiesSummary.push({
          id: orgId,
          name: org.metadata.name || "Unnamed Company",
          country,
          status: org.metadata.deleted_at ? "Inactive" : "Active",
          members: staffCount + tripParticipantsCount,
          journeys: orgJourneys,
          activeJourneys: orgActiveJourneys,
          registeredParticipants: tripParticipantsCount,
          totalSeats: orgTotalSeats,
          seatUtilisation: orgTotalSeats > 0 ? Math.round((tripParticipantsCount / orgTotalSeats) * 1000) / 10 : 0,
          completedCheckouts: orgCompleted,
          initiatedCheckouts: orgInitiated,
          conversionRate: orgConversion,
          currentlyConnected: orgConnected,
          revenue: Math.round(orgRevenue * 100) / 100,
          stripeRevenue: Math.round(orgStripeRevenue * 100) / 100,
          iapRevenue: Math.round(orgIapRevenue * 100) / 100,
          customerLifetimeValue: Math.round(orgRevenue * 100) / 100,
          manualRevenue: 0,
          otherRevenue: 0,
          trips: tripsList
        });
      }
      await db.ref("platform_stats/companies_summary").set(companiesSummary);
    } catch (err) {
      console.warn("Error saving companies_summary in platform stats:", err.message);
    }

    console.log("Successfully calculated and stored platform-wide stats and companies summary.");
  } catch (error) {
    console.error("Error calculating platform stats:", error);
  }
}

// ── Callable Functions ────────────────────────────────────────────────────────

exports.getDashboardStats = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const orgId = request.auth.token.orgId || request.data?.orgId;
  if (!orgId) {
    throw new HttpsError("failed-precondition", "User not associated with any organization.");
  }

  // Return cached stats if available
  const statsSnap = await db.ref(`orgs/${orgId}/dashboard_stats`).once("value");
  if (statsSnap.exists()) {
    return statsSnap.val() || {};
  }

  // Calculate and store once if missing
  await calculateAndStoreStats(orgId);
  const freshSnap = await db.ref(`orgs/${orgId}/dashboard_stats`).once("value");
  return freshSnap.val() || {};
});

exports.getPlatformDashboardStats = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  // Return cached platform stats if available
  const statsSnap = await db.ref("platform_stats/overview").once("value");
  if (statsSnap.exists()) {
    return statsSnap.val() || {};
  }

  // Calculate and store once if missing
  await calculateAndStorePlatformStats();
  const freshSnap = await db.ref("platform_stats/overview").once("value");
  return freshSnap.val() || {};
});

exports.getCompanyMetrics = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const orgId = request.data?.orgId || request.auth.token.orgId;
  if (!orgId) {
    throw new HttpsError("failed-precondition", "Organization ID required.");
  }

  // Check cached detailed metrics first
  const cachedSnap = await db.ref(`orgs/${orgId}/dashboard_stats/detailed_metrics`).once("value");
  if (cachedSnap.exists()) {
    return cachedSnap.val() || [];
  }

  const orgSnap = await db.ref(`orgs/${orgId}`).once("value");
  if (!orgSnap.exists()) {
    throw new HttpsError("not-found", "Organization not found.");
  }

  const activeTripsSnap = await db.ref(`trips_active/${orgId}`).once("value");
  const activeTripsData = activeTripsSnap.exists() ? { [orgId]: activeTripsSnap.val() } : {};

  return calculateCompanyMetrics(orgSnap.val(), orgId, {}, activeTripsData);
});

exports.getPlatformMetrics = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  // Check cached detailed metrics first
  const cachedSnap = await db.ref("platform_stats/overview/detailed_metrics").once("value");
  if (cachedSnap.exists()) {
    return cachedSnap.val() || [];
  }

  const orgsSnap = await db.ref("orgs").once("value");
  const orgs = orgsSnap.val() || {};

  const activeTripsSnap = await db.ref("trips_active").once("value");
  const activeTripsData = activeTripsSnap.exists() ? activeTripsSnap.val() : {};

  return calculatePlatformMetrics(orgs, {}, activeTripsData);
});

// ── Database Triggers ─────────────────────────────────────────────────────────

exports.onPaymentWrite = onValueWritten({
  ref: "orgs/{orgId}/payments/{paymentId}",
  region: "europe-west1",
}, async (event) => {
  const { orgId } = event.params;
  console.log(`Trigger onPaymentWrite fired for Org ${orgId}`);
  await updateHeadlineStats(orgId);
});

// Trip fields the dashboard stats read; writes to anything else (live_data, etc.) are skipped.
// `participants` changes on every join; the registered count catches up on the next
// trigger or the 12 hour cron instead of recalculating per join.
const TRIP_STAT_FIELDS = [
  "status", "deleted", "deleted_at", "completed_at", "created_at",
  "startDate", "start_date", "departureDate", "endDate", "end_date", "returnDate",
  "name", "title", "tripName", "destination", "total_seats", "seats",
];

function tripStatsChanged(before, after) {
  if (!before || !after) return true;
  return TRIP_STAT_FIELDS.some((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

exports.tripStatsChanged = tripStatsChanged;
exports.headlineStats = headlineStats;
exports.updateHeadlineStats = updateHeadlineStats;

exports.onTripWrite = onValueWritten({
  ref: "orgs/{orgId}/trips/{tripId}",
  region: "europe-west1",
}, async (event) => {
  const { orgId } = event.params;
  if (!tripStatsChanged(event.data.before.val(), event.data.after.val())) return;
  console.log(`Trigger onTripWrite fired for Org ${orgId}`);
  await updateHeadlineStats(orgId);
});

exports.onStaffWrite = onValueWritten({
  ref: "orgs/{orgId}/staff/{uid}",
  region: "europe-west1",
}, async (event) => {
  const { orgId } = event.params;
  console.log(`Trigger onStaffWrite fired for Org ${orgId}`);
  await updateHeadlineStats(orgId);
});

// onParticipantWrite disabled to prevent high-frequency RTDB scans during active trip tracking
// exports.onParticipantWrite = ... (handled via scheduled cron)

// ── Scheduler (Cron Job) ──────────────────────────────────────────────────────

exports.dashboardStatsCron = onSchedule({
  schedule: "0 */12 * * *",
  region: "europe-west1",
  timeZone: "Etc/UTC",
}, async (event) => {
  console.log("Starting scheduled dashboard stats recalculation...");
  try {
    const orgsSnap = await db.ref("orgs").once("value");
    if (!orgsSnap.exists()) {
      console.log("No organizations found in database.");
      return;
    }

    const orgs = orgsSnap.val();
    const orgIds = Object.keys(orgs);
    // One read of trips_active shared by every organization and the platform pass.
    const activeTrips = (await db.ref("trips_active").once("value")).val() || {};

    console.log(`Recalculating stats for ${orgIds.length} organizations.`);
    for (const orgId of orgIds) {
      await calculateAndStoreStats(orgId, { org: orgs[orgId], activeTrips: activeTrips[orgId] || null });
    }

    await calculateAndStorePlatformStats({ orgs, activeTrips });
    console.log("Scheduled dashboard stats recalculation completed.");
  } catch (err) {
    console.error("Error in dashboardStatsCron:", err);
  }
});

exports.calculateAndStorePlatformStats = calculateAndStorePlatformStats;
exports.calculateAndStoreStats = calculateAndStoreStats;
