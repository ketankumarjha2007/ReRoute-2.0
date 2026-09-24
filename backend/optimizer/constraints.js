/**
 * Constraints helper module
 * Handles time conversions, opening hours checks, and money arithmetic safely.
 */

function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

function minutesToTime(mins) {
  const m = Math.max(0, Math.floor(mins));
  const hours = Math.floor(m / 60) % 24;
  const minutes = m % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Decimal-safe money parser (in integer cents)
function moneyToCents(amount) {
  if (amount === null || amount === undefined) return 0;
  if (typeof amount === 'number') {
    return Math.round(amount * 100);
  }
  const clean = String(amount).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

function centsToMoney(cents, currency = 'INR') {
  const val = (cents / 100).toFixed(2);
  return val;
}

// Decimal-safe addition of two money values
function addMoney(a, b) {
  return centsToMoney(moneyToCents(a) + moneyToCents(b));
}

// Check if POI can be visited given arrival time and duration
function checkOpeningHours(arrivalMins, durationMins, opensAtStr, closesAtStr) {
  if (!opensAtStr || !closesAtStr) {
    return {
      valid: true,
      actualStartMins: arrivalMins,
      actualEndMins: arrivalMins + durationMins,
      waitTime: 0
    };
  }

  const openMins = timeToMinutes(opensAtStr);
  const closeMins = timeToMinutes(closesAtStr);

  const actualStart = Math.max(arrivalMins, openMins);
  const waitTime = Math.max(0, openMins - arrivalMins);
  const actualEnd = actualStart + durationMins;

  if (actualEnd > closeMins) {
    return {
      valid: false,
      actualStartMins: actualStart,
      actualEndMins: actualEnd,
      waitTime,
      reason: `Visit ends at ${minutesToTime(actualEnd)} after closing time ${closesAtStr}`
    };
  }

  return {
    valid: true,
    actualStartMins: actualStart,
    actualEndMins: actualEnd,
    waitTime
  };
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  moneyToCents,
  centsToMoney,
  addMoney,
  checkOpeningHours
};
