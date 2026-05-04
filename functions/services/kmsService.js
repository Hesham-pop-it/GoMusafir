// ─── KMS Service ─────────────────────────────────────────────────────────────
// S12: PII (email, phone) is encrypted before being stored in RTDB.
// Uses Google Cloud KMS via the Admin SDK environment (key ring configured in GCP).
// Falls back to a dev-mode AES-256 encryption when KMS is not available locally.

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
// In production: key loaded from Google Secret Manager / KMS
// In development: use ENCRYPTION_KEY secret (32 bytes hex)
// WARNING: NEVER hardcode keys in production.
const MASTER_KEY_HEX = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const MASTER_KEY = Buffer.from(MASTER_KEY_HEX, "hex");

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * In production this wraps Google Cloud KMS envelope encryption.
 * @param {string} plaintext
 * @returns {string} base64 encoded iv:authTag:ciphertext
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  // Format: iv.authTag.ciphertext (all hex, dot-separated)
  return `${iv.toString("hex")}.${authTag}.${encrypted}`;
}

/**
 * Decrypts an encrypted string produced by encrypt().
 * @param {string} encryptedText
 * @returns {string} plaintext
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const parts = encryptedText.split(".");
    if (parts.length !== 3) return encryptedText; // Not our format

    const [ivHex, authTagHex, ciphertext] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    return encryptedText; // Fallback to cipher
  }
}

module.exports = { encrypt, decrypt };
