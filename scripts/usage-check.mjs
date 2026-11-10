// Daily early warning for the usage ceilings: Worker requests per day, and
// R2 storage and operations per month. Reads Cloudflare's GraphQL analytics
// with a read-only token and fails (so GitHub opens an issue) when anything
// passes half of its ceiling. It never changes anything. It prints
// shares of each allowance only, since the run's log is public.
// Exit 0: measured below the warning level; 1: measured warning; 2: not checked.
//
//   CF_ACCOUNT_ID=… CF_ANALYTICS_TOKEN=… R2_GUARDS=… node scripts/usage-check.mjs
import {LIMITS, parseGuards, billingMonth} from './r2-guards.mjs';
export {LIMITS};
export const WARN_AT = 0.5;
// Deletes and aborted uploads are free; reads are Class B; other writes and listings are Class A.
const FREE = new Set(['DeleteObject', 'DeleteObjects', 'DeleteBucket', 'AbortMultipartUpload']);
const CLASS_B = new Set(['GetObject', 'HeadObject', 'HeadBucket', 'UsageSummary', 'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors', 'GetBucketLifecycleConfiguration']);

export function classify(operations) {
  let a = 0, b = 0;
  for (const {action, requests} of operations) {
    if (FREE.has(action)) continue;
    if (CLASS_B.has(action)) b += requests; else a += requests;
  }
  return {a, b};
}

// Each measure against its limit; warnings are the ones at or past WARN_AT.
export function evaluate({workerRequests, r2Bytes, classA, classB}) {
  const rows = [
    ['Worker requests yesterday', workerRequests, LIMITS.workerRequestsPerDay],
    ['R2 storage', r2Bytes, LIMITS.r2Bytes],
    ['R2 Class A operations this month', classA, LIMITS.r2ClassAPerMonth],
    ['R2 Class B operations this month', classB, LIMITS.r2ClassBPerMonth],
  ].map(([name, value, limit]) => ({name, value, limit, share: value / limit}));
  return {rows, warnings: rows.filter(row => row.share >= WARN_AT)};
}

const QUERY = `query($account: string!, $dayStart: Time!, $dayEnd: Time!, $monthStart: Time!, $now: Time!) {
  viewer { accounts(filter: {accountTag: $account}) {
    workers: workersInvocationsAdaptive(limit: 100, filter: {datetime_geq: $dayStart, datetime_lt: $dayEnd}) { sum { requests } }
    operations: r2OperationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $monthStart, datetime_lt: $now}) { sum { requests } dimensions { actionType } }
    storage: r2StorageAdaptiveGroups(limit: 100, filter: {datetime_geq: $dayStart, datetime_lt: $now}) { max { payloadSize metadataSize } dimensions { bucketName } }
  } }
}`;

// R2's monthly allowances reset on the account's billing day (UTC), not on the
// 1st; it comes from R2_GUARDS, the same setting the card library's uploads use.
export function window(billingDay, now = new Date()) {
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {dayStart: new Date(dayEnd - 864e5).toISOString(), dayEnd: dayEnd.toISOString(), monthStart: billingMonth(billingDay, now).start.toISOString(), now: now.toISOString()};
}

export function readUsage(account) {
  // Missing or malformed analytics are not zero usage. Do not include API
  // values in errors: the workflow's logs and warning issues are public.
  const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const named = value => typeof value === 'string' && value.length > 0;
  if (!account || !Array.isArray(account.workers) || !Array.isArray(account.operations) || !Array.isArray(account.storage)
    || account.workers.some(row => !count(row?.sum?.requests))
    || account.operations.some(row => !count(row?.sum?.requests) || !named(row?.dimensions?.actionType))
    || account.storage.some(row => !count(row?.max?.payloadSize) || !count(row?.max?.metadataSize) || !named(row?.dimensions?.bucketName))) {
    throw Error('Usage query returned incomplete or invalid analytics.');
  }
  const workerRequests = account.workers.reduce((sum, row) => sum + row.sum.requests, 0);
  const {a: classA, b: classB} = classify(account.operations.map(row => ({action: row.dimensions.actionType, requests: row.sum.requests})));
  // Storage is reported per bucket; the largest recent reading of each counts.
  const buckets = new Map();
  for (const row of account.storage) {
    const bytes = row.max.payloadSize + row.max.metadataSize, name = row.dimensions.bucketName;
    buckets.set(name, Math.max(buckets.get(name) || 0, bytes));
  }
  return {workerRequests, r2Bytes: [...buckets.values()].reduce((sum, bytes) => sum + bytes, 0), classA, classB};
}

const percent = share => (share * 100).toFixed(1) + '%';
export async function checkUsage({env = process.env, fetchImpl = fetch, log = console.log, error = console.error, now = new Date()} = {}) {
  const {CF_ACCOUNT_ID: account, CF_ANALYTICS_TOKEN: token} = env;
  if (!account?.trim() || !token?.trim()) {
    error('Usage not checked: set CF_ACCOUNT_ID (the R2_ACCOUNT_ID Actions secret) and CF_ANALYTICS_TOKEN.');
    return 2;
  }
  let billingDay;
  try { ({billingDay} = parseGuards(env.R2_GUARDS)); } catch (failure) { error(`Usage not checked: ${failure.message}`); return 2; }
  let response, data;
  try {
    response = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      signal: AbortSignal.timeout(30_000), body: JSON.stringify({query: QUERY, variables: {account, ...window(billingDay, now)}})});
    data = await response.json().catch(() => null);
  } catch {
    // A network/timeout error is not a threshold warning (exit 1). Avoid
    // printing exception details that might contain credentials or IDs.
    error('Usage not checked: analytics request failed or timed out.');
    return 2;
  }
  const found = data?.data?.viewer?.accounts?.[0];
  // Error text can name the account, so only the HTTP status is reported.
  if (!response.ok || data?.errors?.length || !found) { error(`Usage not checked: query failed (HTTP ${response.status}).`); return 2; }
  let usage;
  try { usage = readUsage(found); } catch (failure) { error(`Usage not checked: ${failure.message}`); return 2; }
  const {rows, warnings} = evaluate(usage);
  for (const row of rows) log(`${row.name}: ${percent(row.share)} of its ceiling`);
  if (warnings.length) { error(`Past ${percent(WARN_AT)} of a ceiling: ${warnings.map(row => row.name).join(', ')}.`); return 1; }
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  process.exitCode = await checkUsage();
}
