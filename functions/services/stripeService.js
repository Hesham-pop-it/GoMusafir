// ─── Stripe Helper Service ───────────────────────────────────────────────────
// Manages safe interaction with Stripe SDK (Customer creation, deletion, lookup)

let stripeInstance = null;

function getStripeInstance() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.warn("⚠️ STRIPE_SECRET_KEY is not set.");
      return null;
    }
    const Stripe = require("stripe");
    stripeInstance = Stripe(key);
  }
  return stripeInstance;
}

const COUNTRY_TO_CURRENCY_MAP = {
  US: "usd", SA: "sar", AE: "aed", GB: "gbp", IN: "inr", ID: "idr", PK: "pkr", AF: "usd",
  NL: "eur", DE: "eur", FR: "eur", BE: "eur", ES: "eur", IT: "eur", AT: "eur", SE: "eur",
  NO: "eur", DK: "eur", FI: "eur", IE: "eur", PT: "eur", PL: "eur", CZ: "eur", GR: "eur",
  HU: "eur", RO: "eur", BG: "eur", HR: "eur", CH: "eur",
};

const COUNTRY_TO_TIMEZONE_MAP = {
  NL: "Europe/Amsterdam", PK: "Asia/Karachi", SA: "Asia/Riyadh", AE: "Asia/Dubai",
  GB: "Europe/London", DE: "Europe/Berlin", FR: "Europe/Paris", BE: "Europe/Brussels",
  ES: "Europe/Madrid", IT: "Europe/Rome", US: "America/New_York", CA: "America/Toronto",
  AU: "Australia/Sydney", IN: "Asia/Kolkata", ID: "Asia/Jakarta", TR: "Europe/Istanbul",
  EG: "Africa/Cairo", MA: "Africa/Casablanca", QA: "Asia/Qatar", KW: "Asia/Kuwait",
  BH: "Asia/Bahrain", OM: "Asia/Muscat", JO: "Asia/Amman", LB: "Asia/Beirut",
  IQ: "Asia/Baghdad", AF: "Asia/Kabul", MY: "Asia/Kuala_Lumpur", SG: "Asia/Singapore",
  TH: "Asia/Bangkok", BD: "Asia/Dhaka", AT: "Europe/Vienna", CH: "Europe/Zurich",
  IE: "Europe/Dublin", PT: "Europe/Lisbon", PL: "Europe/Warsaw", CZ: "Europe/Prague",
  GR: "Europe/Athens", HU: "Europe/Budapest", RO: "Europe/Bucharest", BG: "Europe/Sofia",
  HR: "Europe/Zagreb", SE: "Europe/Stockholm", NO: "Europe/Oslo", DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki", AR: "America/Argentina/Buenos_Aires", BR: "America/Sao_Paulo", MX: "America/Mexico_City",
};

const COUNTRY_NAME_TO_CODE = {
  "NETHERLANDS": "NL", "HOLLAND": "NL", "SAUDI ARABIA": "SA", "UNITED ARAB EMIRATES": "AE",
  "UAE": "AE", "UNITED KINGDOM": "GB", "UK": "GB", "GREAT BRITAIN": "GB", "UNITED STATES": "US",
  "USA": "US", "UNITED STATES OF AMERICA": "US", "PAKISTAN": "PK", "INDIA": "IN", "INDONESIA": "ID",
  "GERMANY": "DE", "FRANCE": "FR", "BELGIUM": "BE", "SPAIN": "ES", "ITALY": "IT", "TURKEY": "TR",
  "TÜRKIYE": "TR", "TURKIYE": "TR", "EGYPT": "EG", "MOROCCO": "MA", "QATAR": "QA", "KUWAIT": "KW",
  "BAHRAIN": "BH", "OMAN": "OM", "JORDAN": "JO", "LEBANON": "LB", "IRAQ": "IQ", "AFGHANISTAN": "AF",
  "MALAYSIA": "MY", "SINGAPORE": "SG", "THAILAND": "TH", "BANGLADESH": "BD", "AUSTRIA": "AT",
  "SWITZERLAND": "CH", "IRELAND": "IE", "PORTUGAL": "PT", "POLAND": "PL", "CZECH REPUBLIC": "CZ",
  "CZECHIA": "CZ", "GREECE": "GR", "HUNGARY": "HU", "ROMANIA": "RO", "BULGARIA": "BG", "CROATIA": "HR",
  "SWEDEN": "SE", "NORWAY": "NO", "DENMARK": "DK", "FINLAND": "FI", "ARGENTINA": "AR", "BRAZIL": "BR",
  "MEXICO": "MX", "CANADA": "CA", "AUSTRALIA": "AU",
};

function resolveCountryCode(countryInput) {
  if (!countryInput) return "NL";

  let rawStr = "";
  if (typeof countryInput === "object") {
    rawStr = countryInput.code || countryInput.name || countryInput.country || "";
  } else if (typeof countryInput === "string") {
    rawStr = countryInput;
  }

  rawStr = rawStr.trim().toUpperCase();
  if (!rawStr) return "NL";

  // If already a valid 2-letter ISO code
  if (rawStr.length === 2 && /^[A-Z]{2}$/.test(rawStr)) {
    return rawStr;
  }

  // Lookup by name or alias
  if (COUNTRY_NAME_TO_CODE[rawStr]) {
    return COUNTRY_NAME_TO_CODE[rawStr];
  }

  return "NL";
}

/**
 * Safely create a customer in Stripe with company, phone, country, currency, and timezone details.
 * @param {object} params
 * @param {string} params.orgId
 * @param {string} params.companyName
 * @param {string} params.email
 * @param {string} [params.firstName]
 * @param {string} [params.lastName]
 * @param {string} [params.phoneCode]
 * @param {string} [params.phoneNumber]
 * @param {object|string} [params.country]
 * @returns {Promise<string|null>} Stripe customer ID if created, else null
 */
async function createStripeCustomer(params) {
  const stripe = getStripeInstance();
  if (!stripe) return null;

  const { orgId, companyName, email, firstName, lastName, phoneCode, phoneNumber, country } = params;

  const countryCode = resolveCountryCode(country);
  const fullPhone = `${phoneCode || ""}${phoneNumber || ""}`.trim();
  const individualName = `${firstName || ""} ${lastName || ""}`.trim();
  const businessName = companyName || individualName || "GoMusafir Customer";

  const currencyCode = (COUNTRY_TO_CURRENCY_MAP[countryCode] || "EUR").toUpperCase();
  const timezone = COUNTRY_TO_TIMEZONE_MAP[countryCode] || "Europe/Amsterdam";

  const metadata = {
    orgId: orgId || "",
    businessName: businessName,
    individualName: individualName || "",
    phone: fullPhone || "",
    country: countryCode,
    currency: currencyCode,
    timezone: timezone,
  };

  // Primary attempt with complete details (name, email, phone, address country, metadata)
  try {
    const customerData = {
      email: email,
      name: businessName,
      metadata: metadata,
    };

    if (fullPhone) {
      customerData.phone = fullPhone;
    }
    if (countryCode && countryCode.length === 2) {
      customerData.address = { country: countryCode };
    }
    if (businessName) {
      customerData.description = `${businessName}${individualName ? ` (${individualName})` : ""}`;
    }

    const customer = await stripe.customers.create(customerData);
    console.log(`✅ Stripe Customer created: ${customer.id} (${businessName}, ${countryCode})`);
    return customer.id;
  } catch (primaryErr) {
    console.warn("⚠️ Full Stripe customer creation failed, retrying basic creation:", primaryErr.message);

    // Reliable fallback (guarantees customer is created even if address/phone is rejected by Stripe)
    try {
      const basicCustomer = await stripe.customers.create({
        email: email,
        name: businessName,
        metadata: metadata,
      });
      console.log(`✅ Stripe Customer created (fallback): ${basicCustomer.id}`);
      return basicCustomer.id;
    } catch (fallbackErr) {
      console.error("❌ Both Stripe customer creation attempts failed:", fallbackErr.message);
      return null;
    }
  }
}

/**
 * Safely delete a customer from Stripe by Customer ID, Email, or Org ID.
 * @param {string|null} stripeCustomerId - The Stripe customer ID (e.g. cus_...)
 * @param {string|null} email - Fallback email to search Stripe if ID is missing
 * @param {string|null} orgId - Fallback Org ID to search Stripe metadata
 */
async function deleteStripeCustomer(stripeCustomerId, email, orgId) {
  const stripe = getStripeInstance();
  if (!stripe) return;

  try {
    const customerIdsToDelete = new Set();

    if (stripeCustomerId) {
      customerIdsToDelete.add(stripeCustomerId);
    }

    // 1. Search by orgId in Stripe customer metadata
    if (orgId) {
      try {
        const searchResult = await stripe.customers.search({
          query: `metadata['orgId']:'${orgId}'`,
          limit: 10,
        });
        if (searchResult.data && searchResult.data.length > 0) {
          searchResult.data.forEach((c) => customerIdsToDelete.add(c.id));
        }
      } catch (searchErr) {
        console.warn(`⚠️ Search Stripe by orgId failed: ${searchErr.message}`);
      }
    }

    // 2. Search by email
    if (email) {
      try {
        const customers = await stripe.customers.list({ email: email.toLowerCase(), limit: 10 });
        if (customers.data && customers.data.length > 0) {
          customers.data.forEach((c) => customerIdsToDelete.add(c.id));
        }
      } catch (listErr) {
        console.warn(`⚠️ Search Stripe by email failed: ${listErr.message}`);
      }
    }

    if (customerIdsToDelete.size > 0) {
      for (const cusId of customerIdsToDelete) {
        try {
          await stripe.customers.del(cusId);
          console.log(`✅ Stripe Customer ${cusId} deleted successfully.`);
        } catch (delErr) {
          console.warn(`⚠️ Could not delete Stripe customer ${cusId}:`, delErr.message);
        }
      }
    } else {
      console.log(`ℹ️ No Stripe Customer found to delete (orgId: ${orgId}, email: ${email})`);
    }
  } catch (err) {
    console.warn(`⚠️ Failed during deleteStripeCustomer (${stripeCustomerId || email || orgId}):`, err.message);
  }
}

module.exports = {
  createStripeCustomer,
  deleteStripeCustomer,
};
