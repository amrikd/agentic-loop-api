# THE AGENTIC LOOP — API IMPLEMENTATION SPEC
## For Claude Code to build. Deploy to Vercel.

---

## STACK

- **Runtime:** Next.js 14+ (App Router) — API routes only, no frontend
- **Database:** Vercel Postgres (managed, zero config on Vercel)
- **Language:** TypeScript
- **Hosting:** Vercel
- **ORM:** None. Use `@vercel/postgres` SDK directly with raw SQL. Keep it simple.

---

## PROJECT STRUCTURE

```
agentic-loop-api/
├── .env.example
├── .gitignore
├── README.md
├── next.config.js
├── package.json
├── tsconfig.json
├── scripts/
│   ├── seed.ts              # Seeds data for dev-01 through dev-40
│   └── load-test.ts         # Simple load test script
└── src/
    └── app/
        └── api/
            └── v1/
                ├── pulse/
                │   ├── route.ts          # POST /api/v1/pulse
                │   ├── results/
                │   │   └── route.ts      # GET /api/v1/pulse/results
                │   ├── history/
                │   │   └── route.ts      # GET /api/v1/pulse/history
                │   └── comments/
                │       └── route.ts      # GET /api/v1/pulse/comments
                └── health/
                    └── route.ts          # GET /api/v1/health
```

---

## DATABASE

### Setup
Create a Vercel Postgres database from the Vercel dashboard. The connection string is automatically available as `POSTGRES_URL` in Vercel deployments.

For local development, use the Vercel CLI to pull env vars: `vercel env pull .env.local`

### Schema

```sql
CREATE TABLE IF NOT EXISTS pulse_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id VARCHAR(50) NOT NULL,
    mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
    comment VARCHAR(280),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pulse_team_id ON pulse_entries(team_id);
CREATE INDEX IF NOT EXISTS idx_pulse_created_at ON pulse_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_team_created ON pulse_entries(team_id, created_at DESC);
```

Run this as part of the seed script or as a standalone migration on first deploy.

---

## ENDPOINTS

### 1. POST `/api/v1/pulse`

Submit a mood entry.

**Request body:**
```json
{
  "mood": 3,
  "comment": "Feeling okay today",
  "team_id": "dev-01"
}
```

**Validation rules:**
- `mood` — required, integer, must be 1-5. Reject floats, strings, nulls.
- `comment` — optional, string, max 280 characters. Trim whitespace. If empty string, store as null.
- `team_id` — required, string, must match pattern `dev-XX` where XX is 01-40. Reject anything else.

**Success response (201):**
```json
{
  "id": "a1b2c3d4-...",
  "created_at": "2026-03-20T14:32:00.000Z",
  "mood": 3,
  "has_comment": true
}
```

**Error responses:**
- 400: `{ "error": "Invalid mood value. Must be integer 1-5." }`
- 400: `{ "error": "Comment exceeds 280 characters." }`
- 400: `{ "error": "team_id is required." }`
- 400: `{ "error": "Invalid team_id format." }`
- 429: `{ "error": "Rate limit exceeded. Max 60 requests per minute." }`
- 500: `{ "error": "Internal server error." }`

**Implementation notes:**
- Insert into `pulse_entries` table
- Return the created row
- `has_comment` is derived (true if comment is not null), not stored

---

### 2. GET `/api/v1/pulse/results?team_id=dev-01`

Aggregated mood data for a team.

**Query params:**
- `team_id` — required

**Success response (200):**
```json
{
  "team_id": "dev-01",
  "total_submissions": 42,
  "average_mood": 3.7,
  "distribution": {
    "1": 2,
    "2": 5,
    "3": 12,
    "4": 15,
    "5": 8
  },
  "last_updated": "2026-03-20T14:32:00.000Z"
}
```

**Implementation notes:**
- Single query with aggregation:
```sql
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
WHERE team_id = $1
```
- If no entries exist for the team_id, return zeroes (not 404):
```json
{
  "team_id": "dev-01",
  "total_submissions": 0,
  "average_mood": 0,
  "distribution": { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
  "last_updated": null
}
```

**Error responses:**
- 400: `{ "error": "team_id is required." }`
- 400: `{ "error": "Invalid team_id format." }`

---

### 3. GET `/api/v1/pulse/history?team_id=dev-01&limit=50`

Individual mood entries over time for trend visualization.

**Query params:**
- `team_id` — required
- `limit` — optional, integer, default 50, max 200

**Success response (200):**
```json
{
  "entries": [
    { "id": "uuid", "mood": 4, "created_at": "2026-03-20T14:32:00.000Z" },
    { "id": "uuid", "mood": 2, "created_at": "2026-03-20T14:28:00.000Z" }
  ],
  "total": 42
}
```

**Implementation:**
```sql
-- Entries query (most recent first)
SELECT id, mood, created_at 
FROM pulse_entries 
WHERE team_id = $1 
ORDER BY created_at DESC 
LIMIT $2

-- Total count (separate query)
SELECT COUNT(*) as total 
FROM pulse_entries 
WHERE team_id = $1
```

**Error responses:**
- 400: `{ "error": "team_id is required." }`
- 400: `{ "error": "limit must be between 1 and 200." }`

---

### 4. GET `/api/v1/pulse/comments?team_id=dev-01&limit=20`

Recent anonymous comments with their associated mood.

**Query params:**
- `team_id` — required
- `limit` — optional, integer, default 20, max 100

**Success response (200):**
```json
{
  "comments": [
    { "id": "uuid", "comment": "Great sprint!", "mood": 5, "created_at": "2026-03-20T14:32:00.000Z" },
    { "id": "uuid", "comment": "Too many meetings", "mood": 2, "created_at": "2026-03-20T14:28:00.000Z" }
  ]
}
```

**Implementation:**
```sql
SELECT id, comment, mood, created_at
FROM pulse_entries
WHERE team_id = $1 AND comment IS NOT NULL
ORDER BY created_at DESC
LIMIT $2
```

**Error responses:**
- 400: `{ "error": "team_id is required." }`

---

### 5. GET `/api/v1/health`

Health check. No params.

**Success response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-03-20T14:32:00.000Z"
}
```

**Implementation:**
- Also run a quick `SELECT 1` against the database to verify DB connectivity
- If DB is unreachable:
```json
{
  "status": "degraded",
  "timestamp": "2026-03-20T14:32:00.000Z",
  "error": "Database connection failed"
}
```
Return 200 even when degraded (so uptime monitors don't false-alarm), but surface the status.

---

## CORS

Enable CORS for all origins. Every route should return these headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Handle OPTIONS preflight requests on all endpoints.

**Implementation:** Use a middleware or Next.js config. Simplest approach is a shared helper that wraps every response:

```typescript
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
```

And an OPTIONS handler in each route:
```typescript
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
```

---

## RATE LIMITING

Simple in-memory rate limiter. 60 requests per minute per team_id.

**Implementation:** Use a `Map<string, { count: number, resetAt: number }>` in memory. On each request:
1. Get the team_id's entry
2. If `resetAt` has passed, reset count to 0
3. Increment count
4. If count > 60, return 429

This resets on redeploy (fine for a one-day event). No need for Redis.

**Apply to:** POST `/pulse` only. GET endpoints don't need rate limiting.

---

## SEED SCRIPT (`scripts/seed.ts`)

Run once before the event to populate data for all participants.

### What It Does
1. Creates the `pulse_entries` table if it doesn't exist
2. Clears any existing seed data (so it's idempotent)
3. Seeds data for `dev-01` through `dev-40`
4. Each dev ID gets 25-30 entries

### Seed Data Rules

**Timestamps:**
- Spread entries across the 7 days before the event (March 13-19, 2026)
- Cluster entries during "work hours" (9 AM - 6 PM EST)
- 3-5 entries per day, with some variation (more on some days, fewer on others)
- Random minute offsets within each hour (don't make them all on the hour)

**Moods:**
- Distribution should be realistic, not uniform
- Weight toward 3 and 4 (most people report "okay" to "good")
- Approximate target distribution: mood 1 = 5%, mood 2 = 15%, mood 3 = 30%, mood 4 = 35%, mood 5 = 15%
- Each dev ID should have a slightly different distribution (randomize the weights per ID)

**Comments:**
- ~60% of entries should have a comment
- Comments should be varied and realistic. Use a pool of 30-40 pre-written comments across sentiment categories:

Positive (for moods 4-5):
- "Good energy in standup today"
- "Finally closed that PR"
- "Pairing session was really productive"
- "Sprint goals looking achievable"
- "Great feedback in retro"
- "New feature is coming together nicely"
- "Unblocked on that API issue"
- "Team lunch was a good break"
- "Code review was super helpful"
- "Shipped to staging, feels good"

Neutral (for mood 3):
- "Lots of meetings today"
- "Context switching between tasks"
- "Waiting on design review"
- "Sprint is about average"
- "Nothing special, steady work"
- "Backend changes taking longer than expected"
- "Had to redo some test cases"
- "Onboarding docs could be better"
- "Mid-sprint, staying on track"
- "Need to catch up on Slack"

Negative (for moods 1-2):
- "Blocked on infrastructure issue"
- "Too many interruptions"
- "Build keeps failing"
- "Scope creep again"
- "Unclear requirements on this ticket"
- "Deployment issues all morning"
- "Merge conflicts everywhere"
- "Burnout creeping in"
- "Tech debt is slowing us down"
- "Lost half the day to a production incident"

**Comment assignment:**
- Mood 1-2 entries pull from negative pool
- Mood 3 entries pull from neutral pool
- Mood 4-5 entries pull from positive pool
- Randomize which entries get comments (60% chance)

### How to Run
```bash
# Set DATABASE_URL in .env.local (or use vercel env pull)
npx tsx scripts/seed.ts
```

The script should log progress:
```
Creating table...
Seeding dev-01: 27 entries
Seeding dev-02: 25 entries
...
Seeding dev-40: 29 entries
Done. 1,087 total entries seeded.
```

---

## LOAD TEST SCRIPT (`scripts/load-test.ts`)

Simple script to verify the API handles event-day load.

### What It Simulates
- 35 concurrent "users" (matching max attendance)
- Each user makes a POST (submit mood) and 3 GETs (results, history, comments) in sequence
- Runs for 3 minutes continuously
- Logs response times and any errors

### Success Criteria
- Zero 5xx errors
- Average response time under 200ms
- 95th percentile under 500ms
- Rate limiter kicks in correctly (429s appear when a single team_id exceeds 60/min)

### How to Run
```bash
npx tsx scripts/load-test.ts https://your-domain.vercel.app
```

---

## DEPLOYMENT

### Steps
1. Create new project on Vercel
2. Connect to the GitHub repo
3. Add a Vercel Postgres database from the Vercel dashboard (Storage tab)
4. Deploy
5. Run seed script against production: `npx tsx scripts/seed.ts`
6. Verify all endpoints via curl or browser
7. Run load test against production
8. Share the base URL with Brian and Brandon

### Environment Variables
Vercel Postgres automatically injects these on deploy:
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

For local dev, run `vercel env pull .env.local` to get these locally.

No additional env vars needed. No API keys, no auth config.

### Custom Domain (Optional)
If you want a clean URL like `pulse-api.yourdomain.com` instead of the default Vercel URL, add it in Project Settings > Domains. Not required but looks better in the README and exercise briefs.

---

## VERIFICATION CHECKLIST

Run through this after deployment:

### Endpoints
- [ ] `POST /api/v1/pulse` — submit mood 3 with comment, get 201 with correct shape
- [ ] `POST /api/v1/pulse` — submit mood 0, get 400
- [ ] `POST /api/v1/pulse` — submit mood 6, get 400
- [ ] `POST /api/v1/pulse` — submit without team_id, get 400
- [ ] `POST /api/v1/pulse` — submit with invalid team_id "team-99", get 400
- [ ] `POST /api/v1/pulse` — submit with comment over 280 chars, get 400
- [ ] `GET /api/v1/pulse/results?team_id=dev-01` — get 200 with seeded data
- [ ] `GET /api/v1/pulse/results?team_id=dev-40` — get 200 with seeded data
- [ ] `GET /api/v1/pulse/results` (no team_id) — get 400
- [ ] `GET /api/v1/pulse/history?team_id=dev-01` — get 200 with entries
- [ ] `GET /api/v1/pulse/history?team_id=dev-01&limit=5` — get 200 with exactly 5 entries
- [ ] `GET /api/v1/pulse/comments?team_id=dev-01` — get 200 with comments
- [ ] `GET /api/v1/health` — get 200 with status "ok"

### CORS
- [ ] `curl -X OPTIONS` returns correct headers
- [ ] Frontend running on localhost:3000 can call all endpoints without CORS errors

### Seed Data
- [ ] dev-01 has 25-30 entries
- [ ] dev-40 has 25-30 entries
- [ ] Entries span 7 days
- [ ] Comments are present on ~60% of entries
- [ ] Mood distribution looks realistic (not all 4s and 5s)

### Rate Limiting
- [ ] Send 61 POSTs in under a minute for one team_id — 61st returns 429
- [ ] Different team_ids are rate limited independently

### Load Test
- [ ] Zero 5xx errors over 3 minutes
- [ ] Average response time under 200ms
- [ ] 95th percentile under 500ms

---

## TIMELINE

| When | What |
|------|------|
| Monday March 16 | Start building. Deploy first version. |
| Tuesday March 17 | Seed data. Run load test. Share URL with Brian and Brandon. |
| Wednesday March 18 | Brian and Brandon test their repos against the live API. Fix any issues. |
| Thursday March 19 | Final verification. All three facilitators test the full flow end-to-end. |
| Friday March 20 | Event day. Monitor API. Have your laptop ready to check health endpoint. |

---

*Ready for Claude Code. Feed this entire doc as context.*
