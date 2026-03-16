import { getSQL } from '@/lib/db';
import { jsonResponse, optionsResponse } from '@/lib/cors';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const sql = getSQL();
    await sql`SELECT 1`;
    return jsonResponse({ status: 'ok', timestamp });
  } catch (error) {
    console.error('Health check DB error:', error);
    return jsonResponse({
      status: 'degraded',
      timestamp,
      error: 'Database connection failed',
    });
  }
}
