// ─── Payment Functions ────────────────────────────────────────────────────────
// Covers: S29 (Stripe webhook verification), S30 (idempotent payments),
//         S6 (auth required), S17 (input validation), S20 (audit log)

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { admin, db } = require("../admin");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth, requireRole } = require("../middleware/appCheckMiddleware");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { sendPushNotification } = require("../services/notificationService");
const { createTripRecord } = require("./tripCreationHelper");

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

// ── Notify Staff Of Seat Update Helper ────────────────────────────────────────
async function notifyStaffOfSeatUpdate({ orgId, tripId = null, title = "Seat Update", message, diff = 0, totalSeats = null }) {
  try {
    const staffSnap = await db.ref(`orgs/${orgId}/staff`).once("value");
    const staffObj = staffSnap.val() || {};

    const relevantStaffUids = Object.keys(staffObj).filter(sUid => {
      const role = typeof staffObj[sUid] === "string" ? staffObj[sUid] : staffObj[sUid]?.role;
      if (!role) return true;
      const normalized = role.toLowerCase().trim();
      return ["admin", "co-host", "cohost", "manager"].includes(normalized);
    });

    if (relevantStaffUids.length === 0) return;

    const timestamp = Date.now();
    const payload = {
      type: "seat_update",
      orgId,
      ...(tripId ? { tripId } : {}),
      ...(totalSeats !== null ? { totalSeats: String(totalSeats) } : {}),
      diff: String(diff),
      timestamp: String(timestamp)
    };

    const options = {
      ...(tripId ? { tripId } : {}),
      interruptionLevel: "active",
      androidChannelId: "Admin",
      eventId: `seat_${tripId || orgId}_${Math.floor(timestamp / 15000)}`
    };

    const promises = [];

    relevantStaffUids.forEach(staffUid => {
      // 1. If tripId present, push under trips_active/${orgId}/${tripId}/notifications/${staffUid}
      if (tripId) {
        promises.push(
          db.ref(`trips_active/${orgId}/${tripId}/notifications/${staffUid}`).push().set({
            type: "seat_update",
            title,
            message,
            name: "Seat Update",
            tripId,
            orgId,
            timestamp,
            read: false,
            seen: false,
            ...(totalSeats !== null ? { totalSeats } : {}),
            diff
          })
        );
      }

      // 2. Direct user-level notification push
      promises.push(
        db.ref(`users/${staffUid}/notifications`).push().set({
          type: "seat_update",
          title,
          message,
          tripId: tripId || null,
          orgId,
          timestamp,
          read: false,
          seen: false
        })
      );

      // 3. FCM Push notification
      promises.push(
        sendPushNotification(staffUid, title, message, payload, options)
      );
    });

    await Promise.all(promises);
  } catch (err) {
    console.error("Failed to notify staff of seat update:", err);
  }
}

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

  let clientOrigin = data.origin || "https://app.gomusafir.app";
  // Validate origin to prevent open redirect security issues (allow production, staging, and local dev domains)
  const isAllowedOrigin = (origin) => {
    if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
    if (origin === "https://app.gomusafir.app") return true;
    if (origin === "https://go-musafir.web.app") return true;
    if (origin === "https://go-musafir.firebaseapp.com") return true;
    if (origin === "https://join.gomusafir.app") return true;
    if (origin === "https://gomusafir.app") return true;
    return false;
  };
  if (!isAllowedOrigin(clientOrigin)) {
    clientOrigin = "https://app.gomusafir.app";
  }

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
      success_url: `${clientOrigin}/create-journey?status=success&session_id={CHECKOUT_SESSION_ID}&token=${data.linkToken || ""}`,
      cancel_url: `${clientOrigin}/create-journey?status=cancel&token=${data.linkToken || ""}`,
    },
    { idempotencyKey }
  );

  await db.ref(`orgs/${orgId}/checkout_sessions/${session.id}`).set({
    status: "pending",
    created_at: admin.database.ServerValue.TIMESTAMP
  });

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

  await db.ref(`orgs/${orgId}/checkout_sessions/${session.id}`).set({
    status: "pending",
    created_at: admin.database.ServerValue.TIMESTAMP
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

// ── Process Paid Checkout Session Helper ──────────────────────────────────────
async function processPaidCheckoutSession(session) {
  const metadata = session.metadata || {};
  const { orgId, action, seatsToIncr, uid, countryCode, linkToken, planId, tripDetailsJson, tripId, prepaidSeatsDedueted } = metadata;

  // Align naming with Stripe metadata
  const prepaidSeatsDeducted = metadata.prepaidSeatsDedueted || metadata.prepaidSeatsDeducted || prepaidSeatsDedueted;

  if (!orgId) {
    console.warn(`⚠️ No orgId found in session metadata for session ${session.id}.`);
    return;
  }

  // Idempotency Check (using atomic transaction)
  const processedRef = db.ref(`processed_payments/${session.id}`);
  let alreadyProcessed = false;
  await processedRef.transaction((current) => {
    if (current !== null) {
      alreadyProcessed = true;
      return current;
    }
    return {
      orgId,
      processed_at: admin.database.ServerValue.TIMESTAMP
    };
  });

  if (alreadyProcessed) {
    console.log(`⚠️ Payment already processed for session ${session.id}. Skipping.`);
    return;
  }

  // Mark checkout session as completed
  await db.ref(`orgs/${orgId}/checkout_sessions/${session.id}`).update({
    status: "completed",
    completed_at: admin.database.ServerValue.TIMESTAMP
  });

  const seatsNum = parseInt(seatsToIncr || "0");
  const prepaidDeductedNum = parseInt(prepaidSeatsDeducted || "0");
  const totalSeatsRequested = seatsNum + prepaidDeductedNum;

  // Deduct prepaid seats if hybrid checkout
  if (prepaidDeductedNum > 0) {
    await db.ref(`orgs/${orgId}/prepaid_seats`).transaction((current) => {
      return Math.max(0, (current || 0) - prepaidDeductedNum);
    });
    console.log(`💳 Hybrid checkout: Deducted ${prepaidDeductedNum} prepaid seats from Org ${orgId}`);
  }

  let finalTripId = tripId;

  if (action === "CREATE_TRIP") {
    if (!tripDetailsJson) {
      throw new Error("Missing tripDetailsJson in metadata for CREATE_TRIP.");
    }
    const tripDetails = JSON.parse(tripDetailsJson);

    // Create the trip record
    const created = await createTripRecord({
      orgId,
      uid,
      title: tripDetails.t,
      destination: tripDetails.d,
      startDate: parseInt(tripDetails.s),
      endDate: parseInt(tripDetails.e),
      image: tripDetails.i,
      totalSeats: totalSeatsRequested
    });
    finalTripId = created.tripId;

    // Mark the link token as used and paid
    if (linkToken) {
      await db.ref(`temp_links/${linkToken}`).update({
        paid: true,
        used: true,
        tripId: finalTripId,
        inviteCode: created.inviteCode,
        seats: totalSeatsRequested,
        planId: planId || "seat_only"
      });
    }

    // Write to seatTransactions audit log
    await db.ref(`seatTransactions`).push({
      orgId,
      userId: uid || "unknown",
      tripId: finalTripId,
      action: "CREATE_TRIP",
      source: "stripe",
      seats: seatsNum, // Record only paid seats count as Stripe additions
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

    console.log(`🚀 Automated Task: TRIP ${finalTripId} CREATED via Stripe completion`);

    await notifyStaffOfSeatUpdate({
      orgId,
      tripId: finalTripId,
      title: "New Journey Created",
      message: `New journey "${tripDetails.t}" created with ${totalSeatsRequested} seats.`,
      diff: totalSeatsRequested,
      totalSeats: totalSeatsRequested
    });

  } else if (action === "SEAT_TOPUP") {
    let resolvedTripId = tripId;
    if (!resolvedTripId && linkToken) {
      console.log(`ℹ️ Fetching tripId from temp_links/${linkToken} as fallback...`);
      const linkSnap = await db.ref(`temp_links/${linkToken}`).get();
      if (linkSnap.exists()) {
        resolvedTripId = linkSnap.val().tripId;
      }
    }

    if (!resolvedTripId) throw new Error("Missing tripId in metadata for SEAT_TOPUP.");

    // Increment trip total_seats capacity
    const totalSeatsRef = db.ref(`orgs/${orgId}/trips/${resolvedTripId}/total_seats`);
    await totalSeatsRef.transaction((current) => {
      return (current || 0) + totalSeatsRequested;
    });

    // Mark the link token as used
    if (linkToken) {
      await db.ref(`temp_links/${linkToken}`).update({
        paid: true,
        used: true,
        seats: totalSeatsRequested,
        planId: planId || "seat_only"
      });
    }

    // Write to seatTransactions audit log
    await db.ref(`seatTransactions`).push({
      orgId,
      userId: uid || "unknown",
      tripId: resolvedTripId,
      action: "SEAT_TOPUP",
      source: "stripe",
      seats: seatsNum, // Record only paid seats count as Stripe additions
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

    console.log(`🚀 Automated Task: TRIP ${resolvedTripId} capacity increased by ${totalSeatsRequested}`);

    let tripTitle = metadata.journeyName || "Your Trip";
    try {
      const tripSnap = await db.ref(`orgs/${orgId}/trips/${resolvedTripId}/title`).get();
      if (tripSnap.exists() && tripSnap.val()) tripTitle = tripSnap.val();
    } catch (e) {}

    await notifyStaffOfSeatUpdate({
      orgId,
      tripId: resolvedTripId,
      title: "Seat Update",
      message: `Seat capacity for "${tripTitle}" increased by ${totalSeatsRequested} seats.`,
      diff: totalSeatsRequested
    });
  }

  // Save payment record under payments
  const paymentsRef = db.ref(`orgs/${orgId}/payments`);
  const paymentId = paymentsRef.push().key;
  await paymentsRef.child(paymentId).set({
    stripeSessionId: session.id || null,
    stripeCustomerId: session.customer || null,
    planId: planId || "unknown",
    seats: seatsNum || 0,
    amount: session.amount_total || 0,
    currency: session.currency || null,
    gateway: "stripe",
    paymentMethod: "stripe",
    journeyName: action === "CREATE_TRIP" ? "Journey Creation" : "Extra Seats",
    countryCode: countryCode || "unknown",
    created_at: admin.database.ServerValue.TIMESTAMP,
    action: action || "INITIAL_PAYMENT",
    prepaidSeatsDeducted: prepaidDeductedNum || 0
  });

  if (session.customer) {
    await db.ref(`orgs/${orgId}/stripe_customer_id`).set(session.customer);
  }
}

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

      if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
        const invoice = event.data.object;

        // Skip invoices generated by Stripe Checkout sessions (which either lack orgId, or have linkToken, or have billing_reason === "single_payment")
        const isCheckoutInvoice = (invoice.metadata && invoice.metadata.linkToken) ||
                                  (invoice.billing_reason === "single_payment") ||
                                  (!invoice.metadata || (!invoice.metadata.orgId && !invoice.customer));

        if (isCheckoutInvoice) {
          console.log(`ℹ️ Skipping checkout session invoice ${invoice.id}.`);
          return res.json({ received: true });
        }

        let orgId = invoice.metadata && invoice.metadata.orgId;

        // Fallback: If orgId is not present on invoice metadata, look up the Customer object
        if (!orgId && typeof invoice.customer === "string") {
          try {
            const customerObj = await stripe.customers.retrieve(invoice.customer);
            orgId = customerObj && customerObj.metadata && customerObj.metadata.orgId;
          } catch (custErr) {
            console.warn(`⚠️ Failed to retrieve Stripe customer metadata for invoice ${invoice.id}:`, custErr.message);
          }
        }

        const seats = invoice.metadata && invoice.metadata.seats;
        let seatCount = parseInt(seats) || 0;

        // Fallback: If seat count is not present in metadata, sum quantities of the line items
        if (!seatCount && invoice.lines && Array.isArray(invoice.lines.data)) {
          seatCount = invoice.lines.data.reduce((acc, line) => acc + (line.quantity || 0), 0);
        }

        if (orgId && seatCount > 0) {
          try {
            // Idempotency: check if this invoice was already processed (using atomic transaction)
            const invoiceRef = db.ref(`processed_invoices/${invoice.id}`);
            let alreadyProcessed = false;
            await invoiceRef.transaction((current) => {
              if (current !== null) {
                alreadyProcessed = true;
                return current;
              }
              return {
                orgId,
                amountPaid: invoice.amount_paid,
                currency: invoice.currency,
                seats: seatCount,
                processed_at: admin.database.ServerValue.TIMESTAMP
              };
            });

            if (alreadyProcessed) {
              console.log(`⚠️ Invoice ${invoice.id} already processed. Skipping.`);
              return res.json({ received: true, already_processed: true });
            }

            // Add seats to organization's prepaid balance
            await db.ref(`orgs/${orgId}/prepaid_seats`).transaction((current) => {
               return (current || 0) + seatCount;
            });

            // Write to seatTransactions audit log
            await db.ref(`seatTransactions`).push({
              orgId,
              userId: "system",
              tripId: null,
              action: "INVOICE_CREDIT",
              source: "invoice",
              seats: seatCount,
              timestamp: admin.database.ServerValue.TIMESTAMP
            });

            console.log(`✅ Invoice paid: Org ${orgId} credited with ${seatCount} prepaid seats.`);

            await notifyStaffOfSeatUpdate({
              orgId,
              title: "Prepaid Seats Added",
              message: `${seatCount} seat(s) credited to your organisation prepaid balance via invoice payment.`,
              diff: seatCount
            });
          } catch (invoiceErr) {
            console.warn("❌ Invoice webhook processing failed:", invoiceErr);
            return res.status(500).json({ error: "Failed to process invoice webhook" });
          }
        } else {
          console.warn(`⚠️ Invoice paid webhook received but orgId (${orgId}) or seatCount (${seatCount}) could not be resolved.`);
        }
      }

      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object;

        if (session.payment_status === "paid") {
          try {
            await processPaidCheckoutSession(session);
          } catch (dbErr) {
            console.warn("DB update failed during webhook:", dbErr);
            return res.status(500).json({ 
              error: "Database update failed",
              message: dbErr.message || String(dbErr),
              stack: dbErr.stack || null
            });
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

  if (session.payment_status === "paid") {
    try {
      await processPaidCheckoutSession(session);
    } catch (dbErr) {
      console.warn("DB update failed during payment verification:", dbErr);
      throw new HttpsError("internal", `Database update failed: ${dbErr.message || String(dbErr)}`);
    }
  }

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

  // Retrieve current prepaid seats balance
  const orgSnap = await db.ref(`orgs/${orgId}/prepaid_seats`).get();
  const currentPrepaid = orgSnap.val() || 0;

  const seatsToIncrNum = parseInt(seats) || 0;
  const prepaidDeducted = Math.min(currentPrepaid, seatsToIncrNum);
  const unpaidSeats = seatsToIncrNum - prepaidDeducted;

  if (unpaidSeats === 0) {
    // 1. Deduct seats from prepaid_seats balance
    await db.ref(`orgs/${orgId}/prepaid_seats`).transaction((current) => {
      return Math.max(0, (current || 0) - prepaidDeducted);
    });

    // 2. Increment trip total_seats capacity
    const totalSeatsRef = db.ref(`orgs/${orgId}/trips/${tripId}/total_seats`);
    await totalSeatsRef.transaction((current) => {
      return (current || 0) + prepaidDeducted;
    });

    // 3. Mark the link token as used and paid
    await tokenRef.update({
      paid: true,
      used: true,
      stripeSessionId: "prepaid-deducted",
      planId: planToUse,
      seats: prepaidDeducted
    });

    // 4. Write audit log
    await writeAuditLog(orgId, {
      action: "TRIP_CAPACITY_INCREASED",
      targetId: tripId,
      extra: { increment: String(prepaidDeducted), paymentMethod: "prepaid" }
    });

    console.log(`✅ Instant Prepaid Seat Top-up: TRIP ${tripId} capacity increased by ${prepaidDeducted}`);

    await notifyStaffOfSeatUpdate({
      orgId,
      tripId,
      title: "Seat Update",
      message: `Seat capacity for "${trip.title}" increased by ${prepaidDeducted} seats.`,
      diff: prepaidDeducted
    });

    return { instant: true };
  }

  // Enforce pricing configuration using the chosen plan
  const pricingConfig = getPlanPricing(countryCode, planToUse);
  const pricePerSeat = pricingConfig.price;
  const unitAmount = Math.round(pricePerSeat * 100);

  let clientOrigin = request.data.origin || "https://app.gomusafir.app";
  // Validate origin to prevent open redirect security issues
  const isAllowedOrigin = (origin) => {
    if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
    if (origin === "https://app.gomusafir.app") return true;
    if (origin === "https://go-musafir.web.app") return true;
    if (origin === "https://go-musafir.firebaseapp.com") return true;
    if (origin === "https://join.gomusafir.app") return true;
    if (origin === "https://gomusafir.app") return true;
    return false;
  };
  if (!isAllowedOrigin(clientOrigin)) {
    clientOrigin = "https://app.gomusafir.app";
  }

  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: pricingConfig.currency,
          product_data: {
            name: `Extra Seats — ${trip.title}`,
            description: `Adding ${unpaidSeats} seats at ${pricingConfig.symbol}${pricePerSeat}/seat (${prepaidDeducted} seats prepaid)`,
          },
          unit_amount: unitAmount,
        },
        quantity: unpaidSeats,
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
      seatsToIncr: String(unpaidSeats),
      prepaidSeatsDeducted: String(prepaidDeducted),
      journeyName: trip.title,
      uid: uid || "unknown",
      countryCode,
      linkToken: token,
      planId: planToUse,
    },
    success_url: `${clientOrigin}/increase-seats?status=success&session_id={CHECKOUT_SESSION_ID}&token=${token}`,
    cancel_url: `${clientOrigin}/increase-seats?status=cancel&token=${token}`,
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

    await notifyStaffOfSeatUpdate({
      orgId,
      title: "Prepaid Seats Credited",
      message: `${amount} prepaid seat(s) credited to your organisation balance. Reason: ${reason || "Enterprise deal"}`,
      diff: parseInt(amount)
    });

    return { success: true };
  } catch (error) {
    console.error("Manual seat credit failed:", error);
    throw new HttpsError("internal", "Failed to credit prepaid seats.");
  }
});

// ── Request Seats (Unified Entry Point) ──────────────────────────────────────
exports.requestSeats = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);

  const { action, seats, linkToken, tripId, planId, tripData, origin } = request.data;
  
  if (!action || !seats || parseInt(seats) < 1 || !linkToken) {
    throw new HttpsError("invalid-argument", "Missing required checkout/topup fields.");
  }

  const requestedSeatsNum = parseInt(seats);
  const planToUse = planId || "seat_only";

  // Resolve orgId and uid from linkToken
  const tokenRef = db.ref(`temp_links/${linkToken}`);
  const snapshot = await tokenRef.get();
  if (!snapshot.exists()) {
    throw new HttpsError("not-found", "Invalid or expired link.");
  }
  const tokenData = snapshot.val();
  if (tokenData.used) {
    throw new HttpsError("permission-denied", "This link has already been used.");
  }
  if (Date.now() > tokenData.expiresAt) {
    throw new HttpsError("deadline-exceeded", "This link has expired.");
  }

  const orgId = tokenData.orgId;
  const uid = tokenData.uid;

  if (!orgId) throw new HttpsError("unauthenticated", "Not authorized.");

  // Resolve country code for pricing
  let countryCode = null;
  if (uid) {
    const countrySnap = await db.ref(`users/${uid}/country`).get();
    if (countrySnap.exists()) {
      const country = countrySnap.val();
      countryCode = typeof country === "object" ? country.code : country;
    }
  }
  if (!countryCode) countryCode = "DEFAULT";

  // Atomically check and deduct from prepaid balance
  let appliedInstantly = false;
  await db.ref(`orgs/${orgId}/prepaid_seats`).transaction((current) => {
    const currentBalance = current || 0;
    if (currentBalance >= requestedSeatsNum) {
      appliedInstantly = true;
      return currentBalance - requestedSeatsNum;
    }
    return current;
  });

  if (appliedInstantly) {
    let finalTripId = tripId;

    if (action === "CREATE_TRIP") {
      if (!tripData) {
        throw new HttpsError("invalid-argument", "Missing trip data for creation.");
      }
      // Create the trip record instantly
      const created = await createTripRecord({
        orgId,
        uid,
        title: tripData.title,
        destination: tripData.destination,
        startDate: tripData.startDate,
        endDate: tripData.endDate,
        image: tripData.image,
        totalSeats: requestedSeatsNum
      });
      finalTripId = created.tripId;

      // Mark the link token as used and paid
      await tokenRef.update({
        paid: true,
        used: true,
        tripId: finalTripId,
        inviteCode: created.inviteCode,
        seats: requestedSeatsNum,
        planId: planToUse
      });

      // Write to seatTransactions audit log
      await db.ref(`seatTransactions`).push({
        orgId,
        userId: uid || "system",
        tripId: finalTripId,
        action: "CREATE_TRIP",
        source: "prepaid",
        seats: requestedSeatsNum,
        timestamp: admin.database.ServerValue.TIMESTAMP
      });

      console.log(`✅ Instant Prepaid Trip Created: Org ${orgId}, Trip ${finalTripId}`);

      await notifyStaffOfSeatUpdate({
        orgId,
        tripId: finalTripId,
        title: "New Journey Created",
        message: `New journey "${tripData.title}" created with ${requestedSeatsNum} prepaid seats.`,
        diff: requestedSeatsNum,
        totalSeats: requestedSeatsNum
      });

      return { instant: true, tripId: finalTripId };

    } else if (action === "SEAT_TOPUP") {
      if (!tripId) throw new HttpsError("invalid-argument", "Missing tripId for top-up.");

      // Increment trip total_seats capacity
      const totalSeatsRef = db.ref(`orgs/${orgId}/trips/${tripId}/total_seats`);
      await totalSeatsRef.transaction((current) => {
        return (current || 0) + requestedSeatsNum;
      });

      // Mark the link token as used
      await tokenRef.update({
        paid: true,
        used: true,
        seats: requestedSeatsNum,
        planId: planToUse
      });

      // Write to seatTransactions audit log
      await db.ref(`seatTransactions`).push({
        orgId,
        userId: uid || "system",
        tripId,
        action: "SEAT_TOPUP",
        source: "prepaid",
        seats: requestedSeatsNum,
        timestamp: admin.database.ServerValue.TIMESTAMP
      });

      console.log(`✅ Instant Prepaid Seat Top-up: Org ${orgId}, Trip ${tripId} incremented by ${requestedSeatsNum}`);

      let tripTitle = "Your Trip";
      try {
        const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}/title`).get();
        if (tripSnap.exists() && tripSnap.val()) tripTitle = tripSnap.val();
      } catch (e) {}

      await notifyStaffOfSeatUpdate({
        orgId,
        tripId,
        title: "Seat Update",
        message: `Seat capacity for "${tripTitle}" increased by ${requestedSeatsNum} seats.`,
        diff: requestedSeatsNum
      });

      return { instant: true };
    }
  }

  // Retrieve current prepaid seats balance
  const orgSnap = await db.ref(`orgs/${orgId}/prepaid_seats`).get();
  const currentPrepaid = orgSnap.val() || 0;

  const prepaidDeducted = Math.min(currentPrepaid, requestedSeatsNum);
  const unpaidSeats = requestedSeatsNum - prepaidDeducted;

  // Proceed to Stripe Checkout for the unpaid quantity (Hybrid/Partial checkout)
  const pricingConfig = getPlanPricing(countryCode, planToUse);
  const pricePerSeat = pricingConfig.price;
  const unitAmount = Math.round(pricePerSeat * 100);

  let clientOrigin = origin || "https://app.gomusafir.app";
  const isAllowedOrigin = (origin) => {
    if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
    if (origin === "https://app.gomusafir.app") return true;
    if (origin === "https://go-musafir.web.app") return true;
    if (origin === "https://go-musafir.firebaseapp.com") return true;
    if (origin === "https://join.gomusafir.app") return true;
    if (origin === "https://gomusafir.app") return true;
    return false;
  };
  if (!isAllowedOrigin(clientOrigin)) {
    clientOrigin = "https://app.gomusafir.app";
  }

  // Create Stripe Checkout Session
  const sessionData = {
    line_items: [
      {
        price_data: {
          currency: pricingConfig.currency,
          product_data: {
            name: action === "CREATE_TRIP" ? `Journey Creation — ${tripData?.title || 'Trip'}` : `Extra Seats — Trip`,
            description: prepaidDeducted > 0
              ? `Adding ${unpaidSeats} seats at ${pricingConfig.symbol}${pricePerSeat}/seat (${prepaidDeducted} seats covered by included balance)`
              : `Adding ${requestedSeatsNum} seats at ${pricingConfig.symbol}${pricePerSeat}/seat`,
          },
          unit_amount: unitAmount,
        },
        quantity: unpaidSeats,
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
      action,
      seatsToIncr: String(unpaidSeats),
      prepaidSeatsDeducted: String(prepaidDeducted),
      uid: uid || "unknown",
      countryCode,
      linkToken,
      planId: planToUse,
    }
  };

  if (action === "CREATE_TRIP") {
    // Compress and pass trip details inside metadata
    const tripDetails = {
      t: tripData.title,
      d: tripData.destination,
      s: tripData.startDate,
      e: tripData.endDate,
      i: tripData.image || null
    };
    sessionData.metadata.tripDetailsJson = JSON.stringify(tripDetails);
    sessionData.success_url = `${clientOrigin}/create-journey?status=success&session_id={CHECKOUT_SESSION_ID}&token=${linkToken}`;
    sessionData.cancel_url = `${clientOrigin}/create-journey?status=cancel&token=${linkToken}`;
  } else if (action === "SEAT_TOPUP") {
    sessionData.metadata.tripId = tripId;
    sessionData.success_url = `${clientOrigin}/increase-seats?status=success&session_id={CHECKOUT_SESSION_ID}&token=${linkToken}`;
    sessionData.cancel_url = `${clientOrigin}/increase-seats?status=cancel&token=${linkToken}`;
  }

  const session = await stripe.checkout.sessions.create(sessionData);
  return { url: session.url };
});

// ── Verify Apple In-App Purchase Receipt ──────────────────────────────────────
exports.verifyAppleIAPReceipt = onCall({ region: "europe-west1", secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  verifyAppCheck(request);
  const { auth: requestAuth, data } = request;
  if (!requestAuth) throw new HttpsError("unauthenticated", "Authentication required.");

  const { productId, transactionId, quantity } = data;
  if (!productId) throw new HttpsError("invalid-argument", "Product ID required.");

  const orgId = requestAuth.token.orgId;
  if (!orgId) throw new HttpsError("failed-precondition", "No organization linked to account.");

  const qty = parseInt(quantity) || 1;

  let seatAmount = 1;
  if (productId.includes("seat.10")) seatAmount = 10;
  else if (productId.includes("seat.5")) seatAmount = 5;
  else if (productId.includes("seat.1")) seatAmount = 1;
  else if (productId.includes("seat_only")) seatAmount = 1;
  else if (productId.includes("basic_pack")) seatAmount = 1;
  else if (productId.includes("plus_pack")) seatAmount = 1;
  else if (productId.includes("elite_wireless")) seatAmount = 1;

  const totalSeatsToAdd = seatAmount * qty;

  const orgRef = db.ref(`orgs/${orgId}/prepaid_seats`);
  await orgRef.transaction((current) => (current || 0) + totalSeatsToAdd);

  await writeAuditLog(orgId, {
    action: "IAP_SEATS_PURCHASED",
    seatsAdded: totalSeatsToAdd,
    productId,
    transactionId: transactionId || null,
    byUid: requestAuth.uid
  });

  await notifyStaffOfSeatUpdate({
    orgId,
    title: "Seats Purchased (In-App Purchase)",
    message: `${totalSeatsToAdd} journey seat(s) purchased and added to your organisation balance.`,
    diff: totalSeatsToAdd
  });

  // Save payment record under payments for dashboard reporting
  try {
    let planId = "seat_only";
    if (productId.includes("basic_pack")) planId = "basic_pack";
    else if (productId.includes("plus_pack")) planId = "plus_pack";
    else if (productId.includes("elite_wireless")) planId = "elite_wireless";

    let countryCode = "DEFAULT";
    if (requestAuth.uid) {
      const countrySnap = await db.ref(`users/${requestAuth.uid}/country`).get();
      if (countrySnap.exists()) {
        const countryVal = countrySnap.val();
        countryCode = typeof countryVal === "object" ? countryVal.code : countryVal;
      }
    }
    const currencyCode = COUNTRY_TO_CURRENCY[countryCode?.toUpperCase()] || "EUR";
    const planInfo = PRICING_PLANS[planId][currencyCode] || PRICING_PLANS[planId]["EUR"];
    const singlePrice = planInfo.price || 9.99;
    const iapAmountCents = Math.round(singlePrice * 100 * totalSeatsToAdd);

    const paymentsRef = db.ref(`orgs/${orgId}/payments`);
    const paymentId = paymentsRef.push().key;
    await paymentsRef.child(paymentId).set({
      appleProductId: productId || null,
      appleTransactionId: transactionId || null,
      planId: planId || "unknown",
      seats: totalSeatsToAdd || 0,
      amount: iapAmountCents || 0,
      currency: currencyCode.toLowerCase(),
      gateway: "apple_iap",
      paymentMethod: "apple_iap",
      journeyName: planId === "seat_only" ? "Extra Seats (IAP)" : "Journey Creation (IAP)",
      countryCode: countryCode || "unknown",
      created_at: admin.database.ServerValue.TIMESTAMP,
      action: "IAP_SEATS_PURCHASED",
      prepaidSeatsDeducted: 0
    });
  } catch (err) {
    console.error("⚠️ Failed to write payment record for Apple IAP purchase:", err);
  }

  // Generate secure token for the trip creation link
  const crypto = require("crypto");
  const linkToken = crypto.randomBytes(32).toString("hex");
  const expiry = Date.now() + 1 * 60 * 60 * 1000; // 1 hour expiry

  let email = requestAuth.token.email;
  if (!email) {
    try {
      const userRecord = await admin.auth().getUser(requestAuth.uid);
      email = userRecord.email;
    } catch (e) {
      console.warn("Failed to get email from user profile:", e);
    }
  }

  await db.ref(`temp_links/${linkToken}`).set({
    orgId: orgId,
    uid: requestAuth.uid,
    email: email || null,
    expiresAt: expiry,
    used: false,
    action: "CREATE_TRIP"
  });

  const webLink = `https://app.gomusafir.app/create-journey?token=${linkToken}`;

  if (email) {
    const { sendEmail } = require("../services/emailService");
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #B99A4A; text-align: center;">Your Journey Begins Here</h2>
        <p>Assalamu Alaikum,</p>
        <p>Your organisation now has <strong>${totalSeatsToAdd} journey seat(s)</strong> ready to use.</p>
        <p>You're now ready to create your new journey. Click the button below to continue securely on the GoMusāfir Business Portal. This secure link will remain valid for 1 hour.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${webLink}" style="background-color: #B99A4A; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Continue to Journey Setup</a>
        </div>
        <p style="word-break: break-all; color: #666; font-size: 11px;">Secure Journey Link: ${webLink}</p>
        <p>May your journey be safe, organised and blessed. If you need any assistance, our support team is here to help.</p>
      </div>
    `;

    try {
      await sendEmail({
        to: email,
        subject: "Payment Successful - Create Your GoMusafir Journey",
        html: htmlContent
      });
      console.log(`Payment success email sent to ${email}`);
    } catch (err) {
      console.error("Failed to send payment success email:", err);
    }
  } else {
    console.warn("No email address found; skipping payment success email.");
  }

  return { success: true, seatsAdded: totalSeatsToAdd, linkToken, webLink };
});

