import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Load env vars for local development
config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run: vercel env pull .env.local');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// --- Comment pools ---
const positiveComments = [
  'Good energy in standup today',
  'Finally closed that PR',
  'Pairing session was really productive',
  'Sprint goals looking achievable',
  'Great feedback in retro',
  'New feature is coming together nicely',
  'Unblocked on that API issue',
  'Team lunch was a good break',
  'Code review was super helpful',
  'Shipped to staging, feels good',
];

const neutralComments = [
  'Lots of meetings today',
  'Context switching between tasks',
  'Waiting on design review',
  'Sprint is about average',
  'Nothing special, steady work',
  'Backend changes taking longer than expected',
  'Had to redo some test cases',
  'Onboarding docs could be better',
  'Mid-sprint, staying on track',
  'Need to catch up on Slack',
];

const negativeComments = [
  'Blocked on infrastructure issue',
  'Too many interruptions',
  'Build keeps failing',
  'Scope creep again',
  'Unclear requirements on this ticket',
  'Deployment issues all morning',
  'Merge conflicts everywhere',
  'Burnout creeping in',
  'Tech debt is slowing us down',
  'Lost half the day to a production incident',
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateMood(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i + 1;
  }
  return 3;
}

function generateWeightsForTeam(): number[] {
  // Base distribution: mood 1=5%, 2=15%, 3=30%, 4=35%, 5=15%
  const base = [5, 15, 30, 35, 15];
  // Add some per-team variation (+-5)
  return base.map((w) => Math.max(1, w + randomInt(-5, 5)));
}

function getComment(mood: number): string | null {
  // 60% chance of having a comment
  if (Math.random() > 0.6) return null;

  if (mood <= 2) return pickRandom(negativeComments);
  if (mood === 3) return pickRandom(neutralComments);
  return pickRandom(positiveComments);
}

async function seed() {
  console.log('Creating table...');

  await sql`
    CREATE TABLE IF NOT EXISTS pulse_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id VARCHAR(50) NOT NULL,
      mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
      comment VARCHAR(280),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_pulse_team_id ON pulse_entries(team_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pulse_created_at ON pulse_entries(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pulse_team_created ON pulse_entries(team_id, created_at DESC)`;

  // Clear existing seed data (entries from before event day)
  console.log('Clearing existing seed data...');
  await sql`DELETE FROM pulse_entries WHERE created_at < '2026-03-20T00:00:00Z'`;

  let totalEntries = 0;

  // Event is March 20, 2026 — seed data for March 13-19
  const seedStartDate = new Date('2026-03-13T00:00:00Z');
  const seedDays = 7;

  for (let devNum = 1; devNum <= 40; devNum++) {
    const teamId = `dev-${String(devNum).padStart(2, '0')}`;
    const targetEntries = randomInt(25, 30);
    const weights = generateWeightsForTeam();

    // Distribute entries across 7 days
    const entriesPerDay: number[] = [];
    let remaining = targetEntries;

    for (let d = 0; d < seedDays; d++) {
      if (d === seedDays - 1) {
        entriesPerDay.push(remaining);
      } else {
        const dayEntries = randomInt(3, 5);
        entriesPerDay.push(Math.min(dayEntries, remaining));
        remaining -= entriesPerDay[d];
        if (remaining < 0) remaining = 0;
      }
    }

    const values: string[] = [];

    for (let d = 0; d < seedDays; d++) {
      const dayDate = new Date(seedStartDate);
      dayDate.setDate(dayDate.getDate() + d);

      for (let e = 0; e < entriesPerDay[d]; e++) {
        const mood = generateMood(weights);
        const comment = getComment(mood);

        // Random hour between 9 AM and 6 PM EST (14:00 - 23:00 UTC)
        const hour = randomInt(14, 22);
        const minute = randomInt(0, 59);
        const second = randomInt(0, 59);

        const timestamp = new Date(dayDate);
        timestamp.setUTCHours(hour, minute, second, 0);

        const commentSql = comment ? `'${comment.replace(/'/g, "''")}'` : 'NULL';
        values.push(
          `('${teamId}', ${mood}, ${commentSql}, '${timestamp.toISOString()}')`
        );
      }
    }

    // Batch insert for this team
    if (values.length > 0) {
      await sql.query(
        `INSERT INTO pulse_entries (team_id, mood, comment, created_at) VALUES ${values.join(', ')}`
      );
    }

    totalEntries += values.length;
    console.log(`Seeding ${teamId}: ${values.length} entries`);
  }

  console.log(`\nDone. ${totalEntries.toLocaleString()} total entries seeded.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
