import { getSQL } from '@/lib/db';
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

    const limitCheck = validateLimit(limitParam, 20, 100);
    if (!limitCheck.valid) {
      return jsonResponse({ error: limitCheck.error }, 400);
    }

    const sql = getSQL();
    const rows = await sql`
      SELECT id, comment, mood, created_at
      FROM pulse_entries
      WHERE team_id = ${teamId} AND comment IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ${limitCheck.value}
    `;

    return jsonResponse({
      comments: rows,
    });
  } catch (error) {
    console.error('GET /api/v1/pulse/comments error:', error);
    return jsonResponse({ error: 'Internal server error.' }, 500);
  }
}
