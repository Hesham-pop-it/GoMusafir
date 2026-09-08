// ─── Analytics Functions ─────────────────────────────────────────────────────────

const { onRequest } = require("firebase-functions/v2/https");
const { db } = require("../admin");

const MOCK_COMPANIES = [
  {
    "id": "al-noor",
    "name": "Al Noor Travel",
    "country": "Netherlands",
    "status": "Active",
    "members": 842,
    "journeys": 36,
    "revenue": 74250,
    "stripeRevenue": 52000,
    "iapRevenue": 22250,
    "manualRevenue": 0,
    "otherRevenue": 0
  },
  {
    "id": "baraka",
    "name": "Baraka Tours",
    "country": "United Kingdom",
    "status": "Active",
    "members": 615,
    "journeys": 28,
    "revenue": 52840,
    "stripeRevenue": 37000,
    "iapRevenue": 15840,
    "manualRevenue": 0,
    "otherRevenue": 0
  },
  {
    "id": "rahma",
    "name": "Rahma Travel Group",
    "country": "Germany",
    "status": "Active",
    "members": 488,
    "journeys": 22,
    "revenue": 41920,
    "stripeRevenue": 29000,
    "iapRevenue": 12920,
    "manualRevenue": 0,
    "otherRevenue": 0
  },
  {
    "id": "safa",
    "name": "Safa Pilgrimage Services",
    "country": "France",
    "status": "Active",
    "members": 391,
    "journeys": 18,
    "revenue": 34600,
    "stripeRevenue": 24000,
    "iapRevenue": 10600,
    "manualRevenue": 0,
    "otherRevenue": 0
  },
  {
    "id": "hidayah",
    "name": "Hidayah Travel",
    "country": "Belgium",
    "status": "Active",
    "members": 274,
    "journeys": 14,
    "revenue": 27150,
    "stripeRevenue": 19000,
    "iapRevenue": 8150,
    "manualRevenue": 0,
    "otherRevenue": 0
  },
  {
    "id": "amanah",
    "name": "Amanah Journeys",
    "country": "Türkiye",
    "status": "Active",
    "members": 953,
    "journeys": 42,
    "revenue": 88640,
    "stripeRevenue": 62000,
    "iapRevenue": 26640,
    "manualRevenue": 0,
    "otherRevenue": 0
  },
  {
    "id": "nour",
    "name": "Nour Voyages",
    "country": "France",
    "status": "Active",
    "members": 323,
    "journeys": 16,
    "revenue": 29980,
    "stripeRevenue": 21000,
    "iapRevenue": 8980,
    "manualRevenue": 0,
    "otherRevenue": 0
  },
  {
    "id": "minaret",
    "name": "Minaret Travel",
    "country": "Netherlands",
    "status": "Inactive",
    "members": 196,
    "journeys": 8,
    "revenue": 14120,
    "stripeRevenue": 10000,
    "iapRevenue": 4120,
    "manualRevenue": 0,
    "otherRevenue": 0
  }
];

const { 
  FX_RATES_TO_EUR, 
  getPaymentAmountInEur, 
  calculateCompanyMetrics, 
  calculatePlatformMetrics 
} = require("../services/analyticsMetricsService");

// ── In-Memory Cache (Eliminates repeated Realtime Database queries) ───────────
const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
let memoryCache = {
  companies: null,
  companiesTimestamp: 0,
  overview: null,
  overviewTimestamp: 0,
  platformMetrics: null,
  platformMetricsTimestamp: 0,
  companyMetrics: new Map() // orgId -> { data, timestamp }
};

function getCached(key) {
  if (key === "companies" && memoryCache.companies && (Date.now() - memoryCache.companiesTimestamp < MEMORY_CACHE_TTL_MS)) {
    return memoryCache.companies;
  }
  if (key === "overview" && memoryCache.overview && (Date.now() - memoryCache.overviewTimestamp < MEMORY_CACHE_TTL_MS)) {
    return memoryCache.overview;
  }
  if (key === "platformMetrics" && memoryCache.platformMetrics && (Date.now() - memoryCache.platformMetricsTimestamp < MEMORY_CACHE_TTL_MS)) {
    return memoryCache.platformMetrics;
  }
  return null;
}

function setCached(key, data) {
  if (key === "companies") {
    memoryCache.companies = data;
    memoryCache.companiesTimestamp = Date.now();
  } else if (key === "overview") {
    memoryCache.overview = data;
    memoryCache.overviewTimestamp = Date.now();
  } else if (key === "platformMetrics") {
    memoryCache.platformMetrics = data;
    memoryCache.platformMetricsTimestamp = Date.now();
  }
}

exports.analyticsCompanies = onRequest({ region: "europe-west1" }, async (req, res) => {
  try {
    // Manual CORS handling
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=120");
    
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    // 1. Check in-memory cache first (0 RTDB reads, near-instant response)
    const memCached = getCached("companies");
    if (memCached) {
      return res.status(200).json(memCached);
    }

    // 2. Check lightweight pre-calculated summary in RTDB (only ~5KB read vs 100MB+ full orgs scan)
    try {
      const summarySnap = await db.ref("platform_stats/companies_summary").once("value");
      if (summarySnap.exists()) {
        const companiesData = summarySnap.val();
        if (Array.isArray(companiesData) && companiesData.length > 0) {
          setCached("companies", companiesData);
          return res.status(200).json(companiesData);
        }
      }
    } catch (e) {
      console.warn("Could not read platform_stats/companies_summary:", e.message);
    }

    // 3. Fallback: only if summary cache does not exist, compute from database once
    let orgsSnapshot;
    const dbPromise = db.ref("orgs").once("value");
    
    // Catch rejection in background to prevent unhandled rejection process crash
    dbPromise.catch((err) => {
      console.log("Background orgs fetch error:", err.message);
    });

    try {
      orgsSnapshot = await Promise.race([
        dbPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
      ]);
    } catch (e) {
      console.log("Database connection timed out or failed. Falling back to mock data.", e?.message || e);
      return res.status(200).json(MOCK_COMPANIES);
    }

    const orgs = orgsSnapshot.val();

    if (!orgs || Object.keys(orgs).length === 0) {
      console.log("No organizations found in database. Returning mock companies.");
      return res.status(200).json(MOCK_COMPANIES);
    }

    // Also fetch active connections
    let activeTripsSnapshot;
    try {
      activeTripsSnapshot = await Promise.race([
        db.ref("trips_active").once("value"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
      ]);
    } catch (e) {
      activeTripsSnapshot = { exists: () => false, val: () => ({}) };
    }
    const activeTripsData = activeTripsSnapshot.exists() ? activeTripsSnapshot.val() : {};
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const companies = [];

    for (const orgId in orgs) {
      const org = orgs[orgId];
      if (!org || !org.metadata) continue;

      // Staff count
      const staffCount = org.staff ? Object.keys(org.staff).length : 0;

      // Trips & participants
      let tripParticipantsCount = 0;
      let totalSeats = 0;
      let activeJourneys = 0;
      let journeys = 0;

      const tripsList = [];
      if (org.trips) {
        for (const tripId in org.trips) {
          const trip = org.trips[tripId];
          if (!trip) continue;
          journeys++;
          if (trip.status === "active") {
            activeJourneys++;
          }
          tripParticipantsCount += (typeof trip.participants === "number" ? trip.participants : (trip.participants ? Object.keys(trip.participants).length : 0));
          totalSeats += trip.total_seats || trip.seats || 0;

          tripsList.push({
            id: tripId,
            name: trip.name || trip.title || trip.tripName || trip.destination || "Journey " + tripId.slice(0, 6),
            status: trip.status || (trip.deleted_at ? "cancelled" : (trip.completed_at ? "completed" : "active")),
            startDate: trip.start_date || trip.startDate || trip.departureDate || (trip.created_at ? new Date(trip.created_at).toISOString().slice(0, 10) : null),
            endDate: trip.end_date || trip.endDate || trip.returnDate || null,
            totalSeats: trip.total_seats || trip.seats || 0,
            participants: typeof trip.participants === "number" ? trip.participants : (trip.participants ? Object.keys(trip.participants).length : 0),
            companyId: orgId,
            companyName: org.metadata.name || "Unnamed Company"
          });
        }
      }

      // Total members
      const members = staffCount + tripParticipantsCount;

      // Seat utilisation
      const seatUtilisation = totalSeats > 0
        ? Math.round((tripParticipantsCount / totalSeats) * 1000) / 10
        : 0;

      // Revenue & payments (converted to EUR)
      let revenue = 0;
      let stripeRevenue = 0;
      let iapRevenue = 0;
      let completedCheckouts = 0;

      if (org.payments) {
        for (const paymentId in org.payments) {
          const payment = org.payments[paymentId];
          const amountEur = getPaymentAmountInEur(payment);
          revenue += amountEur;
          
          if (payment.gateway === "apple_iap" || payment.paymentMethod === "apple_iap") {
            iapRevenue += amountEur;
          } else {
            stripeRevenue += amountEur;
          }

          if (payment.status === "succeeded" || payment.status === "paid" || payment.status === "success" || payment.gateway === "stripe" || payment.gateway === "apple_iap" || (payment.status !== "failed" && payment.status !== "pending" && !payment.refunded && amountEur > 0)) {
            completedCheckouts++;
          }
        }
      }

      // Checkout conversion
      let initiatedCheckouts = org.checkout_sessions ? Object.keys(org.checkout_sessions).length : 0;
      initiatedCheckouts = Math.max(initiatedCheckouts, completedCheckouts);
      const conversionRate = initiatedCheckouts > 0
        ? Math.round((completedCheckouts / initiatedCheckouts) * 1000) / 10
        : 100;

      // Currently connected
      let currentlyConnected = 0;
      if (activeTripsData[orgId]) {
        for (const tripId in activeTripsData[orgId]) {
          const locs = activeTripsData[orgId][tripId]?.locations || {};
          for (const uid in locs) {
            if (locs[uid]?.updated_at && locs[uid].updated_at > fiveMinutesAgo) {
              currentlyConnected++;
            }
          }
        }
      }

      // Country
      const rawCountry = org.metadata.country;
      let country = "Netherlands";
      if (rawCountry) {
        if (typeof rawCountry === "object") {
          country = rawCountry.name || rawCountry.country || rawCountry.code || "Netherlands";
        } else {
          country = String(rawCountry);
        }
      }

      // Status
      const status = org.metadata.deleted_at ? "Inactive" : "Active";

      companies.push({
        id: orgId,
        name: org.metadata.name || "Unnamed Company",
        country,
        status,
        members,
        journeys,
        activeJourneys,
        registeredParticipants: tripParticipantsCount,
        totalSeats,
        seatUtilisation,
        completedCheckouts,
        initiatedCheckouts,
        conversionRate,
        currentlyConnected,
        revenue: Math.round(revenue * 100) / 100,
        stripeRevenue: Math.round(stripeRevenue * 100) / 100,
        iapRevenue: Math.round(iapRevenue * 100) / 100,
        customerLifetimeValue: Math.round(revenue * 100) / 100,
        manualRevenue: 0,
        otherRevenue: 0,
        trips: tripsList
      });
    }

    // Save compiled summary to RTDB so subsequent calls only read 5KB
    db.ref("platform_stats/companies_summary").set(companies).catch((e) => console.warn("Cache write failed:", e.message));
    setCached("companies", companies);

    res.status(200).json(companies);
  } catch (error) {
    console.error("Error in analyticsCompanies:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * Endpoint to get aggregated platform-wide overview analytics.
 */
exports.analyticsOverview = onRequest({ region: "europe-west1" }, async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=120");

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    // 1. Check in-memory cache first
    const memCached = getCached("overview");
    if (memCached) {
      return res.status(200).json(memCached);
    }

    // 2. Check cached platform overview (near-instant response, 0 tree scan)
    const overviewSnap = await db.ref("platform_stats/overview").once("value");
    if (overviewSnap.exists()) {
      const cached = overviewSnap.val() || {};
      const fin = cached.financial || {};
      const orgsData = cached.organizations || {};
      const journeysData = cached.journeys || {};
      const participantsData = cached.participants || {};
      const seatsData = cached.seats || {};
      const paymentsData = cached.payments || {};
      const bizData = cached.business || {};

      const totalRevenue = fin.totalRevenue || 0;
      const activeOrganizations = orgsData.active || 0;
      const activeJourneys = journeysData.active || 0;
      const registeredParticipants = participantsData.registered || 0;
      const utilisationPercentage = seatsData.utilisationPercentage || 0;
      const conversionRate = paymentsData.conversionRate || 100;
      const currentlyConnected = participantsData.currentlyConnected || 0;
      const customerLifetimeValue = bizData.customerLifetimeValue || 0;

      const responsePayload = {
        status: "success",
        lastSuccessfulSync: new Date(cached.updated_at || Date.now()).toISOString(),
        data: cached,
        kpis: [
          {
            id: "total_revenue",
            metric: "Total Revenue",
            title: "Total Revenue",
            apiField: "financial.totalRevenue",
            value: new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(totalRevenue),
            numericValue: totalRevenue,
            status: "live",
            format: "currency"
          },
          {
            id: "active_organizations",
            metric: "Active Organizations",
            title: "Active Organizations",
            apiField: "organizations.active",
            value: String(activeOrganizations),
            numericValue: activeOrganizations,
            status: "live",
            format: "integer"
          },
          {
            id: "active_journeys",
            metric: "Total Active Journeys",
            title: "Active Journeys",
            apiField: "journeys.active",
            value: String(activeJourneys),
            numericValue: activeJourneys,
            status: "live",
            format: "integer"
          },
          {
            id: "registered_participants",
            metric: "Total Pilgrims Registered",
            title: "Registered Participants",
            apiField: "participants.registered",
            value: String(registeredParticipants),
            numericValue: registeredParticipants,
            status: "live",
            format: "integer"
          },
          {
            id: "seat_utilisation",
            metric: "Seat Utilisation %",
            title: "Seat Utilisation",
            apiField: "seats.utilisationPercentage",
            value: `${utilisationPercentage.toFixed(1)}%`,
            numericValue: utilisationPercentage,
            status: "calculated",
            format: "percentage"
          },
          {
            id: "payment_conversion",
            metric: "Payment Conversion Rate",
            title: "Payment Conversion",
            apiField: "payments.conversionRate",
            value: `${conversionRate.toFixed(1)}%`,
            numericValue: conversionRate,
            status: "calculated",
            format: "percentage"
          },
          {
            id: "connected_participants",
            metric: "Participants Currently Connected",
            title: "Currently Connected",
            apiField: "participants.currentlyConnected",
            value: String(currentlyConnected),
            numericValue: currentlyConnected,
            status: "live",
            format: "integer"
          },
          {
            id: "customer_lifetime_value",
            metric: "Customer Lifetime Value (LTV)",
            title: "Customer Lifetime Value",
            apiField: "business.customerLifetimeValue",
            value: new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(customerLifetimeValue),
            numericValue: customerLifetimeValue,
            status: "calculated",
            format: "currency"
          }
        ],
        metrics: cached.detailed_metrics || []
      };

      setCached("overview", responsePayload);
      return res.status(200).json(responsePayload);
    }

    // 3. Fallback: calculate once and return
    const { calculateAndStorePlatformStats } = require("./dashboardStatsFunctions");
    await calculateAndStorePlatformStats();
    const freshSnap = await db.ref("platform_stats/overview").once("value");
    const freshData = { status: "success", data: freshSnap.val() || {} };
    setCached("overview", freshData);
    return res.status(200).json(freshData);
  } catch (error) {
    console.error("Error in analyticsOverview:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * Endpoint to get detailed calculation metrics.
 * - If ?orgId=xyz: returns 68 company-level metrics (from cache or calculated for this single org only).
 * - If ?scope=platform or no orgId: returns 79 platform-level metrics (from cache).
 */
exports.analyticsMetrics = onRequest({ region: "europe-west1" }, async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=120");

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    const { orgId } = req.query;

    if (orgId) {
      // Check in-memory cache for this org
      const memCached = memoryCache.companyMetrics.get(orgId);
      if (memCached && (Date.now() - memCached.timestamp < MEMORY_CACHE_TTL_MS)) {
        return res.status(200).json(memCached.data);
      }

      // 1. Check cached detailed_metrics for this specific organization
      const cachedSnap = await db.ref(`orgs/${orgId}/dashboard_stats/detailed_metrics`).once("value");
      if (cachedSnap.exists()) {
        const data = cachedSnap.val() || [];
        memoryCache.companyMetrics.set(orgId, { data, timestamp: Date.now() });
        return res.status(200).json(data);
      }

      // 2. If not cached, query ONLY this single org node (NOT the entire database)
      const orgSnap = await db.ref(`orgs/${orgId}`).once("value");
      if (!orgSnap.exists()) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const activeTripsSnap = await db.ref(`trips_active/${orgId}`).once("value");
      const activeTripsData = activeTripsSnap.exists() ? { [orgId]: activeTripsSnap.val() } : {};

      const metrics = calculateCompanyMetrics(orgSnap.val(), orgId, {}, activeTripsData);
      memoryCache.companyMetrics.set(orgId, { data: metrics, timestamp: Date.now() });
      return res.status(200).json(metrics);
    }

    // Platform-level: check in-memory cache first
    const memPlatform = getCached("platformMetrics");
    if (memPlatform) {
      return res.status(200).json(memPlatform);
    }

    // Check cached platform_stats/overview/detailed_metrics
    const platformCachedSnap = await db.ref("platform_stats/overview/detailed_metrics").once("value");
    if (platformCachedSnap.exists()) {
      const data = platformCachedSnap.val() || [];
      setCached("platformMetrics", data);
      return res.status(200).json(data);
    }

    // Fallback: calculate once and cache
    const { calculateAndStorePlatformStats } = require("./dashboardStatsFunctions");
    await calculateAndStorePlatformStats();
    const updatedSnap = await db.ref("platform_stats/overview/detailed_metrics").once("value");
    const data = updatedSnap.val() || [];
    setCached("platformMetrics", data);
    return res.status(200).json(data);
  } catch (error) {
    console.error("Error in analyticsMetrics:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
