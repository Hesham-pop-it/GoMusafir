// ─── Payment Functions ────────────────────────────────────────────────────────
// Covers: S29 (Stripe webhook verification), S30 (idempotent payments),
//         S6 (auth required), S17 (input validation), S20 (audit log)

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { admin, db } = require("../admin");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth, requireRole } = require("../middleware/appCheckMiddleware");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { sendPushNotification } = require("../services/notificationService");

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

  // Retrieve current prepaid seats balance
  const orgSnap = await db.ref(`orgs/${orgId}/prepaid_seats`).get();
  const currentPrepaid = orgSnap.val() || 0;

  const prepaidDeducted = Math.min(currentPrepaid, seats);
  const unpaidSeats = seats - prepaidDeducted;

  if (unpaidSeats < 1) {
    throw new HttpsError("failed-precondition", "Requested seats are fully covered by prepaid balance. No checkout payment is needed.");
  }

  // Server-side price enforcement
  const pricingConfig = getPlanPricing(countryCode, planId);
  const pricePerSeat = pricingConfig.price;
  const currency = pricingConfig.currency;
  const unitAmount = Math.round(pricePerSeat * 100); // Stripe uses cents

  const idempotencyKey = `${orgId}-${planId}-${unpaidSeats}-${journeyName.replace(/\s+/g, '_')}-${data.linkToken || 'no-token'}`;

  const session = await stripe.checkout.sessions.create(
    {
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `${planName} — ${journeyName}`,
              description: `${unpaidSeats} seats at ${pricingConfig.symbol}${pricePerSeat.toFixed(2)}/seat (${prepaidDeducted} seats prepaid)`,
            },
            unit_amount: unitAmount,
          },
          quantity: unpaidSeats,
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
        seats: String(seats), // Store the total seats requested
        prepaidSeatsDeducted: String(prepaidDeducted),
        unpaidSeats: String(unpaidSeats),
        countryCode,
        pricePerSeat: String(pricePerSeat),
        linkToken: data.linkToken || "",
      },
      success_url: `https://app.gomusafir.app/create-journey?status=success&session_id={CHECKOUT_SESSION_ID}&token=${data.linkToken || ""}`,
      cancel_url: `https://app.gomusafir.app/create-journey?status=cancel&token=${data.linkToken || ""}`,
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
    success_url: `https://app.gomusafir.app/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://app.gomusafir.app/payment-cancel`,
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
    try {
      const sig = req.headers["stripe-signature"];
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

      let event;
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
      } catch (err) {
        console.warn(`Webhook signature error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      if (event.type === "invoice.paid") {
        const invoice = event.data.object;
        let { orgId, seats } = invoice.metadata || {};

        // 1. Resolve orgId if not explicitly provided in invoice metadata
        if (!orgId && invoice.customer) {
          // Try looking up in Firebase Realtime Database
          const orgsSnap = await db.ref("orgs").orderByChild("stripe_customer_id").equalTo(invoice.customer).limitToFirst(1).get();
          if (orgsSnap.exists()) {
            const keys = Object.keys(orgsSnap.val());
            orgId = keys[0];
            console.log(`🔍 Resolved orgId ${orgId} from database stripe_customer_id mapping.`);
          } else {
            // Try retrieving customer metadata directly from Stripe
            try {
              const customer = await stripe.customers.retrieve(invoice.customer);
              if (customer && customer.metadata && customer.metadata.orgId) {
                orgId = customer.metadata.orgId;
                console.log(`🔍 Resolved orgId ${orgId} from Stripe Customer metadata.`);
                // Save mapping in database for future fast lookups
                await db.ref(`orgs/${orgId}/stripe_customer_id`).set(invoice.customer);
              }
            } catch (err) {
              console.warn(`Could not retrieve customer ${invoice.customer} from Stripe:`, err);
            }
          }
        }

        // 2. Resolve seatCount. If metadata 'seats' is missing, sum quantity of line items
        let seatCount = parseInt(seats) || 0;
        if (!seatCount && invoice.lines && invoice.lines.data) {
          for (const line of invoice.lines.data) {
            if (line.quantity) {
              seatCount += line.quantity;
            }
          }
        }

        if (orgId && seatCount > 0) {
          try {
            // Idempotency: check if this invoice was already processed
            const invoiceRef = db.ref(`orgs/${orgId}/processed_invoices/${invoice.id}`);
            const invoiceSnap = await invoiceRef.get();
            if (invoiceSnap.exists()) {
              console.log(`⚠️ Invoice ${invoice.id} already processed. Skipping.`);
              return res.json({ received: true, already_processed: true });
            }

            // Add seats to organization's prepaid balance
            await db.ref(`orgs/${orgId}/prepaid_seats`).transaction((current) => {
               return (current || 0) + seatCount;
            });

            // Mark invoice as processed
            await invoiceRef.set({
              amountPaid: invoice.amount_paid,
              currency: invoice.currency,
              seats: seatCount,
              processed_at: admin.database.ServerValue.TIMESTAMP
            });

            // Write audit log
            await writeAuditLog(orgId, {
              action: "PREPAID_SEATS_INVOICE_PAID",
              extra: { invoiceId: invoice.id, amount: invoice.amount_paid, seats: seatCount }
            });

            console.log(`✅ Invoice paid: Org ${orgId} credited with ${seatCount} prepaid seats.`);
          } catch (invoiceErr) {
            console.warn("❌ Invoice webhook processing failed:", invoiceErr);
            return res.status(500).json({ error: "Failed to process invoice webhook" });
          }
        }
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        if (session.payment_status === "paid") {
          const { orgId, journeyName, planId, seats, countryCode, pricePerSeat, action, tripId, seatsToIncr, prepaidSeatsDeducted } = session.metadata;

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
                action: action || "INITIAL_PAYMENT",
                prepaidSeatsDeducted: parseInt(prepaidSeatsDeducted || "0")
              });

              // Save/Update stripeCustomerId in organization details for future lookups
              if (session.customer) {
                await db.ref(`orgs/${orgId}/stripe_customer_id`).set(session.customer);
                console.log(`🔗 Associated stripeCustomerId ${session.customer} with Org ${orgId}`);
              }

              // Deduct prepaid seats used in hybrid checkout
              const prepaidDeductedNum = parseInt(prepaidSeatsDeducted || "0");
              if (prepaidDeductedNum > 0) {
                await db.ref(`orgs/${orgId}/prepaid_seats`).transaction((current) => {
                  return Math.max(0, (current || 0) - prepaidDeductedNum);
                });
                console.log(`💳 Hybrid checkout: Deducted ${prepaidDeductedNum} prepaid seats from Org ${orgId}`);
              }

              // If this was initiated via a link token, mark it as paid/used safely
              if (session.metadata.linkToken) {
                const tokenSnap = await db.ref(`temp_links/${session.metadata.linkToken}`).get();
                if (tokenSnap.exists()) {
                  const tokenData = tokenSnap.val();
                  if (tokenData.paid) {
                    console.log(`⚠️ Link token ${session.metadata.linkToken} is already paid. Skipping double webhook processing.`);
                    return res.json({ received: true, already_processed: true });
                  }

                  const updates = {
                    paid: true,
                    stripeSessionId: session.id,
                    planId: planId || (action === "SEAT_TOPUP" ? "seat_topup" : "unknown"),
                    seats: isNaN(seatsNum) ? 0 : seatsNum
                  };

                  // For SEAT_TOPUP, since there is no separate final creation step, mark as used now
                  if (action === "SEAT_TOPUP") {
                    updates.used = true;
                  }

                  await db.ref(`temp_links/${session.metadata.linkToken}`).update(updates);
                }
              }

              console.log(`✅ Payment confirmed: Org ${orgId}, Plan ${planId}, Seats ${seats}`);

              // Notify Admin of Payment Success
              const adminUidSnap = await db.ref(`orgs/${orgId}/metadata/admin_uid`).get();
              const adminUid = adminUidSnap.val();
              if (adminUid) {
                sendPushNotification(
                  adminUid,
                  "Payment Successful",
                  `Your payment for ${planId === 'seat_topup' ? 'Seat Top-up' : planId} was successful.`,
                  { type: 'PAYMENT_SUCCESS', orgId, planId },
                  { androidChannelId: "Admin" }
                ).catch(e => console.log("Push error:", e.message));
              }

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
    } catch (globalErr) {
      console.error("Global Webhook Error:", globalErr);
      try {
        await db.ref("system_logs/webhook_errors").push({
          error: globalErr.message || String(globalErr),
          stack: globalErr.stack || null,
          timestamp: admin.database.ServerValue.TIMESTAMP
        });
      } catch (dbLogErr) {
        console.error("Failed to write error log to Database:", dbLogErr);
      }
      return res.status(500).send("Internal Server Error");
    }
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

// ── Generate Seat Top-up Token ───────────────────────────────────────────────
exports.generateSeatTopupToken = onCall({ region: "europe-west1", secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "manager", "co-host"]);

  const data = request.data;
  const { tripId, seatsToIncr } = data;
  const { uid, token } = request.auth;
  const orgId = token.orgId;
  const email = token.email;

  if (!tripId || !seatsToIncr || !orgId) {
    throw new HttpsError("invalid-argument", "Missing required fields for seat top-up.");
  }

  // Fetch trip details to ensure it belongs to the org
  const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}`).get();
  if (!tripSnap.exists()) throw new HttpsError("not-found", "Trip not found.");
  const trip = tripSnap.val();

  // Generate a unique, short-lived secure token for this link
  const crypto = require("crypto");
  const linkToken = crypto.randomBytes(32).toString("hex");
  const expiry = Date.now() + 15 * 60 * 1000; // 15 minutes expiry

  await db.ref(`temp_links/${linkToken}`).set({
    orgId: orgId,
    uid: uid,
    email: email,
    expiresAt: expiry,
    used: false,
    action: "SEAT_TOPUP",
    tripId: tripId,
    seats: parseInt(seatsToIncr),
  });

  const webLink = `https://app.gomusafir.app/increase-seats?token=${linkToken}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #B99A4A; text-align: center;">Increase Trip Seats</h2>
      <p>Hello,</p>
      <p>Click the button below to purchase ${seatsToIncr} additional seats for your trip "${trip.title}" on the GoMusafir web application. This secure link is valid for 15 minutes.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${webLink}" style="background-color: #B99A4A; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Complete Seat Increase</a>
      </div>
      <p style="word-break: break-all; color: #666; font-size: 11px;">Verification Link: ${webLink}</p>
    </div>
  `;

  try {
    const { sendEmail } = require("../services/emailService");
    await sendEmail({ to: email, subject: "Complete Your GoMusafir Seat Increase", html: htmlContent });
  } catch (emailErr) {
    console.warn("Failed to send email link:", emailErr);
  }

  return { token: linkToken };
});

// ── Preview Seat Top-up (validate token, return pricing, do NOT consume) ──────
exports.previewSeatTopup = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);

  const { token } = request.data;
  if (!token) throw new HttpsError("invalid-argument", "Token is required.");

  const tokenRef = db.ref(`temp_links/${token}`);
  const snapshot = await tokenRef.get();

  if (!snapshot.exists()) {
    throw new HttpsError("not-found", "Invalid or expired link. Please request a new one from the app.");
  }

  const tokenData = snapshot.val();
  if (tokenData.used || tokenData.paid) {
    throw new HttpsError("permission-denied", "This link has already been used.");
  }
  if (Date.now() > tokenData.expiresAt) {
    throw new HttpsError("deadline-exceeded", "This link has expired. Please request a new one from the app.");
  }
  if (tokenData.action !== "SEAT_TOPUP") {
    throw new HttpsError("invalid-argument", "Invalid action for this link.");
  }

  const { tripId, seats, orgId, uid } = tokenData;

  // Resolve country code
  let countryCode = null;
  if (uid) {
    const countrySnap = await db.ref(`users/${uid}/country`).get();
    if (countrySnap.exists()) {
      const country = countrySnap.val();
      countryCode = typeof country === "object" ? country.code : country;
    }
  }
  if (!countryCode) countryCode = "DEFAULT";

  // Return all plans with their pricing for the user's region
  const currencyCode = COUNTRY_TO_CURRENCY[countryCode?.toUpperCase()] || "EUR";
  const plans = {};
  for (const planId in PRICING_PLANS) {
    const p = PRICING_PLANS[planId][currencyCode] || PRICING_PLANS[planId]["EUR"];
    plans[planId] = p;
  }

  // Return trip info and pricing (token is NOT consumed here)
  return { seats: parseInt(seats), plans };
});

// ── Verify & Pay Seat Top-up ──────────────────────────────────────────────────
exports.verifyAndPaySeatTopup = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);

  const { token, planId: chosenPlan } = request.data;
  if (!token) throw new HttpsError("invalid-argument", "Token is required.");

  const planToUse = chosenPlan || "seat_only";

  const tokenRef = db.ref(`temp_links/${token}`);
  const snapshot = await tokenRef.get();

  if (!snapshot.exists()) {
    throw new HttpsError("not-found", "Invalid or expired link. Please request a new one from the app.");
  }

  const tokenData = snapshot.val();
  if (tokenData.used || tokenData.paid) {
    throw new HttpsError("permission-denied", "This link has already been used.");
  }
  if (Date.now() > tokenData.expiresAt) {
    throw new HttpsError("deadline-exceeded", "This link has expired. Please request a new one from the app.");
  }
  if (tokenData.action !== "SEAT_TOPUP") {
    throw new HttpsError("invalid-argument", "Invalid action for this link.");
  }

  const { tripId, seats, orgId, uid } = tokenData;

  // Fetch trip details to get title
  const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}`).get();
  if (!tripSnap.exists()) throw new HttpsError("not-found", "Trip not found.");
  const trip = tripSnap.val();

  // Resolve country code from database
  let countryCode = null;
  if (uid) {
    const countrySnap = await db.ref(`users/${uid}/country`).get();
    if (countrySnap.exists()) {
      const country = countrySnap.val();
      countryCode = typeof country === "object" ? country.code : country;
    }
  }
  if (!countryCode) countryCode = "DEFAULT";

  // Enforce pricing configuration using the chosen plan
  const pricingConfig = getPlanPricing(countryCode, planToUse);
  const pricePerSeat = pricingConfig.price;
  const unitAmount = Math.round(pricePerSeat * 100);

  const websiteUrl = process.env.FUNCTIONS_EMULATOR === "true"
    ? "http://192.168.18.25:3000"
    : "https://app.gomusafir.app";

  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: pricingConfig.currency,
          product_data: {
            name: `Extra Seats — ${trip.title}`,
            description: `Adding ${seats} seats at ${pricingConfig.symbol}${pricePerSeat}/seat`,
          },
          unit_amount: unitAmount,
        },
        quantity: parseInt(seats),
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
      seatsToIncr: String(seats),
      journeyName: trip.title,
      uid: uid || "unknown",
      linkToken: token
    },
    success_url: `${websiteUrl}/increase-seats?status=success&session_id={CHECKOUT_SESSION_ID}&token=${token}`,
    cancel_url: `${websiteUrl}/increase-seats?status=cancel&token=${token}`,
  });

  return { url: session.url };
});

// ── Credit Prepaid Seats (Admin Manual Deal) ─────────────────────────────────
exports.creditPrepaidSeats = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin"]); // Only direct admin role can do this

  const { orgId, amount, reason } = request.data;
  if (!orgId || !amount || amount < 1) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  try {
    await db.ref(`orgs/${orgId}/prepaid_seats`).transaction((current) => {
      return (current || 0) + parseInt(amount);
    });

    await writeAuditLog(orgId, {
      action: "PREPAID_SEATS_MANUALLY_CREDITED",
      byUid: request.auth.uid,
      extra: { amount: parseInt(amount), reason: reason || "Enterprise deal" }
    });

    console.log(`✅ Admin ${request.auth.uid} manually credited ${amount} seats to Org ${orgId}. Reason: ${reason}`);
    return { success: true };
  } catch (error) {
    console.error("Manual seat credit failed:", error);
    throw new HttpsError("internal", "Failed to credit prepaid seats.");
  }
});
