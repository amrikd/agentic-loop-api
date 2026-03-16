const TEAM_ID_PATTERN = /^dev-(0[1-9]|[1-3][0-9]|40)$/;

export function validateTeamId(teamId: unknown): { valid: true } | { valid: false; error: string } {
  if (!teamId || typeof teamId !== 'string') {
    return { valid: false, error: 'team_id is required.' };
  }
  if (!TEAM_ID_PATTERN.test(teamId)) {
    return { valid: false, error: 'Invalid team_id format.' };
  }
  return { valid: true };
}

export function validateMood(mood: unknown): { valid: true; value: number } | { valid: false; error: string } {
  if (mood === null || mood === undefined) {
    return { valid: false, error: 'Invalid mood value. Must be integer 1-5.' };
  }
  if (typeof mood !== 'number' || !Number.isInteger(mood) || mood < 1 || mood > 5) {
    return { valid: false, error: 'Invalid mood value. Must be integer 1-5.' };
  }
  return { valid: true, value: mood };
}

export function validateComment(comment: unknown): { valid: true; value: string | null } | { valid: false; error: string } {
  if (comment === undefined || comment === null) {
    return { valid: true, value: null };
  }
  if (typeof comment !== 'string') {
    return { valid: false, error: 'Comment exceeds 280 characters.' };
  }
  const trimmed = comment.trim();
  if (trimmed.length === 0) {
    return { valid: true, value: null };
  }
  if (trimmed.length > 280) {
    return { valid: false, error: 'Comment exceeds 280 characters.' };
  }
  return { valid: true, value: trimmed };
}

export function validateLimit(limit: string | null, defaultVal: number, max: number): { valid: true; value: number } | { valid: false; error: string } {
  if (!limit) {
    return { valid: true, value: defaultVal };
  }
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return { valid: false, error: `limit must be between 1 and ${max}.` };
  }
  return { valid: true, value: parsed };
}
