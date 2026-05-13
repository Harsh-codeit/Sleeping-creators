# Music Library — Drive Import + Custom Tags + Inline Play Button

## Goal

Add a "Import from Drive" flow to the music library: paste a Google Drive folder URL → backend lists every audio file in that folder → user picks which to import → backend downloads each file from Drive and uploads it to R2 → track is persisted in `db.music_tracks` exactly like a manual upload. Replace the hardcoded 9-mood-tag list with a user-extensible tag catalog so the user can create new tags from the UI (currently `MoodTagPicker` in [frontend/src/components/music/MoodTagPicker.js:1-4](frontend/src/components/music/MoodTagPicker.js#L1-L4) is hardcoded). Finally, add a small play/pause button directly on each track card so the user can preview without opening the waveform editor.

## What already exists (and we will NOT change)

- **Storage** — [backend/storage.py](backend/storage.py): `storage.upload_file(local_path, key, content_type)` uploads to the configured R2/MinIO bucket and returns a public URL.
- **Drive helpers** — [backend/google_drive_service.py](backend/google_drive_service.py): `extract_folder_id(url)`, `_build_service(refresh_token)`, `download_clip(refresh_token, file_id, dest_path)`. The `download_clip` function is generic — it downloads any Drive file by ID, not just videos.
- **Token store** — [backend/server.py:5191](backend/server.py#L5191) `_get_google_refresh_token()` returns the shared agency Google OAuth refresh token from `db.settings`.
- **Music model** — track documents shape (see [backend/server.py:4225-4235](backend/server.py#L4225-L4235)): `{id, name, filename, r2_url, r2_key, duration, mood_tags, segments, uploaded_at}`.
- **Tagging endpoint** — [backend/server.py:4276](backend/server.py#L4276) `PUT /api/music/{track_id}` accepts `MusicTrackUpdate` (`name`, `mood_tags`, `segments`). The existing inline `MoodTagPicker` in [frontend/src/components/music/MusicTrackCard.js](frontend/src/components/music/MusicTrackCard.js) is already wired to it.
- **Audio playback** — `WaveformEditor` uses WaveSurfer (works inside Edit mode). For the new inline play button we'll use a plain `<audio>` element so we don't depend on the editor being open.

## Out of scope

- Background/Celery jobs for downloads. Import is synchronous from the user's perspective; if folders are large, the import call streams progress responses but does not get queued.
- Bulk auto-tagging via AI. Tags are added manually after import, per user request.
- A separate UI page. Drive import lives as a second button next to "Upload Track" on `MusicLibraryPage`.

---

## Phase 0 — Documentation Discovery (already complete, captured here)

### Allowed APIs

| Concern | Where | Notes |
|---|---|---|
| Build Drive service | `google_drive_service._build_service(refresh_token)` | Raises `GoogleTokenExpiredError` on revoked token |
| Parse folder URL → ID | `extract_folder_id(url_or_id)` | Returns `None` if unparseable |
| List files in folder | `service.files().list(q=..., fields=..., orderBy="name", pageSize=200)` | Pattern shown in `list_clips` ([google_drive_service.py:63-97](backend/google_drive_service.py#L63-L97)) |
| Download a Drive file | `download_clip(refresh_token, file_id, dest_path)` | Generic; safe for audio. Cleans up on failure. |
| Upload to R2 | `storage.upload_file(local_path, key, content_type)` | Returns `""` on failure |
| Get refresh token | `await _get_google_refresh_token()` | Empty string if Drive not connected |
| Audio duration probe | `mutagen` (already in `requirements.txt` — verify in Phase 1) OR `ffprobe` via subprocess | Avoid loading the full file into memory |

### Anti-patterns to avoid

- **Do NOT** add a `list_audio` clone that hardcodes mime types in a different shape from `list_clips`/`list_images`. Match the existing helper signatures.
- **Do NOT** invent a Drive "audio mime filter" — use `mimeType contains 'audio/'` (same pattern `list_clips` uses for video) PLUS an explicit allowlist for `.mp3`/`.wav`/`.ogg` to match what `POST /api/music/upload` already accepts ([backend/server.py:4199-4201](backend/server.py#L4199-L4201)).
- **Do NOT** use `boto3` directly — go through `storage.upload_file`.
- **Do NOT** read the entire downloaded file into memory just to upload it. Stream from a temp file via `storage.upload_file` (which uses `s3.upload_file` under the hood).
- **Do NOT** assume the refresh token exists. Mirror the existing error handling in `sync_drive_clips` ([backend/server.py:5450-5452](backend/server.py#L5450-L5452)).

### Drive mime-type confirmation

Google Drive serves audio files with these mime types (verified from MDN + Google Drive API docs): `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/mp4`, `audio/aac`, `audio/flac`. We will accept the first five (matching what the manual upload endpoint accepts) and skip the rest with a "skipped" count in the response.

---

## Phase 1 — Backend: add `list_audio` to `google_drive_service.py`

### What to implement

Add a `list_audio(refresh_token, folder_id)` function in [backend/google_drive_service.py](backend/google_drive_service.py) that returns audio file metadata from a Drive folder. **Copy the structure of `list_clips` ([backend/google_drive_service.py:63-97](backend/google_drive_service.py#L63-L97))**, swapping the mime filter and the returned metadata shape.

Concrete signature & behavior:

```python
_AUDIO_MIME_TYPES = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg"}
_AUDIO_MIME_QUERY = " or ".join(f"mimeType = '{m}'" for m in sorted(_AUDIO_MIME_TYPES))

def list_audio(refresh_token: str, folder_id: str) -> list[dict]:
    """Return audio file metadata from a Drive folder, ordered by name."""
    # Same paginated loop as list_clips, with this query:
    #   f"'{folder_id}' in parents and trashed=false and ({_AUDIO_MIME_QUERY})"
    # Fields: "nextPageToken,files(id,name,mimeType,size)"
    # Return: [{"drive_file_id": f["id"], "name": f["name"], "mime_type": f["mimeType"], "size": int(f.get("size", 0))}, ...]
```

### Verification

- `grep -n "def list_audio" backend/google_drive_service.py` returns one match.
- Manual: from a Python REPL with the refresh token loaded, call `list_audio(token, "<known folder ID>")` and confirm only audio entries are returned. (Sanity only — not a CI test.)

### Anti-pattern guards

- Do not add the `videoMediaMetadata` field to the request — audio files don't carry it.
- Do not call `_build_service` more than once per invocation.

---

## Phase 2 — Backend: Drive-import endpoints in `server.py`

Add two endpoints near the existing music routes ([backend/server.py:4186-4295](backend/server.py#L4186-L4295)). The first lets the UI preview what's in the folder; the second performs the actual import.

### 2a. `GET /api/music/drive/list`

Query params: `folder` (string — Drive URL or ID).

Logic (copy the pattern of `sync_drive_clips` at [backend/server.py:5436-5476](backend/server.py#L5436-L5476)):

1. `folder_id = extract_folder_id(folder)` → 400 if `None`.
2. `refresh_token = await _get_google_refresh_token()` → 400 if empty (message: "Google account not connected. Visit /api/auth/google/start to connect.").
3. Run `list_audio` in the executor (`loop.run_in_executor(None, list_audio, refresh_token, folder_id)`) — same offload pattern as `list_clips`.
4. Cross-reference with `db.music_tracks` on a new optional field `drive_file_id`: each returned item gets `"already_imported": bool`. **This is required so the UI can disable the checkbox for files that have already been imported.** Add the `drive_file_id` field to the doc shape in Phase 2b — it does NOT need a migration since old tracks will have `None`.
5. Catch `GoogleTokenExpiredError` → return 400 with the re-auth message.

Response: `{"folder_id": "...", "items": [{drive_file_id, name, mime_type, size, already_imported}, ...]}`.

### 2b. `POST /api/music/drive/import`

Body (Pydantic model — define alongside `MusicTrackUpdate` at [backend/server.py:3327](backend/server.py#L3327)):

```python
class DriveMusicImportRequest(BaseModel):
    folder: str                       # raw URL or ID — re-extracted server-side
    drive_file_ids: List[str]         # subset the user picked
    mood_tags: List[str] = []         # optional default tags applied to every imported track
```

Logic for each `drive_file_id`:

1. Skip if a track with that `drive_file_id` already exists in `db.music_tracks` (count as "skipped").
2. Look up its metadata in the previously-fetched list. If the file is no longer in the folder, count as "failed" with reason "not_found".
3. `track_id = uuid.uuid4()`, `ext = os.path.splitext(name)[1] or ".mp3"`, `tmp_path = tempfile.mkstemp(suffix=ext)`.
4. `await loop.run_in_executor(None, download_clip, refresh_token, drive_file_id, tmp_path)`.
5. Probe duration: try `mutagen.File(tmp_path).info.length`; fall back to `0.0` if it fails. (Confirm `mutagen` is in `requirements.txt`; if not, add it — it's tiny and dependency-free.)
6. `r2_key = f"music/{track_id}{ext}"`.
7. `r2_url = storage.upload_file(tmp_path, r2_key, content_type=mime_type)` — 500 if `""` returned.
8. Insert doc shaped exactly like the manual upload at [backend/server.py:4225-4236](backend/server.py#L4225-L4236), **plus** `"drive_file_id": drive_file_id` and `"source": "drive"`.
9. `os.unlink(tmp_path)` in `finally`.

Response: `{"imported": [<full track docs>], "skipped": [{drive_file_id, reason}], "failed": [{drive_file_id, reason}]}`.

### Documentation references

- Pattern to copy: `sync_drive_clips` for token+folder validation; `upload_music_track` for the doc shape; `_drive_image_to_r2`-style temp-file flow (search for "tempfile" near image sync code — same shape).
- Storage call signature: see [backend/storage.py:152-178](backend/storage.py#L152-L178).

### Verification

- `grep -n "/music/drive/list\|/music/drive/import" backend/server.py` returns two matches.
- `pytest backend/tests/test_music_api.py -v` still passes (no regression on existing music endpoints).
- Add a new test `test_music_drive_import.py` that monkeypatches `list_audio`, `download_clip`, and `storage.upload_file` and asserts: (a) skipped path when `drive_file_id` already exists; (b) doc shape includes `drive_file_id` and `source: "drive"`; (c) failed-file path returns 200 with the failure in the `failed` array (not a 500).

### Anti-pattern guards

- Do not write to MongoDB *before* the storage upload succeeds.
- Do not use the request body's `folder` to bypass folder-membership check: re-list the folder server-side and only accept `drive_file_ids` that are present. Prevents an attacker from passing arbitrary Drive file IDs they shouldn't have access to.
- Do not block the event loop with `download_clip` — always wrap in `loop.run_in_executor`.

---

## Phase 3 — Frontend: Drive import UI

### What to implement

Add an "Import from Drive" button next to the existing "Upload Track" button on [frontend/src/pages/MusicLibraryPage.js:51-58](frontend/src/pages/MusicLibraryPage.js#L51-L58). Clicking opens a new modal `MusicDriveImportModal` at `frontend/src/components/music/MusicDriveImportModal.js`.

Modal flow (single component, three local states: `idle | listing | importing`):

1. **Input row** — text field for Drive folder URL/ID, "List Files" button.
2. **List view** — after `GET /api/music/drive/list?folder=...` returns, render each item as a row with: checkbox (disabled + greyed if `already_imported`), filename, size (formatted MB), and a small "preview" link that opens `https://drive.google.com/file/d/{drive_file_id}/view` in a new tab. Add "Select all" / "Select none" buttons.
3. **Optional default tags** — reuse `MoodTagPicker` (already exists at [frontend/src/components/music/MoodTagPicker.js](frontend/src/components/music/MoodTagPicker.js)) for an "apply these tags to all imported tracks" picker.
4. **Import button** — `POST /api/music/drive/import` with `{folder, drive_file_ids, mood_tags}`. Show per-file status in a progress list as the response streams back (server returns all results in one response — no streaming needed for v1; per-row UI just updates from the final response).
5. On success, call `onImported(track[])` (the array of new docs), close, and toast `"Imported N tracks (M skipped)"`.

Use `MusicUploadModal` ([frontend/src/components/music/MusicUploadModal.js](frontend/src/components/music/MusicUploadModal.js)) as the styling and structure template — same dark-zinc shell, same toast usage, same `API` constant.

### Wiring

In `MusicLibraryPage`:

```js
const handleImported = (newTracks) => {
  setTracks((prev) => [...newTracks, ...prev]);
};
```

Add `<MusicDriveImportModal open={showDriveImport} onClose={...} onImported={handleImported} />` next to the existing `MusicUploadModal`.

### Verification

- Visual: `yarn start` in `frontend/`, log in, navigate to `/music`, click new button, paste a Drive folder URL, see the list, import a few. New tracks appear at the top of the library.
- Existing test suite: `yarn test` in `frontend/` — should pass without changes since `MusicTrackCard.test.js` and `MusicLibraryPage.test.js` don't reach into the new modal.

### Anti-pattern guards

- Do not bypass the `axios.defaults.headers.common["Authorization"]` setup — the modal must use the same `axios` instance as the rest of the app so the JWT auto-attaches.
- Do not call `/api/music/drive/list` on every keystroke — only on explicit "List Files" click.
- Do not write a duplicate `MOOD_TAGS` constant — import from `frontend/src/constants/videoStyles.js`.

---

## Phase 4 — Custom tags (backend + frontend)

The current `MoodTagPicker` ([frontend/src/components/music/MoodTagPicker.js:1-4](frontend/src/components/music/MoodTagPicker.js#L1-L4)) has 9 hardcoded tags. `MusicLibraryPage.js:10` also hardcodes the same list for the filter bar. Replace both with a dynamic catalog the user can extend from the UI.

### Design summary

Tags live in two places that are merged at read time:

1. **Curated tags** — explicitly created/deleted by the user, stored in `db.settings` under key `music_tags` (a list of strings). Singleton, matches the same pattern as the existing `"global"` settings doc and the `"google_refresh_token"` setting.
2. **Inferred tags** — distinct values pulled from `db.music_tracks.mood_tags` (so a tag that's been applied to at least one track always appears, even if the user never explicitly "created" it).

The `GET /api/music/tags` endpoint returns the union, deduped and sorted. This means "create a tag" is just appending a string to the curated list, no schema migration, and existing track tags keep working untouched.

### 4a. Backend — three endpoints in `server.py`

Add next to the music routes ([backend/server.py:4186-4295](backend/server.py#L4186-L4295)):

```python
class MusicTagCreate(BaseModel):
    tag: str   # lowercased + stripped server-side
```

- `GET /api/music/tags` → returns `{"tags": [<sorted unique strings>]}`. Implementation:
  1. `curated = (await db.settings.find_one({"key": "music_tags"})) or {}`
  2. `curated_list = curated.get("value", [])`
  3. `inferred = await db.music_tracks.distinct("mood_tags")` (MongoDB built-in — returns flattened distinct array values).
  4. Return `sorted(set(curated_list) | set(t for t in inferred if t))`.

- `POST /api/music/tags` body `MusicTagCreate` → `tag = data.tag.strip().lower()`; 400 if empty or longer than 32 chars or contains anything other than `[a-z0-9 _-]`. `$addToSet` onto `db.settings` doc with key `music_tags` (upsert). Return the full updated tag list.

- `DELETE /api/music/tags/{tag}` → `$pull` from the curated list. **Does NOT untag tracks** — only removes from the curated set. Document this in the docstring. Return the full updated tag list.

### 4b. Frontend — extend `MoodTagPicker` and `MusicLibraryPage`

**`MoodTagPicker`** ([frontend/src/components/music/MoodTagPicker.js](frontend/src/components/music/MoodTagPicker.js)) — replace the hardcoded `ALL_TAGS` with a dynamic catalog fetched once on mount via a tiny hook:

```js
// frontend/src/hooks/useMusicTags.js (new file)
// Exports { tags, refresh, createTag, deleteTag }
// Internally caches in a module-level variable + listeners so all
// MoodTagPicker instances stay in sync without prop-drilling.
```

The picker UI gains:
- An inline `+ New tag` button that opens a small text input. On Enter/blur, calls `createTag(value)`; on success, the new tag appears as an active chip (auto-selected for convenience) and the catalog refresh fires so every other open picker re-renders with the new tag.
- A small `×` on each chip *in an "edit catalog" mode* (toggle pencil icon in the corner of the picker) that calls `deleteTag(tag)`. This is hidden by default so accidental clicks during normal tagging don't delete from the catalog. Confirm with `window.confirm("Remove '<tag>' from the catalog? Existing tracks tagged with it will keep the tag.")`.

**`MusicLibraryPage`** — delete the hardcoded `MOOD_FILTERS = [...]` at [frontend/src/pages/MusicLibraryPage.js:10](frontend/src/pages/MusicLibraryPage.js#L10). Replace with `useMusicTags()` so the filter bar lists all known tags. Keep `"all"` as the first chip (hardcoded, since it's not a real tag).

### 4c. Migrate other usages

`MusicUploadModal` ([frontend/src/components/music/MusicUploadModal.js](frontend/src/components/music/MusicUploadModal.js)) and the planned `MusicDriveImportModal` (Phase 3) both use `MoodTagPicker` — no change needed there since the picker handles its own catalog.

**Delete dead code**: the unused files [frontend/src/pages/MusicLibrary.js](frontend/src/pages/MusicLibrary.js), [frontend/src/components/MusicUploadModal.js](frontend/src/components/MusicUploadModal.js), and [frontend/src/components/WaveformEditor.js](frontend/src/components/WaveformEditor.js) all import from a missing `../constants/videoStyles` file (the import would fail at build time, confirming they are not part of the active route tree — `MusicLibraryPage` and `components/music/*` are the live ones). Confirm with `grep -rn "videoStyles" frontend/src/` and `grep -rn "from.*MusicLibrary'" frontend/src/` before deleting. If grep returns no live importers, delete these three files in this phase to prevent confusion.

### Verification

- `curl http://localhost:8000/api/music/tags` returns the 9 historical tags (because they're inferred from existing tracks) even before any explicit creation.
- Create a tag via the UI; it appears in the picker on every open card without a reload (catalog sync via the hook).
- Delete a tag from the catalog; the tag chip disappears from the filter bar but a track previously tagged with it still shows the tag in its card chips.
- Apply a brand-new free-text tag to a track; refresh the page; the tag now appears in `GET /api/music/tags` even if it was never explicitly "created" (because of the `distinct` inference).
- `pytest backend/tests/ -v` — pass.
- `yarn test --watchAll=false` — pass.

### Anti-pattern guards

- Do not add a separate `db.music_tags` collection — overkill, and the `db.settings` singleton + `distinct` aggregate matches existing patterns (see how `google_refresh_token` is stored).
- Do not let tag creation cascade-write to every track. Creation just adds the string to the curated list; tracks are only updated when the user explicitly applies the tag.
- Do not delete the tag *value* from existing tracks when removing from the catalog — confirms the user's intent (catalog vs data are separate).
- Do not store tags as a comma-joined string. They are a list of strings already (`mood_tags`), keep it that way.
- Do not skip server-side validation of the tag string — accept only `[a-z0-9 _-]`, max 32 chars, after `.strip().lower()`.

---

## Phase 5 — Frontend: inline play button on the track card

### What to implement

Add a play/pause button on [frontend/src/components/music/MusicTrackCard.js](frontend/src/components/music/MusicTrackCard.js) between the icon block ([line 53-55](frontend/src/components/music/MusicTrackCard.js#L53-L55)) and the title block, so users can preview without entering Edit mode.

Implementation:

- A `useRef` for the `<audio>` element + a `playing` state.
- Mount `<audio ref={audioRef} src={track.r2_url} preload="none" onEnded={() => setPlaying(false)} />` inside the card (hidden — no controls attribute).
- Replace the static `Music` icon button with a click target: when not playing, show the `Play` icon (lucide-react); when playing, show `Pause`. Click toggles `audioRef.current.play()` / `.pause()`.
- **Lift "currently playing track" state up to `MusicLibraryPage`** via a small `playingTrackId` state + `onPlay(id)` callback, so starting playback on one card stops any other card. (Without this, two cards can play over each other.)

Concrete pattern — `MusicLibraryPage` owns `[playingId, setPlayingId]`; passes `isPlaying={playingId === track.id}` and `onPlay={() => setPlayingId(track.id)}`, `onPause={() => setPlayingId(null)}` to each `MusicTrackCard`. The card's `useEffect([isPlaying])` calls `audioRef.current.play()` or `.pause()` accordingly.

### Verification

- Visual: click play on track A, then on track B — A pauses automatically.
- `preload="none"` confirmed in DevTools network tab — no audio loads until the user clicks play. (Critical because a library page with 50 tracks would otherwise fetch 50 MP3s on mount.)
- `MusicTrackCard.test.js` still passes — if the new prop shape breaks it, update the test to pass the new `isPlaying`/`onPlay`/`onPause` props.

### Anti-pattern guards

- Do not use the WaveformEditor for the inline preview — it's heavy (WaveSurfer + waveform render) and only needed for segment editing.
- Do not autoplay on mount.
- Do not set `audioRef.current.currentTime = 0` on pause — let the user resume where they paused.

---

## Phase 6 — Verification

### Run

1. `pytest backend/tests/ -v` — all green, including the new `test_music_drive_import.py`.
2. `cd frontend && yarn test --watchAll=false` — all green.
3. Manual smoke test:
   - Visit `/music` in the running app.
   - Click "Import from Drive", paste a folder URL containing at least 2 MP3s, list them, select both, import.
   - Confirm both appear at the top of the library with the default mood tags applied.
   - In the filter bar, click `+ New tag`, type `acoustic`, hit Enter — chip appears. Apply it to one track. Refresh page — chip persists, appears in the filter bar.
   - Toggle the catalog edit mode, click `×` on `acoustic`, confirm dialog. Filter chip disappears, but the track's `acoustic` chip is still present (data preserved).
   - Click the play button on one — it plays. Click play on the other — first pauses, second plays.
   - Click "Edit" on one, add a mood tag, save — confirm the tag persists after reload.
   - Open the imported track row in MongoDB and verify the doc has `drive_file_id`, `source: "drive"`, and a non-zero `duration`.

### Anti-pattern grep checks

- `grep -rn "import boto3" backend/server.py` — should not appear in the new code (must use `storage.py`).
- `grep -n "videoMediaMetadata" backend/google_drive_service.py` — should appear only inside `list_clips`, not in `list_audio`.
- `grep -rn "audio.*autoPlay\|autoplay" frontend/src/components/music/` — should return nothing.
- `grep -n "drive_file_id" backend/server.py` — should appear in (a) the new import endpoint, (b) the new list endpoint's `already_imported` check, and (c) the inserted doc shape — nowhere else.

### Sign-off criteria

- A user can paste a Drive folder URL, pick which audio files to import, and have them appear in the library with files actually stored in R2 (verify in R2 console — `music/<uuid>.mp3` keys exist).
- Manual mood tagging via the existing inline picker continues to work on imported tracks.
- A play button on each card previews the audio with single-track-at-a-time playback.
- No regression on the existing `POST /api/music/upload` manual-upload flow.
