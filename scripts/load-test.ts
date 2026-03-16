const BASE_URL = process.argv[2];

if (!BASE_URL) {
  console.error('Usage: npx tsx scripts/load-test.ts <base-url>');
  console.error('Example: npx tsx scripts/load-test.ts https://your-app.vercel.app');
  process.exit(1);
}

const CONCURRENT_USERS = 35;
const DURATION_MS = 3 * 60 * 1000; // 3 minutes

interface Stats {
  totalRequests: number;
  errors5xx: number;
  errors429: number;
  errorsOther: number;
  responseTimes: number[];
}

const stats: Stats = {
  totalRequests: 0,
  errors5xx: 0,
  errors429: 0,
  errorsOther: 0,
  responseTimes: [],
};

function randomTeamId(): string {
  const num = Math.floor(Math.random() * 40) + 1;
  return `dev-${String(num).padStart(2, '0')}`;
}

function randomMood(): number {
  return Math.floor(Math.random() * 5) + 1;
}

async function timedFetch(url: string, options?: RequestInit): Promise<{ status: number; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, options);
    const ms = Date.now() - start;
    return { status: res.status, ms };
  } catch {
    const ms = Date.now() - start;
    return { status: 0, ms };
  }
}

function recordResult(result: { status: number; ms: number }) {
  stats.totalRequests++;
  stats.responseTimes.push(result.ms);

  if (result.status >= 500) stats.errors5xx++;
  else if (result.status === 429) stats.errors429++;
  else if (result.status === 0 || result.status >= 400) stats.errorsOther++;
}

async function simulateUser(endTime: number) {
  const teamId = randomTeamId();

  while (Date.now() < endTime) {
    // POST: submit mood
    const postResult = await timedFetch(`${BASE_URL}/api/v1/pulse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team_id: teamId,
        mood: randomMood(),
        comment: Math.random() > 0.5 ? 'Load test entry' : undefined,
      }),
    });
    recordResult(postResult);

    // GET: results
    const resultsResult = await timedFetch(`${BASE_URL}/api/v1/pulse/results?team_id=${teamId}`);
    recordResult(resultsResult);

    // GET: history
    const historyResult = await timedFetch(`${BASE_URL}/api/v1/pulse/history?team_id=${teamId}&limit=10`);
    recordResult(historyResult);

    // GET: comments
    const commentsResult = await timedFetch(`${BASE_URL}/api/v1/pulse/comments?team_id=${teamId}&limit=10`);
    recordResult(commentsResult);
  }
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function run() {
  console.log(`Load test starting against: ${BASE_URL}`);
  console.log(`Concurrent users: ${CONCURRENT_USERS}`);
  console.log(`Duration: ${DURATION_MS / 1000}s\n`);

  const endTime = Date.now() + DURATION_MS;

  // Progress reporting
  const progressInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - (endTime - DURATION_MS)) / 1000);
    console.log(`[${elapsed}s] Requests: ${stats.totalRequests} | 5xx: ${stats.errors5xx} | 429: ${stats.errors429}`);
  }, 10_000);

  // Launch concurrent users
  const users = Array.from({ length: CONCURRENT_USERS }, () => simulateUser(endTime));
  await Promise.all(users);

  clearInterval(progressInterval);

  // Final report
  const avgMs = Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length);
  const p95 = percentile(stats.responseTimes, 95);
  const p99 = percentile(stats.responseTimes, 99);

  console.log('\n=== LOAD TEST RESULTS ===');
  console.log(`Total requests:     ${stats.totalRequests}`);
  console.log(`5xx errors:         ${stats.errors5xx}`);
  console.log(`429 rate limited:   ${stats.errors429}`);
  console.log(`Other errors:       ${stats.errorsOther}`);
  console.log(`Avg response time:  ${avgMs}ms`);
  console.log(`95th percentile:    ${p95}ms`);
  console.log(`99th percentile:    ${p99}ms`);
  console.log('');

  // Pass/fail checks
  const pass = stats.errors5xx === 0 && avgMs < 200 && p95 < 500;
  if (pass) {
    console.log('RESULT: PASS');
  } else {
    console.log('RESULT: FAIL');
    if (stats.errors5xx > 0) console.log('  - Had 5xx errors');
    if (avgMs >= 200) console.log(`  - Avg response time ${avgMs}ms >= 200ms`);
    if (p95 >= 500) console.log(`  - 95th percentile ${p95}ms >= 500ms`);
  }
}

run().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
