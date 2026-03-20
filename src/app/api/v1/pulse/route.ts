import { getSQL } from '@/lib/db';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateTeamId, validateMood, validateComment } from '@/lib/validation';

export async function OPTIONS() {
  return optionsResponse();
}

// In-memory counter for chaos mode — every 3rd request fails
let requestCount = 0;

export async function POST(request: Request) {
  try {
    // Chaos mode: every 3rd request returns a 500
    if (process.env.CHAOS_MODE === 'true') {
      requestCount++;
      if (requestCount % 3 === 0) {
        return jsonResponse({ error: 'Service temporarily unavailable. Please retry.' }, 500);
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400);
    }

    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Invalid request body.' }, 400);
    }

    const { mood, comment, team_id } = body as Record<string, unknown>;

    // Validate team_id
    const teamCheck = validateTeamId(team_id);
    if (!teamCheck.valid) {
      return jsonResponse({ error: teamCheck.error }, 400);
    }

    // Rate limit check
    if (!checkRateLimit(team_id as string)) {
      return jsonResponse({ error: 'Rate limit exceeded. Max 60 requests per minute.' }, 429);
    }

    // Validate mood
    const moodCheck = validateMood(mood);
    if (!moodCheck.valid) {
      return jsonResponse({ error: moodCheck.error }, 400);
    }

    // Validate comment
    const commentCheck = validateComment(comment);
    if (!commentCheck.valid) {
      return jsonResponse({ error: commentCheck.error }, 400);
    }

    const sql = getSQL();
    const rows = await sql`
      INSERT INTO pulse_entries (team_id, mood, comment)
      VALUES (${team_id as string}, ${moodCheck.value}, ${commentCheck.value})
      RETURNING id, created_at, mood, comment
    `;

    const row = rows[0];

    return jsonResponse({
      id: row.id,
      created_at: row.created_at,
      mood: row.mood,
      has_comment: row.comment !== null,
    }, 201);
  } catch (error) {
    console.error('POST /api/v1/pulse error:', error);
    return jsonResponse({ error: 'Internal server error.' }, 500);
  }
}
