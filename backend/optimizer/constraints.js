/**
 * Constraints helper module
 * Handles time conversions, opening hours checks, closed days, and decimal-safe money arithmetic.
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

// Decimal-safe integer cents parser without floating-point inaccuracies
function moneyToCents(amount) {
  if (amount === null || amount === undefined) return 0;
  if (typeof amount === 'number') {
    return Math.round(amount * 100);
  }
  const clean = String(amount).trim().replace(/[^0-9.-]/g, '');
  if (!clean) return 0;

  const isNeg = clean.startsWith('-');
  const unsigned = isNeg ? clean.slice(1) : clean;
  const parts = unsigned.split('.');
  const whole = parseInt(parts[0] || '0', 10);
  const fraction = (parts[1] || '').padEnd(2, '0').slice(0, 2);
  const fracVal = parseInt(fraction, 10) || 0;

  const totalCents = (whole * 100) + fracVal;
  return isNeg ? -totalCents : totalCents;
}

function centsToMoney(cents, currency = 'INR') {
  const val = (cents / 100).toFixed(2);
  return val;
}

// Decimal-safe addition of two money values
function addMoney(a, b) {
  return centsToMoney(moneyToCents(a) + moneyToCents(b));
}

// Check if POI is closed on the travel date/day of week
function isPoiClosedOnDay(closedDaysStr, dateOrDay) {
  if (!closedDaysStr || dateOrDay === undefined || dateOrDay === null) {
    return false;
  }
  const closedDays = String(closedDaysStr).split(',').map(s => s.trim());
  let dayIndex = null;

  if (typeof dateOrDay === 'number') {
    dayIndex = String(dateOrDay);
  } else if (typeof dateOrDay === 'string') {
    if (dateOrDay.includes('-')) {
      const parsed = new Date(dateOrDay);
      if (!isNaN(parsed.getTime())) {
        dayIndex = String(parsed.getDay());
      }
    } else {
      dayIndex = dateOrDay.trim();
    }
  }

  return dayIndex !== null && closedDays.includes(dayIndex);
}

// Check if POI can be visited given arrival time and duration
function checkOpeningHours(arrivalMins, durationMins, opensAtStr, closesAtStr) {
  if (!opensAtStr && !closesAtStr) {
    return {
      valid: true,
      actualStartMins: arrivalMins,
      actualEndMins: arrivalMins + durationMins,
      waitTime: 0
    };
  }

  const openMins = opensAtStr ? timeToMinutes(opensAtStr) : 0;
  const closeMins = closesAtStr ? timeToMinutes(closesAtStr) : (24 * 60);

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
  isPoiClosedOnDay,
  checkOpeningHours
};
