# Plan: Video Size & Duration Limits

**Goal:**
1. At upload time — reject any clip over **100 MB** or longer than **60 seconds**
2. At processing time — reject inputs that exceed those limits before FFmpeg runs
3. After FFmpeg produces the output — if output is over **50 MB**, re-encode with a calculated bitrate to bring it under

---

## Phase 0: Findings Summary (Complete)

### Audit sources
| File | Relevant lines |
|---|---|
| `backend/server.py` | `upload_clip` → 4809–4842 |
| `video_processor/service.py` | `create_video_post` → 352–468; `assemble_video` → 176–310 |
| `frontend/src/components/ClipPickerModal.js` | `handleUpload` → 40–57; file-type filter → 62; hint text → 183 |

### Key facts
- `upload_clip` does `content = await file.read()` with **no size check** and stores `"duration": 0` — never probed
- `ffmpeg-python` is already imported in `video_processor/service.py`; `ffmpeg.probe(path)` returns `probe["format"]["duration"]` as a string of seconds
- `assemble_video` encodes with `preset="ultrafast"` — fast but poor compression; produces large output files
- `create_video_post` already wraps `assemble_video` in `run_in_executor` — ffmpeg calls are synchronous and safe there
- `storage.upload_file(local_path, key, content_type)` is the upload call at `service.py:429`
- Output file is at `output_path = TEMP_DIR / f"{job_id}_output.mp4"` — on disk before upload, so size check is just `os.path.getsize(output_path)`
- Trim duration = `trim_end - trim_start` when both set; otherwise probe input for total duration then subtract `trim_start`

### Allowed APIs
- `ffmpeg.probe(path)` → `{"format": {"duration": "59.9"}, "streams": [...]}`  (synchronous, run in executor in async context)
- `os.path.getsize(path)` → bytes
- `asyncio.get_running_loop().run_in_executor(None, callable, *args)` — for sync calls inside async handlers
- `ffmpeg.output(..., vcodec="libx264", acodec="aac", video_bitrate="1200k", audio_bitrate="128k", preset="medium").overwrite_output().run()` — for re-encode pass

### Anti-patterns to avoid
- Do NOT use `file.read()` before a size check when `Content-Length` is available — check the header first to fail fast
- Do NOT invent `ffmpeg.probe` fields that don't exist — only use `probe["format"]["duration"]`
- Do NOT set `crf` alone to target a file size — use `-b:v` (VBR bitrate) when you need a size ceiling
- Do NOT probe the input inside `assemble_video` — pass `clip_duration` (already passed as a param at `service.py:422`) so no second probe is needed

---

## Phase 1: Upload validation — `backend/server.py:upload_clip`

**What to change:** `upload_clip` at `server.py:4809–4842`

**Steps:**

1. **Fast-fail on Content-Length header** (before reading any bytes):
   ```python
   MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
   MAX_DURATION_SEC = 60.0

   content_length = request.headers.get("content-length")
   if content_length and int(content_length) > MAX_UPLOAD_BYTES:
       raise HTTPException(413, "Video must be under 100 MB")
   ```
   Add `request: Request` as a parameter to `upload_clip`.

2. **Check actual byte length after read:**
   ```python
   content = await file.read()
   if len(content) > MAX_UPLOAD_BYTES:
       raise HTTPException(413, "Video must be under 100 MB")
   ```

3. **Write to temp file then probe duration with ffmpeg.probe** (run in executor):
   ```python
   import ffmpeg as _ffmpeg
   loop = asyncio.get_running_loop()
   try:
       probe = await loop.run_in_executor(None, _ffmpeg.probe, tmp_path)
       duration = float(probe["format"]["duration"])
   except Exception:
       duration = 0.0

   if duration > MAX_DURATION_SEC:
       raise HTTPException(400, f"Video must be 60 seconds or shorter (this clip is {duration:.0f}s)")
   ```

4. **Store real duration** in the clip document instead of `0`:
   ```python
   "duration": duration,
   ```

**Reference:** Existing pattern for file size check at `server.py:1798–1801` (5 MB image check).

**Verification:**
```bash
grep -n "MAX_UPLOAD_BYTES\|MAX_DURATION\|413\|duration" backend/server.py | grep -A2 "upload_clip"
```
- Upload a 101 MB file → HTTP 413
- Upload a 61-second clip → HTTP 400
- Upload valid clip → `duration` field in response is non-zero

---

## Phase 2: Pre-processing validation — `video_processor/service.py:create_video_post`

**What to change:** `create_video_post` at `service.py:352–468`, after step 4 (download clip) and before step 5 (load template).

**Steps:**

Insert after the download block (after `input_path` is populated):

```python
# ── Input validation ──────────────────────────────────────────────────────
MAX_INPUT_BYTES   = 100 * 1024 * 1024   # 100 MB
MAX_DURATION_SEC  = 60.0

input_size = os.path.getsize(input_path)
if input_size > MAX_INPUT_BYTES:
    raise ValueError(
        f"Input clip is {input_size / 1024 / 1024:.1f} MB — must be under 100 MB"
    )

try:
    probe     = await asyncio.get_running_loop().run_in_executor(None, ffmpeg.probe, input_path)
    raw_dur   = float(probe["format"]["duration"])
except Exception:
    raw_dur   = clip.get("duration") or 0.0

# Effective duration after trim
trim_end_eff  = clip_trim_end if clip_trim_end is not None else raw_dur
effective_dur = trim_end_eff - clip_trim_start

if effective_dur > MAX_DURATION_SEC:
    raise ValueError(
        f"Clip segment is {effective_dur:.0f}s — must be 60 seconds or shorter "
        f"(adjust trim handles to shorten it)"
    )
```

**Why `effective_dur`:** The user might upload a 90-second clip but trim it to 45 seconds. The 100 MB / 60s limit applies to the actual segment being processed, not the raw clip.

**Verification:**
- Pass a clip with `clip_trim_end - clip_trim_start = 90` → job fails with clear `ValueError`
- Pass a valid short clip → proceeds to step 5

---

## Phase 3: Output size enforcement — `video_processor/service.py`

**What to change:** `create_video_post` at `service.py`, after step 6 (`assemble_video`) and before step 7 (R2 upload).

### 3a — Add `compress_to_target` helper (add near top of `service.py`, after `assemble_video`)

```python
MAX_OUTPUT_BYTES = 50 * 1024 * 1024   # 50 MB
AUDIO_BITRATE_KBPS = 128

def compress_to_target(input_path: str, output_path: str, duration_sec: float) -> None:
    """Re-encode video to fit under MAX_OUTPUT_BYTES using calculated bitrate."""
    total_kbps    = int((MAX_OUTPUT_BYTES * 8) / (duration_sec * 1024))
    video_kbps    = max(300, total_kbps - AUDIO_BITRATE_KBPS)
    logger.info(f"Compressing to ~{video_kbps}kbps video to stay under 50 MB")
    compressed    = input_path + "_compressed.mp4"
    try:
        (
            ffmpeg
            .input(input_path)
            .output(
                compressed,
                vcodec="libx264",
                video_bitrate=f"{video_kbps}k",
                acodec="aac",
                audio_bitrate=f"{AUDIO_BITRATE_KBPS}k",
                preset="medium",
                loglevel="error",
            )
            .overwrite_output()
            .run()
        )
        os.replace(compressed, output_path)   # atomic rename over original
    except Exception:
        try:
            Path(compressed).unlink(missing_ok=True)
        except Exception:
            pass
        raise
```

**Why `preset="medium"`:** `ultrafast` (used in `assemble_video`) trades compression for speed — output is large. `medium` gives better compression for the re-encode pass without being slow.

### 3b — Call it in `create_video_post` after step 6

```python
# 6. Assemble with FFmpeg
await asyncio.get_running_loop().run_in_executor(
    None, assemble_video,
    input_path, output_path, template,
    clip_trim_start, clip_trim_end, clip.get("duration"),
)

# 6b. Enforce 50 MB output ceiling
output_size = os.path.getsize(output_path)
if output_size > MAX_OUTPUT_BYTES:
    logger.info(
        f"Output is {output_size / 1024 / 1024:.1f} MB — re-encoding to fit under 50 MB"
    )
    await asyncio.get_running_loop().run_in_executor(
        None, compress_to_target, output_path, output_path, effective_dur
    )

# 7. Upload to R2
```

`effective_dur` is already computed in Phase 2 and available in scope.

**Verification:**
- Generate a long or high-bitrate clip → log line "re-encoding to fit under 50 MB" appears
- `os.path.getsize(output_path)` after step 6b is ≤ 52,428,800 bytes (tiny margin from VBR)
- `grep "compress_to_target\|MAX_OUTPUT_BYTES" video_processor/service.py`

---

## Phase 4: Frontend — `ClipPickerModal.js`

**What to change:** `frontend/src/components/ClipPickerModal.js:handleUpload` and the hint text.

**Steps:**

1. **Add client-side size + MIME check before upload** (reference: existing file-type check at line 62):
   ```js
   async function handleUpload(file) {
     if (!file) return;
     if (!file.type.startsWith("video/"))
       return toast.error("Please select a video file");
     if (file.size > 100 * 1024 * 1024)
       return toast.error("Video must be under 100 MB");
     // existing upload logic follows...
   ```

2. **Update hint text** (line 183) from `"MP4, MOV, WebM · max 500 MB recommended"` to:
   ```
   MP4, MOV, WebM · max 100 MB · max 60 seconds
   ```

**Why client-side too:** Avoids wasting the user's bandwidth uploading a file the server will reject. The server still validates authoritatively.

**Verification:**
- Select a 200 MB file → toast error before any network request fires
- Hint text shows correct limits

---

## Phase 5: Final verification

```bash
# 1. Grep confirms all three limit constants exist
grep -rn "MAX_UPLOAD_BYTES\|MAX_DURATION_SEC\|MAX_OUTPUT_BYTES" backend/server.py video_processor/service.py

# 2. No 500 MB or unlimited language in frontend
grep -rn "500 MB\|500mb" frontend/src/

# 3. upload_clip stores real duration
grep -n '"duration"' backend/server.py | grep "upload_clip\|probe"

# 4. compress_to_target is called after assemble_video
grep -n "compress_to_target\|output_size" video_processor/service.py
```

**Manual test matrix:**

| Scenario | Expected result |
|---|---|
| Upload 101 MB file | HTTP 413 from `upload_clip` |
| Upload 61-second clip | HTTP 400 from `upload_clip` |
| Upload 50 MB / 30s clip | Accepted, `duration ≈ 30.0` in response |
| Process clip with trim making it 65s | `ValueError` from `create_video_post`, job fails |
| Process valid clip, output > 50 MB | Re-encode fires, final upload is ≤ 50 MB |
| Process valid clip, output ≤ 50 MB | No re-encode, upload proceeds directly |
