/**
 * Currency Minor Unit Exponent Table and Conversions (Safety Invariant 6)
 * Never compares floating-point numbers.
 * Zero-decimal currencies (such as JPY) use exponent 0.
 */

export const CURRENCY_EXPONENTS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  CHF: 2,
  HKD: 2,
  SGD: 2,
  SEK: 2,
  DKK: 2,
  PLN: 2,
  NOK: 2,
  CZK: 2,
  HUF: 2,
  ILS: 2,
  MXN: 2,
  BRL: 2,
  MYR: 2,
  PHP: 2,
  TWD: 2,
  THB: 2,

  // Zero-decimal currencies
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  BIF: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  KMF: 0,
  VUV: 0,

  // 3-decimal currencies
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

export function getCurrencyExponent(currencyCode: string): number {
  const code = currencyCode.toUpperCase();
  if (code in CURRENCY_EXPONENTS) {
    return CURRENCY_EXPONENTS[code];
  }
  // Default ISO standard exponent
  return 2;
}

/**
 * Converts a currency amount (string or number, e.g. "50.00" or 50) to integer minor units.
 * Never uses floating-point arithmetic for comparisons.
 */
export function toMinorUnits(amount: string | number, currencyCode: string): number {
  const exponent = getCurrencyExponent(currencyCode);
  const str = String(amount).trim();

  if (!str || isNaN(Number(str))) {
    throw new Error(`Invalid monetary amount: '${amount}'`);
  }

  const parts = str.split(".");
  const wholePart = parts[0] || "0";
  let fracPart = parts[1] || "";

  if (exponent === 0) {
    return parseInt(wholePart, 10);
  }

  // Pad or slice fraction to exact exponent length
  if (fracPart.length < exponent) {
    fracPart = fracPart.padEnd(exponent, "0");
  } else if (fracPart.length > exponent) {
    fracPart = fracPart.slice(0, exponent);
  }

  const sign = wholePart.startsWith("-") ? -1 : 1;
  const absWhole = wholePart.replace("-", "");
  const combined = absWhole + fracPart;

  return sign * parseInt(combined, 10);
}

/**
 * Formats minor units back to a human-readable decimal string.
 */
export function fromMinorUnits(minorUnits: number, currencyCode: string): string {
  const exponent = getCurrencyExponent(currencyCode);
  if (exponent === 0) {
    return String(minorUnits);
  }

  const isNeg = minorUnits < 0;
  const abs = Math.abs(minorUnits);
  const factor = Math.pow(10, exponent);
  const whole = Math.floor(abs / factor);
  const frac = String(abs % factor).padStart(exponent, "0");

  return `${isNeg ? "-" : ""}${whole}.${frac}`;
}
