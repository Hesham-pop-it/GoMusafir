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
  AF: "USD",
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
      allow_promotion_codes: true,
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

// ── Request Seat Top-up Link ────────────────────────────────────────────────
exports.requestSeatTopupLink = onCall({ region: "europe-west1", secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "manager", "co-host"]);

  const data = request.data;
  const { tripId, planId, seatsToIncr, countryCode } = data;
  const { uid, token } = request.auth;
  const orgId = token.orgId;
  const email = token.email;

  if (!tripId || !planId || !seatsToIncr || !orgId) {
    throw new HttpsError("invalid-argument", "Missing required fields for seat top-up.");
  }

  // Fetch trip details to ensure it belongs to the org
  const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}`).get();
  if (!tripSnap.exists()) throw new HttpsError("not-found", "Trip not found.");
  const trip = tripSnap.val();

  // Get Pricing
  const pricingConfig = getPlanPricing(countryCode || "DEFAULT", planId);
  const pricePerSeat = pricingConfig.price;
  const unitAmount = Math.round(pricePerSeat * 100);

  // Create Stripe Session
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: pricingConfig.currency,
          product_data: {
            name: `Extra Seats — ${trip.title}`,
            description: `Adding ${seatsToIncr} seats at ${pricingConfig.symbol}${pricePerSeat}/seat`,
          },
          unit_amount: unitAmount,
        },
        quantity: parseInt(seatsToIncr),
      },
    ],
    mode: "payment",
    phone_number_collection: { enabled: true },
    shipping_address_collection: { allowed_countries: ALLOWED_SHIPPING_COUNTRIES },
    billing_address_collection: "required",
    allow_promotion_codes: true,
    invoice_creation: { enabled: true },
    expires_at: Math.floor(Date.now() / 1000) + (60 * 60), // Expire in 1 hour
    metadata: {
      orgId,
      tripId,
      action: "SEAT_TOPUP",
      seatsToIncr: String(seatsToIncr),
      journeyName: trip.title,
      uid: uid
    },
    success_url: `https://go-musafir.web.app/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://go-musafir.web.app/payment-cancel`,
  });

  // Send Email
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #B99A4A; text-align: center;">Increase Trip Capacity</h2>
      <p>Hello,</p>
      <p>You requested to increase the seat capacity for your trip <strong>"${trip.title}"</strong> by <strong>${seatsToIncr} seats</strong>.</p>
      <p>Click the button below to complete the payment. Once paid, the seats will be added to your trip automatically.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${session.url}" style="background-color: #B99A4A; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Pay & Increase Seats</a>
      </div>
      <p style="color: #999; font-size: 12px;">This link will expire in 1 hour.</p>
    </div>
  `;

  const { sendEmail } = require("../services/emailService");
  await sendEmail({ to: email, subject: `Seat Top-up: ${trip.title}`, html: htmlContent });

  await writeAuditLog(orgId, { 
    action: "SEAT_TOPUP_LINK_REQUESTED", 
    byUid: uid, 
    extra: { tripId, seatsToIncr } 
  });

  return { success: true, url: session.url };
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
        const { orgId, journeyName, planId, seats, countryCode, pricePerSeat, action, tripId, seatsToIncr } = session.metadata;

        try {
          if (orgId) {
            // S30: Idempotency Check — ensure we haven't already processed this session
            const paymentsRef = db.ref(`orgs/${orgId}/payments`);
            const existingPaymentSnap = await paymentsRef.orderByChild('stripeSessionId').equalTo(session.id).get();
            
            if (existingPaymentSnap.exists()) {
              console.log(`⚠️ Webhook already processed for session ${session.id}. Skipping.`);
              return res.json({ received: true, already_processed: true });
            }

            const paymentId = paymentsRef.push().key;
            
            // Safe parsing to avoid NaN crashes
            const seatsNum = parseInt(seats || seatsToIncr || "0");
            const priceNum = parseFloat(pricePerSeat || "0");

            await db.ref(`orgs/${orgId}/payments/${paymentId}`).set({
              stripeSessionId: session.id,
              stripeCustomerId: session.customer || null,
              planId: planId || (action === "SEAT_TOPUP" ? "seat_topup" : "unknown"),
              seats: isNaN(seatsNum) ? 0 : seatsNum,
              pricePerSeat: isNaN(priceNum) ? 0 : priceNum,
              amount: session.amount_total,
              currency: session.currency,
              journeyName: journeyName || "Untitled Journey",
              countryCode: countryCode || "unknown",
              created_at: admin.database.ServerValue.TIMESTAMP,
              action: action || "INITIAL_PAYMENT"
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

            // S30: Handle Seat Top-up Automation
            if (action === "SEAT_TOPUP") {
              if (tripId && seatsToIncr) {
                const seatsToIncrNum = parseInt(seatsToIncr);
                const tripRef = db.ref(`orgs/${orgId}/trips/${tripId}`);
                await tripRef.transaction((currentData) => {
                  if (currentData) {
                    currentData.total_seats = (currentData.total_seats || 0) + seatsToIncrNum;
                  }
                  return currentData;
                });
                
                await writeAuditLog(orgId, { 
                  action: "TRIP_CAPACITY_INCREASED", 
                  targetId: tripId, 
                  extra: { increment: seatsToIncr } 
                });
                console.log(`🚀 Automated Task: TRIP ${tripId} CAPACITY INCREASED BY ${seatsToIncr}`);
              }
            }
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
