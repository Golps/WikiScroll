// Daily early warning for the free-tier limits: Worker requests per day, and
// R2 storage and operations per month. Reads Cloudflare's GraphQL analytics
// with a read-only token and fails (so GitHub opens an issue) when anything
// passes half of its free allowance. It never changes anything.
//
//   CF_ACCOUNT_ID=… CF_ANALYTICS_TOKEN=… node scripts/usage-check.mjs
export const LIMITS = {workerRequestsPerDay: 100_000, r2Bytes: 10e9, r2ClassAPerMonth: 1_000_000, r2ClassBPerMonth: 10_000_000};
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

export function window(now = new Date()) {
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {dayStart: new Date(dayEnd - 864e5).toISOString(), dayEnd: dayEnd.toISOString(), monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), now: now.toISOString()};
}

export function readUsage(account) {
  const workerRequests = (account.workers || []).reduce((sum, row) => sum + (row.sum?.requests || 0), 0);
  const {a: classA, b: classB} = classify((account.operations || []).map(row => ({action: row.dimensions?.actionType, requests: row.sum?.requests || 0})));
  // Storage is reported per bucket; the largest recent reading of each counts.
  const buckets = new Map();
  for (const row of account.storage || []) {
    const bytes = (row.max?.payloadSize || 0) + (row.max?.metadataSize || 0), name = row.dimensions?.bucketName;
    buckets.set(name, Math.max(buckets.get(name) || 0, bytes));
  }
  return {workerRequests, r2Bytes: [...buckets.values()].reduce((sum, bytes) => sum + bytes, 0), classA, classB};
}

const percent = share => (share * 100).toFixed(1) + '%';
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const {CF_ACCOUNT_ID: account, CF_ANALYTICS_TOKEN: token} = process.env;
  if (!account || !token) { console.error('Set CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN.'); process.exit(2); }
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({query: QUERY, variables: {account, ...window()}})});
  const data = await response.json().catch(() => null);
  const found = data?.data?.viewer?.accounts?.[0];
  // Error text can name the account, so only the HTTP status is reported.
  if (!response.ok || data?.errors?.length || !found) { console.error(`Usage query failed (HTTP ${response.status}).`); process.exit(2); }
  const {rows, warnings} = evaluate(readUsage(found));
  for (const row of rows) console.log(`${row.name}: ${Math.round(row.value).toLocaleString('en-US')} of ${row.limit.toLocaleString('en-US')} (${percent(row.share)})`);
  if (warnings.length) { console.error(`Past ${percent(WARN_AT)} of a free limit: ${warnings.map(row => row.name).join(', ')}.`); process.exit(1); }
}
