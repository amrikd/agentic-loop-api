import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function wipe() {
  const before = await sql`SELECT COUNT(*) as count FROM pulse_entries`;
  console.log(`Entries before wipe: ${before[0].count}`);

  await sql`DELETE FROM pulse_entries`;

  const after = await sql`SELECT COUNT(*) as count FROM pulse_entries`;
  console.log(`Entries after wipe: ${after[0].count}`);
  console.log('Done. Database is empty.');
}

wipe()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Wipe failed:', err);
    process.exit(1);
  });
