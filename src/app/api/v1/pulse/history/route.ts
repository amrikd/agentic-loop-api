import { sql } from '@vercel/postgres';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { validateTeamId, validateLimit } from '@/lib/validation';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    const limitParam = searchParams.get('limit');

    const teamCheck = validateTeamId(teamId);
    if (!teamCheck.valid) {
      return jsonResponse({ error: teamCheck.error }, 400);
    }

    const limitCheck = validateLimit(limitParam, 50, 200);
    if (!limitCheck.valid) {
      return jsonResponse({ error: limitCheck.error }, 400);
    }

    const [entriesResult, countResult] = await Promise.all([
      sql`
        SELECT id, mood, created_at
        FROM pulse_entries
        WHERE team_id = ${teamId}
        ORDER BY created_at DESC
        LIMIT ${limitCheck.value}
      `,
      sql`
        SELECT COUNT(*) as total
        FROM pulse_entries
        WHERE team_id = ${teamId}
      `,
    ]);

    return jsonResponse({
      entries: entriesResult.rows,
      total: Number(countResult.rows[0].total),
    });
  } catch (error) {
    console.error('GET /api/v1/pulse/history error:', error);
    return jsonResponse({ error: 'Internal server error.' }, 500);
  }
}
