/**
 * Masks a phone number for bulk/list displays to prevent bulk scraping
 * while preserving readability and formatting.
 *
 * Requirements:
 * - 10-digit Indian numbers: "9876543213" -> "98XXX XXX13"
 * - Handles "+91", "91", "0" prefixes cleanly: "+91 98XXX XXX13"
 * - Preserves international country codes: "+1 20XXX XXX99", "+44 79XXX XXX56", "+971 50XXX XXX67"
 * - Safe fallback for short, malformed, or empty values (never exposes full number)
 * - Safe if already masked
 */
export function maskPhoneNumber(rawPhone: string | null | undefined): string {
  if (rawPhone == null) return '';
  const trimmed = String(rawPhone).trim();
  if (!trimmed) return '';

  // If already masked with X or *, preserve/standardize to uppercase 'X'
  if (/[xX*]/.test(trimmed)) {
    return trimmed.replace(/\*/g, 'X');
  }

  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length === 0) {
    return trimmed;
  }

  // Short strings (1-3 digits) - conservative fallback: mask completely
  if (digitsOnly.length <= 3) {
    return 'X'.repeat(digitsOnly.length);
  }

  // 4 digits: first 1 + XX + last 1
  if (digitsOnly.length === 4) {
    return `${digitsOnly[0]}XX${digitsOnly[3]}`;
  }

  // 5 digits: first 1 + XXX + last 1
  if (digitsOnly.length === 5) {
    return `${digitsOnly[0]}XXX${digitsOnly[4]}`;
  }

  // Detect country code / prefixes
  let prefix = '';
  let nationalNumber = digitsOnly;

  if (hasPlus) {
    const formattedMatch = trimmed.match(/^\+(\d{1,4})[\s\-.]+(.+)$/);
    if (formattedMatch) {
      prefix = `+${formattedMatch[1]} `;
      nationalNumber = formattedMatch[2].replace(/\D/g, '');
    } else {
      const d = digitsOnly;
      if (/^(971|966|965|968|973|974|880|977|960|975)\d+/.test(d)) {
        prefix = `+${d.slice(0, 3)} `;
        nationalNumber = d.slice(3);
      } else if (/^(91|44|61|65|81|82|86|49|33|39|34|92|94|98|20|27)\d+/.test(d)) {
        prefix = `+${d.slice(0, 2)} `;
        nationalNumber = d.slice(2);
      } else if (/^1\d{10}$/.test(d)) {
        prefix = '+1 ';
        nationalNumber = d.slice(1);
      } else if (d.length > 10) {
        const ccLen = d.length - 10;
        prefix = `+${d.slice(0, ccLen)} `;
        nationalNumber = d.slice(ccLen);
      } else {
        prefix = '+';
      }
    }
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    prefix = '+91 ';
    nationalNumber = digitsOnly.slice(2);
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    prefix = '0 ';
    nationalNumber = digitsOnly.slice(1);
  }

  // Standard 10 digits: "98XXX XXX13"
  if (nationalNumber.length === 10) {
    const first2 = nationalNumber.slice(0, 2);
    const last2 = nationalNumber.slice(8);
    return `${prefix}${first2}XXX XXX${last2}`;
  }

  if (nationalNumber.length >= 6) {
    const first2 = nationalNumber.slice(0, 2);
    const last2 = nationalNumber.slice(-2);
    const middleCount = nationalNumber.length - 4;
    let middleMask: string;
    if (middleCount >= 6) {
      const half = Math.floor(middleCount / 2);
      middleMask = `${'X'.repeat(half)} ${'X'.repeat(middleCount - half)}`;
    } else {
      middleMask = 'X'.repeat(middleCount);
    }
    return `${prefix}${first2}${middleMask}${last2}`;
  }

  return `${prefix}${nationalNumber[0]}${'X'.repeat(nationalNumber.length - 2)}${nationalNumber.slice(-1)}`;
}
