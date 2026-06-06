# Deploying the Viral Hook Library worker on Coolify

Two ways to run hook ingestion. **You are on Option B today** (no migration
needed). Option A is the upgrade to a true separate worker when you want it.

---

## Option B — in-process (CURRENT, zero migration)

Your app runs as a single Dockerfile container with no Redis/worker. The
ingest endpoint detects this (no `REDIS_URL`) and runs ingestion **in-process**
via FastAPI BackgroundTasks. Nothing extra to deploy.

**To turn the library on:**
1. Coolify → your app → Environment Variables → add `OPENROUTER_API_KEY`.
2. **Rebuild + redeploy** (not just restart) so the new code + deps
   (`sqlite-vec`, `ImageHash`) are baked into the image.
3. Open the **Hook Library** page → Upload tab → drop screenshots. They process
   in the app container; watch the batch progress bar.

Notes:
- The library file lives in the container at `VIRAL_LIBRARY_DB`
  (default `backend/data/viral_library.db`). **Mount a Coolify volume** at that
  directory (e.g. `/app/data`) so the library survives redeploys — otherwise it
  resets on each deploy.
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
   - `DB_NAME` — same as today (default `sleeping-creators`).
   (`REDIS_URL`, `VIRAL_LIBRARY_DB`, `HOOK_INGEST_TMP` are already set in the
   compose; leave them.)
5. **Deploy.** Confirm three containers come up: `app`, `redis`, `hook-worker`.
6. **Verify data BEFORE cutover:** open the new app URL → clients/posts load
   (proves `MONGO_URL` points at the real Mongo). Check `hook-worker` logs show
   `celery@... ready`.
7. **Smoke-test ingestion:** upload one screenshot → `hook-worker` log processes
   it → it appears in the Library/Review tab.
8. **Cut over** the domain to the new resource; then stop/decommission the old
   single-app resource.

### Volumes
`viral_library_data` (the SQLite library) and `hook_ingest_tmp` (image handoff)
are named volumes mounted on both `app` and `hook-worker`. They persist across
redeploys — **back up `viral_library_data`** if the library becomes valuable;
deleting the volume erases the library.

### Rollback
If anything's wrong, point the domain back at the old app resource (still
running) — it's unaffected because the new resource used the same external Mongo
read-only-ish (it only writes what the app normally writes).

### Notes
- No code change is needed to switch B→A: the ingest endpoint uses Celery
  automatically once `REDIS_URL` is present (which the compose sets).
- `sqlite-vec` is NOT a service — it's a library inside the containers, installed
  via `requirements.txt`. Nothing to provision.
