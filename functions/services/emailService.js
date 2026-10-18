const sgMail = require("@sendgrid/mail");
const { defineSecret } = require("firebase-functions/params");

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

let _sendgridConfiguredForKey = null;

function initSendGrid() {
  const key = SENDGRID_API_KEY.value().trim();
  if (!key.startsWith("SG.")) {
    throw new Error('SENDGRID_API_KEY does not start with "SG."');
  }

  // Avoid re-setting the API key repeatedly within the same warm container.
  if (_sendgridConfiguredForKey !== key) {
    sgMail.setApiKey(key);
    _sendgridConfiguredForKey = key;
  }
}

const DEFAULT_TEMPLATE_ID = "d-eff261607ce94c2ab816abce9c740ef2";
const FROM_EMAIL = "noreply@join.gomusafir.app";

/**
 * Sends a dynamic template email via SendGrid.
 * @param {Object} options - { to, subject, html, templateId }
 */
async function sendEmail({ to, subject, html, templateId = DEFAULT_TEMPLATE_ID, customArgs }) {
  // Emulator only: the mail is parked in the server-only dev_outbox and SendGrid is never reached. The outbox needs
  // the database emulator too, so an emulator pointed at the real database can neither fill it nor send real mail.
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error("Mail is not sent from the emulator without the database emulator.");
    const { db } = require("../admin");
    const ref = db.ref("dev_outbox").push();
    await ref.set({
      to, subject, html, template: templateId, created_at: Date.now(),
      ...(customArgs ? { custom_args: customArgs } : {}),
    });
    return { devOutboxId: ref.key };
  }
  initSendGrid();
  const msg = {
    to,
    from: {
      email: FROM_EMAIL,
      name: "GoMusāfir"
    },
    templateId: templateId,
    dynamicTemplateData: {
      subject: subject,
      html: html,
    },
    // Echoed back by the SendGrid Event Webhook, which is how a bounce finds its invitation.
    ...(customArgs ? { customArgs } : {}),
  };

  try {
    const result = await sgMail.send(msg);
    return result;
  } catch (err) {
    console.warn("SendGrid Error: ", err);
    if (err.response && err.response.body) {
      console.error("SendGrid Response Body:", JSON.stringify(err.response.body, null, 2));
    }
    throw new Error("Failed to send email via SendGrid: " + err.message);
  }
}

module.exports = { sendEmail };
