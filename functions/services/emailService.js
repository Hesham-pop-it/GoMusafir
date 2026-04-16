const nodemailer = require("nodemailer");

// Initialize NodeMailer via environment credentials
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Sends a templated email.
 * @param {Object} options - { to, subject, html }
 */
async function sendEmail({ to, subject, html }) {
  const mailOptions = {
    from: `"${process.env.SMTP_FROM_EMAIL || 'GoMusafir'}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.warn("Nodemailer Error: ", err);
    throw new Error("Failed to send email: " + err.message);
  }
}

module.exports = { sendEmail };
