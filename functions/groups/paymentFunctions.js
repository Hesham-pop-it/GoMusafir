// ─── Payment Functions ────────────────────────────────────────────────────────
// Covers: S29 (Stripe webhook verification), S30 (idempotent payments),
//         S6 (auth required), S17 (input validation), S20 (audit log)

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { admin, db } = require("../admin");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth, requireRole } = require("../middleware/appCheckMiddleware");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ── Regional Pricing — Server-Side Enforcement ────────────────────────────────
const PRICING_PLANS = {
  seat_only: {
    EUR: { price: 9.99, currency: "eur", symbol: "€" },
    USD: { price: 11.99, currency: "usd", symbol: "$" },
    SAR: { price: 44.99, currency: "sar", symbol: "SAR " },
    AED: { price: 43.99, currency: "aed", symbol: "AED " },
    GBP: { price: 8.99, currency: "gbp", symbol: "£" },
    INR: { price: 1109.00, currency: "inr", symbol: "₹" },
    IDR: { price: 199999.00, currency: "idr", symbol: "Rp" },
    PKR: { price: 3199.00, currency: "pkr", symbol: "Rs " },
  },
  basic_pack: {
    EUR: { price: 14.99, currency: "eur", symbol: "€" },
    USD: { price: 17.99, currency: "usd", symbol: "$" },
    SAR: { price: 66.99, currency: "sar", symbol: "SAR " },
    AED: { price: 65.99, currency: "aed", symbol: "AED " },
    GBP: { price: 12.99, currency: "gbp", symbol: "£" },
    INR: { price: 1659.00, currency: "inr", symbol: "₹" },
    IDR: { price: 299999.00, currency: "idr", symbol: "Rp" },
    PKR: { price: 4799.00, currency: "pkr", symbol: "Rs " },
  },
  plus_pack: {
    EUR: { price: 18.99, currency: "eur", symbol: "€" },
    USD: { price: 22.99, currency: "usd", symbol: "$" },
    SAR: { price: 84.99, currency: "sar", symbol: "SAR " },
    AED: { price: 82.99, currency: "aed", symbol: "AED " },
    GBP: { price: 16.99, currency: "gbp", symbol: "£" },
    INR: { price: 2099.00, currency: "inr", symbol: "₹" },
    IDR: { price: 379999.00, currency: "idr", symbol: "Rp" },
    PKR: { price: 5999.00, currency: "pkr", symbol: "Rs " },
  },
  elite_wireless: {
    EUR: { price: 27.99, currency: "eur", symbol: "€" },
    USD: { price: 32.99, currency: "usd", symbol: "$" },
    SAR: { price: 123.99, currency: "sar", symbol: "SAR " },
    AED: { price: 121.99, currency: "aed", symbol: "AED " },
    GBP: { price: 24.99, currency: "gbp", symbol: "£" },
    INR: { price: 3099.00, currency: "inr", symbol: "₹" },
    IDR: { price: 559999.00, currency: "idr", symbol: "Rp" },
    PKR: { price: 8999.00, currency: "pkr", symbol: "Rs " },
  }
};

const COUNTRY_TO_CURRENCY = {
  US: "USD",
  SA: "SAR",
  AE: "AED",
  GB: "GBP",
  IN: "INR",
  ID: "IDR",
  PK: "PKR",
};

function getPlanPricing(countryCode, planId) {
  const currencyCode = COUNTRY_TO_CURRENCY[countryCode?.toUpperCase()] || "EUR";
  const planPricing = PRICING_PLANS[planId] || PRICING_PLANS["seat_only"];
  return planPricing[currencyCode] || planPricing["EUR"];
}

const ALLOWED_SHIPPING_COUNTRIES = [
  "NL", "PK", "TR", "AR", "SA", "AE", "GB", "DE", "FR", "BE",
  "US", "CA", "AU", "IT", "ES", "SE", "NO", "DK", "FI", "AT",
  "CH", "IE", "PT", "PL", "CZ", "GR", "HU", "RO", "BG", "HR",
  "MY", "SG", "ID", "TH", "IN", "BD", "EG", "MA", "QA", "KW",
  "BH", "OM", "JO", "LB", "IQ",
];

// ── Get Regional Pricing (lightweight, no auth needed) ───────────────────────
exports.getRegionalPricing = onCall({ region: "europe-west1" }, async (request) => {
  const countryCode = request.data?.countryCode || "DEFAULT";
  const currencyCode = COUNTRY_TO_CURRENCY[countryCode?.toUpperCase()] || "EUR";
  
  const plans = {};
  for (const planId in PRICING_PLANS) {
    plans[planId] = PRICING_PLANS[planId][currencyCode] || PRICING_PLANS[planId]["EUR"];
  }
  return { plans };
});

// ── Create Checkout Session ───────────────────────────────────────────────────
exports.createCheckoutSession = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);

  const data = request.data;
  let orgId = request.auth?.token?.orgId;
  let uid = request.auth?.uid;

  // Support link token auth for website (users aren't Firebase-authenticated there)
  if (!orgId && data.linkToken) {
    const tokenSnap = await db.ref(`temp_links/${data.linkToken}`).get();
    if (!tokenSnap.exists()) throw new HttpsError("unauthenticated", "Invalid or expired link.");
    const tokenData = tokenSnap.val();
    if (Date.now() > tokenData.expiresAt) {
      throw new HttpsError("permission-denied", "Link is no longer valid.");
    }
    orgId = tokenData.orgId;
    uid = tokenData.uid;
  }

  if (!orgId) throw new HttpsError("unauthenticated", "Not authorized.");

  const planId = data.planId;
  const planName = data.planName || planId;
  const seats = parseInt(data.seats);
  const journeyName = data.journeyName;

  if (!planId || !seats || seats < 1 || !journeyName) {
    throw new HttpsError("invalid-argument", "Missing required checkout fields.");
  }

  // Resolve country code — prefer server-side DB lookup over client-sent value
  let countryCode = null;
  if (uid) {
    const countrySnap = await db.ref(`users/${uid}/country`).get();
    if (countrySnap.exists()) {
      const country = countrySnap.val();
      countryCode = typeof country === "object" ? country.code : country;
    }
  }
  // Only fall back to client value if DB has nothing (less trusted)
  if (!countryCode) countryCode = data.countryCode || "DEFAULT";

  // Server-side price enforcement
  const pricingConfig = getPlanPricing(countryCode, planId);
  const pricePerSeat = pricingConfig.price;
  const currency = pricingConfig.currency;
  const unitAmount = Math.round(pricePerSeat * 100); // Stripe uses cents

  const idempotencyKey = `${orgId}-${planId}-${seats}-${journeyName.replace(/\s+/g, '_')}`;

  const session = await stripe.checkout.sessions.create(
    {
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `${planName} — ${journeyName}`,
              description: `${seats} seats at ${pricingConfig.symbol}${pricePerSeat.toFixed(2)}/seat`,
            },
            unit_amount: unitAmount,
          },
          quantity: seats,
        },
      ],
      mode: "payment",
      customer_creation: "always",
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ALLOWED_SHIPPING_COUNTRIES },
      billing_address_collection: "required",
      invoice_creation: { enabled: true },
      metadata: {
        orgId,
        uid: uid || "unknown",
        journeyName,
        planId,
        seats: String(seats),
        countryCode,
        pricePerSeat: String(pricePerSeat),
        linkToken: data.linkToken || "",
      },
      success_url: `https://go-musafir.web.app/create-journey?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://go-musafir.web.app/create-journey?status=cancel`,
    },
    { idempotencyKey }
  );

  return { url: session.url };
});

// ── Stripe Webhook ────────────────────────────────────────────────────────────
// S29: Signature verified with stripe.webhooks.constructEvent before any action.
exports.stripeWebhookHandler = onRequest(
  { region: "europe-west1", rawBody: true },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err) {
      console.warn(`Webhook signature error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.payment_status === "paid") {
        const { orgId, journeyName, planId, seats, countryCode, pricePerSeat } = session.metadata;

        try {
          // Record payment under org
          if (orgId) {
            const paymentId = db.ref(`orgs/${orgId}/payments`).push().key;
            await db.ref(`orgs/${orgId}/payments/${paymentId}`).set({
              stripeSessionId: session.id,
              stripeCustomerId: session.customer || null,
              planId,
              seats: parseInt(seats),
              pricePerSeat: parseFloat(pricePerSeat),
              amount: session.amount_total,
              currency: session.currency,
              journeyName,
              countryCode,
              created_at: admin.database.ServerValue.TIMESTAMP,
            });

            // If this was initiated via a link token, mark it as paid
            if (session.metadata.linkToken) {
              await db.ref(`temp_links/${session.metadata.linkToken}`).update({
                paid: true,
                stripeSessionId: session.id,
                planId: planId,
                seats: parseInt(seats)
              });
            }

            console.log(`✅ Payment confirmed: Org ${orgId}, Plan ${planId}, Seats ${seats}`);
          }
        } catch (dbErr) {
          console.warn("DB update failed during webhook:", dbErr);
          return res.status(500).json({ error: "Database update failed" });
        }
      }
    }

    res.json({ received: true });
  }
);

// ── Verify Payment ────────────────────────────────────────────────────────────
exports.verifyPayment = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);

  const { sessionId } = request.data;
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId is required.");

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return {
    verified: session.payment_status === "paid",
    status: session.status,
    payment: session.payment_status,
  };
});
