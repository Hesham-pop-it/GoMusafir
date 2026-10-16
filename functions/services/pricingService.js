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

module.exports = { PRICING_PLANS, COUNTRY_TO_CURRENCY, getPlanPricing };
