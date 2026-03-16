import { sql } from '@vercel/postgres';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { validateTeamId } from '@/lib/validation';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');

    const teamCheck = validateTeamId(teamId);
    if (!teamCheck.valid) {
      return jsonResponse({ error: teamCheck.error }, 400);
    }

    const result = await sql`
      SELECT
        COUNT(*) as total,
        ROUND(AVG(mood)::numeric, 1) as average,
        COUNT(*) FILTER (WHERE mood = 1) as mood_1,
        COUNT(*) FILTER (WHERE mood = 2) as mood_2,
        COUNT(*) FILTER (WHERE mood = 3) as mood_3,
        COUNT(*) FILTER (WHERE mood = 4) as mood_4,
        COUNT(*) FILTER (WHERE mood = 5) as mood_5,
        MAX(created_at) as last_updated
      FROM pulse_entries
      WHERE team_id = ${teamId}
    `;

    const row = result.rows[0];
    const total = Number(row.total);

    return jsonResponse({
      team_id: teamId,
      total_submissions: total,
      average_mood: total === 0 ? 0 : Number(row.average),
      distribution: {
        '1': Number(row.mood_1),
        '2': Number(row.mood_2),
        '3': Number(row.mood_3),
        '4': Number(row.mood_4),
        '5': Number(row.mood_5),
      },
      last_updated: row.last_updated || null,
    });
  } catch (error) {
    console.error('GET /api/v1/pulse/results error:', error);
    return jsonResponse({ error: 'Internal server error.' }, 500);
  }
}
