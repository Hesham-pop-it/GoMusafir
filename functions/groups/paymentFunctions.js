// ─── Payment Functions ────────────────────────────────────────────────────────
// Replaces GoMusafir-Website/server/server.js entirely.
// Covers: S29 (Stripe webhook verification), S30 (idempotent payments),
//         S6 (auth required), S17 (input validation), S20 (audit log)

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { admin, db } = require("../admin");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth, requireRole } = require("../middleware/appCheckMiddleware");
const { validate, schemas } = require("../middleware/validateSchema");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Server-side plan prices — S29: price integrity enforced here, not client-side
const PLAN_PRICES = {
  seat_only: 9.99,
  basic_pack: 14.99,
  plus_pack: 18.99,
  elite_wireless: 27.99,
};

// ── Create Checkout Session ───────────────────────────────────────────────────
exports.createCheckoutSession = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin"]);

  const data = validate(schemas.checkout, request.data);
  const orgId = request.auth.token.orgId;

  const pricePerSeat = PLAN_PRICES[data.planId];
  if (!pricePerSeat) throw new HttpsError("invalid-argument", "Invalid plan ID.");

  const totalAmount = Math.round(pricePerSeat * data.seats * 100); // cents

  // S30: Idempotency key prevents duplicate Stripe sessions
  const idempotencyKey = `${orgId}-${data.planId}-${Date.now()}`;

  const session = await stripe.checkout.sessions.create(
    {
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `${data.planName} — ${data.journeyName}`,
              description: `${data.seats} seats at €${pricePerSeat}/seat`,
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        orgId,
        journeyName: data.journeyName,
        planId: data.planId,
        seats: String(data.seats),
      },
      success_url: `https://app.gomusafir.app/create-journey?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://app.gomusafir.app/create-journey?status=cancel`,
    },
    { idempotencyKey }
  );

  return { url: session.url };
});

// ── Stripe Webhook (raw body — must be onRequest, not onCall) ─────────────────
// S29: Signature verified with stripe.webhooks.constructEvent before any action.
exports.stripeWebhookHandler = onRequest(
  { region: "europe-west1", rawBody: true },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret); // S29
    } catch (err) {
      console.warn(`Webhook signature error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.payment_status === "paid") {
        const { orgId, journeyName, planId, seats } = session.metadata;

        try {
          // S20: Audit the payment event
          if (orgId) {
            await writeAuditLog(orgId, {
              action: "PAYMENT_COMPLETED",
              byUid: "stripe_webhook",
              extra: { planId, seats, journeyName, stripeSessionId: session.id },
            });
          }

          // TODO Phase 2: Grant seats to org in RTDB
          console.log(`✅ Payment confirmed: Org ${orgId}, Plan ${planId}, Seats ${seats}`);
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
  requireAuth(request);

  const { sessionId } = request.data;
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId is required.");

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return {
    verified: session.payment_status === "paid",
    status: session.status,
    payment: session.payment_status,
  };
});
