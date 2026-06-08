# Deploying the Viral Hook Library worker on Coolify

Two ways to run hook ingestion. **You are on Option B today** (no migration
needed). Option A is the upgrade to a true separate worker when you want it.

---

## The vector store is a separate Postgres (pgvector) resource

The library uses **Postgres + pgvector** (not a file). Create it ONCE in Coolify
and both options below use it:
1. Coolify → New Resource → Database → **PostgreSQL**, image
   **`pgvector/pgvector:pg16`** (ships the `vector` extension). Needs pgvector ≥ 0.5.
2. Create a database (e.g. `viral_library`). Note its connection URL.
3. The app/worker connect via env **`VIRAL_LIBRARY_PG_URL`** =
   `postgresql://user:pass@<pg-host>:5432/viral_library`. `init_db()` runs
   `CREATE EXTENSION vector` + creates the `hooks` table on first boot.

Back this Postgres up like any DB — it holds the whole library. No app-side
volume is needed for the library anymore.

## Option B — in-process (CURRENT, no deployment migration)

Your app runs as a single Dockerfile container with no Redis/worker. The
ingest endpoint detects this (no `REDIS_URL`) and runs ingestion **in-process**
via FastAPI BackgroundTasks. You only add the Postgres resource above + the key.

**To turn the library on:**
1. Create the pgvector Postgres resource (above) and make sure your app can
   reach it (same Coolify network/project).
2. Coolify → your app → Environment Variables → add `OPENROUTER_API_KEY` and
   `VIRAL_LIBRARY_PG_URL`.
3. **Rebuild + redeploy** (not just restart) so the new deps
   (`psycopg2-binary`, `pgvector`, `ImageHash`) + code are baked into the image.
4. Open the **Hook Library** page → Upload tab → drop screenshots. They process
   in the app container; watch the batch progress bar.

Notes:
- No app-side volume needed — the library lives in Postgres. (`HOOK_INGEST_TMP`
  is just ephemeral scratch for the image being processed, then deleted.)
- Good for dumping a few hundred screenshots at a time. For very large bulk
  loads, prefer Option A so vision processing doesn't compete with the web app.

---

## Option A — separate Celery hook-worker (the upgrade)

Runs ingestion in its own container. Because the worker shares the SQLite
library file with the app, both must live in one Compose project on one host.
Use `docker-compose.coolify.yml` (no `mongo` service — your existing Coolify
Mongo stays the source of truth).

### Migration checklist

1. **Don't delete the old app yet.** Stand the new one up alongside it, verify,
   then cut over. This keeps a rollback.
2. **Get your Mongo's internal connection URL** from the existing Coolify Mongo
   resource (e.g. `mongodb://<user>:<pass>@<service>:27017`). The new resource
   must reach it — connect them on the same Coolify network/project.
3. **Create a new Coolify resource → Docker Compose**, pointing at
   `docker-compose.coolify.yml` in this repo/branch.
4. **Set Environment Variables on the new resource** — copy **every** variable
   from your current app resource (ANTHROPIC_API_KEY, SHOTSTACK_*, TELEGRAM_*,
   GOOGLE_*, BUNDLE_*, JWT_SECRET_KEY, etc.), then add:
   - `OPENROUTER_API_KEY` — vision + embeddings.
   - `MONGO_URL` — your EXISTING Mongo (step 2). **Do not** point at a new/empty DB.
   - `VIRAL_LIBRARY_PG_URL` — your pgvector Postgres resource (see top section).
   - `DB_NAME` — same as today (default `sleeping-creators`).
   (`REDIS_URL`, `HOOK_INGEST_TMP` are already set in the compose; leave them.)
5. **Deploy.** Confirm three containers come up: `app`, `redis`, `hook-worker`.
6. **Verify data BEFORE cutover:** open the new app URL → clients/posts load
   (proves `MONGO_URL` points at the real Mongo). Check `hook-worker` logs show
   `celery@... ready`.
7. **Smoke-test ingestion:** upload one screenshot → `hook-worker` log processes
   it → it appears in the Library/Review tab.
8. **Cut over** the domain to the new resource; then stop/decommission the old
   single-app resource.

### Storage
The library lives in the **pgvector Postgres resource** (back that up). The only
shared volume is `hook_ingest_tmp` (transient image handoff between `app` and
`hook-worker`) — mounted on both so an upload saved by the API is readable by
the worker. No library volume.

### Rollback
If anything's wrong, point the domain back at the old app resource (still
running) — it's unaffected because the new resource used the same external Mongo
read-only-ish (it only writes what the app normally writes).

### Notes
- To switch B→A, set **`HOOK_INGEST_USE_CELERY=true`** (the compose does this) so
  ingestion routes to the hook-worker. Without it, ingestion runs in-process even
  if `REDIS_URL` is set — deliberate, so a stray `REDIS_URL` (e.g. for the video
  worker) can't silently enqueue ingest jobs that no hook-worker consumes.
- The vector store is the pgvector Postgres resource (shared by both options) —
  the only persistent thing to back up.
