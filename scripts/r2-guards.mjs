// The card library's upload guards (the most an upload may take the month's
// writes and the bucket's storage to, and the day the R2 month starts) depend
// on the Cloudflare account, so each deployment sets its own in the R2_GUARDS
// Actions secret:
//
//   {"writeLimit": <writes a month>, "storageLimit": <bytes>, "billingDay": <1-28>}
//
// Anything missing or out of range is refused, so a broken setting stops
// uploads instead of lifting the guards.
//
//   R2_GUARDS='…' node scripts/r2-guards.mjs   prints WRITE_LIMIT=… lines for the shell

// Cloudflare's included usage per account. A guard may never be set above it.
export const LIMITS = {workerRequestsPerDay: 100_000, r2Bytes: 10e9, r2ClassAPerMonth: 1_000_000, r2ClassBPerMonth: 10_000_000};

const whole = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

export function parseGuards(text) {
  let guards;
  try { guards = JSON.parse(String(text ?? '')); } catch { guards = null; }
  const {writeLimit, storageLimit, billingDay} = guards && typeof guards === 'object' ? guards : {};
  // The message never repeats the value, which is masked only as a whole.
  if (!whole(writeLimit, 1, LIMITS.r2ClassAPerMonth)) throw Error('R2_GUARDS: writeLimit must be a whole number from 1 to the included monthly writes.');
  if (!whole(storageLimit, 1, LIMITS.r2Bytes)) throw Error('R2_GUARDS: storageLimit must be a whole number of bytes from 1 to the included storage.');
  // Days 29 to 31 don't exist in every month.
  if (!whole(billingDay, 1, 28)) throw Error('R2_GUARDS: billingDay must be a whole number from 1 to 28.');
  return {writeLimit, storageLimit, billingDay};
}

// The R2 month containing `now` starts on billingDay (UTC) and is named for the
// calendar month it starts in.
export function billingMonth(billingDay, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (now.getUTCDate() < billingDay ? 1 : 0), billingDay));
  return {start, name: start.toISOString().slice(0, 7)};
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    const {writeLimit, storageLimit, billingDay} = parseGuards(process.env.R2_GUARDS);
    console.log(`WRITE_LIMIT=${writeLimit}\nSTORAGE_LIMIT=${storageLimit}\nLEDGER_MONTH=${billingMonth(billingDay).name}`);
  } catch (error) { console.error(error.message); process.exit(2); }
}
