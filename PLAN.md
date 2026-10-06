# Ethnoguessr 2.0 — Plan

A small geography game for friends and family: look at a composite face
averaged from many people born in the same place, then drop a pin where you
think that place is.

## Decisions so far

| Decision | Choice | Why |
|---|---|---|
| What a round's label means | **Where people were born** (birthplace), not ethnicity or ancestry | Sources record it reliably, and it keeps the game about geography |
| Primary data source | Wikidata (birthplace P19 + coordinates, sex P21, birth date P569, image P18) → Wikimedia Commons photos | Free licenses and global coverage: ~1.8k–180k candidate people per country |
| Second source (later) | National legislature portraits (EveryPolitician archive + parliament sites) | Uniform headshots, and constituencies give sub-national regions |
| Audience | Friends and family: open to anyone with the URL (`noindex`, not publicized); optional passcode gate via `PASSCODE`; optional accounts | Personal use. CC-BY-SA attribution honored (credits page per round) |
| Stack | SvelteKit 2 + Svelte 5 runes, Tailwind 4, adapter-node, Leaflet with no tiles (Natural Earth countries from `world-atlas`) | Small, fast, one Node process. No tile server and no map labels giving answers away |
| Pipeline language | Python 3.12 (`pipeline/requirements.txt`), CPU only | MediaPipe/OpenCV/numpy |
| Composites | Separate male and female composites per place | Mixed-sex averages look muddy |

## Phases

### Phase 1 — Site skeleton ✅ (2026-10-06)
- [x] SvelteKit app: home, daily (5 rounds, same for everyone, ET midnight rollover), endless, summary + share card, about, per-round credits
- [x] Optional passcode gate (hooks.server.ts, on only when `PASSCODE` is set), signed cookie, per-IP lockout. Off for launch
- [x] Answers stay server-side: the client sees opaque `pid`s, and `/api/reveal` scores a guess
- [x] Faces served through `/api/face/[pid]` (behind the gate), not `static/`
- [x] Demo manifest + placeholder face so the UI works before any data exists
- [x] Dockerfile (read-only rootfs) behind a reverse proxy

### Phase 2 — Data pipeline ✅ built (2026-10-06), full run in progress
`pipeline/eg.py` (one file; run with `python -I`). Stages: `harvest`, `download`, `faces`, `composite`, `publish`, or `all` (country by country, then publish). Every stage caches and resumes. A full run over the 97 countries in `COUNTRIES` takes about 9–10 h, almost all of it Commons downloads (throttled to ~3 images/s). Log: `data/work/run.log`.

What it does now (differences from the original sketch noted):

1. **Harvest**: SPARQL per country and sex, over-fetching 6× then sampling 320 so results aren't just the oldest/most famous items. Birthplace country = the place's *current* country (P17). Keep humans with P18 image, P19 birthplace (with P625 coordinates, or the country's when missing), P21 sex, and P569 birth year ≥ 1940 (old photos skew tone and quality). Store rows in `data/raw/<CC>.jsonl`. Respect WDQS limits: one query at a time and a descriptive User-Agent.
2. **Download**: 960px thumbnails (a standard Wikimedia step) via the `imageinfo` API, which also returns the license and author in the same call. Pull license and author from the Commons API (`imageinfo` + `extmetadata`) and keep only CC0, PD, CC-BY and CC-BY-SA. Cache to `data/raw/img/`.
3. **Detect + filter**: OpenCV YuNet finds faces (MediaPipe's own detector is selfie-range and missed ~25%), and the crop goes to the MediaPipe Face Landmarker (478 points). Yield is ~40–45% of downloaded images. Keep only images with exactly one face, inter-ocular distance ≥ 60px, |yaw| and |pitch| < ~15°, not blurry (Laplacian variance), and color (not grayscale). Log rejects with a reason so the thresholds can be tuned.
4. **Align + average**: canvas 640², mesh plus two synthetic rings around the head so hair and neck warp smoothly, vectorized piecewise-affine warp (`Warper`, one `cv2.remap` per face). MediaPipe multiclass segmentation cuts each face from its background. Only confident foreground contributes color. The average is in linear light, weighted by source resolution, desaturated outside the face oval (calms headwrap and hair color speckle), and placed on a radial studio backdrop with the body faded out. Originally planned as: similarity-align on the eye centers into a 600×600 frame, compute the mean landmark shape, warp each face piecewise-affine over Delaunay triangles onto the mean shape, then take the pixel mean. Optional per-image color normalization before averaging (gray-world or LAB mean matching), so lighting doesn't dominate. Crop and feather to an oval or soft vignette. Output `faces/<id>.webp`.
5. **Publish**: answer point = **medoid** of the birthplaces used (always a real place, never the sea between islands); `radiusKm` = 0.6 × median distance from it, clamped 75–400 km. Swaps files into `data/public` (a bind mount, so it's done in place), manifest last. Originally planned as: write `data/public/rounds.json`, `faces/`, `credits/<id>.json`. Set the answer point to the mean of the birthplace coordinates of the faces actually used. Write `rounds.json` last (atomically) so the app never sees a half-published set.

Minimum faces per composite: **25** (target 40+). Fewer gets noisy and starts to look like an identifiable individual.

### Phase 3 — Breadth and quality
- All countries reaching N ≥ 20 per sex. Look at the per-country yield and decide the cutoffs.
- Sub-national rounds where data is dense: US states, Indian states, Chinese provinces, Nigerian states, Brazilian states. Adds `region` (ISO 3166-2) to the manifest.
- Legislature portraits as a second source (consistent lighting and pose = better composites).
- A manual review page (local only) to drop bad composites before publishing.
- `radiusKm` per round: about the region's size, so a pin inside the country gets full marks.

### Phase 4 — Game features
- [x] Email/password accounts (SQLite), daily results saved server-side and re-scored, streaks across devices
- [x] Opt-in 7am daily email (confirmed addresses only), unsubscribe, password reset
- Leaderboard for the daily (accounts exist now; needs display names and privacy choices).
- Polygon-based scoring: full points for a pin inside the right country or region (needs the boundary in the manifest or a lookup).
- Hints (continent reveal for half points), a timer mode, a "World Cup" mode (national-team composites).
- Mobile polish: map-first layout with the face as a collapsible overlay.

## Data contract (pipeline → site)

`DATA_DIR` (production: `/app/data`, bind-mounted from `data/public`):

```
rounds.json          # Manifest (src/lib/types.ts)
faces/<image>        # webp/jpg/png/svg, referenced by rounds[].image
credits/<file>.json  # Credit[] (src/lib/types.ts), referenced by rounds[].credits
```

```jsonc
{
  "version": 1,
  "generated": "2026-10-06T00:00:00Z",
  "rounds": [
    {
      "id": "NG-m",            // stable; also the input to the opaque pid
      "label": "Nigeria",      // shown on reveal
      "country": "NG",         // ISO 3166-1 alpha-2
      "region": "NG-LA",       // optional ISO 3166-2
      "lat": 9.1, "lng": 7.4,  // answer point
      "radiusKm": 150,         // optional: full points inside this
      "sex": "m",              // m | f | mixed
      "n": 42,                 // faces averaged
      "image": "NG-m.webp",
      "credits": "NG-m.json"
    }
  ]
}
```

The app re-reads `rounds.json` when its mtime changes. If it's missing, the
bundled `demo/` is served instead (with a "demo data" banner).

Changing a round's `id` changes its pid, which breaks any half-finished daily
in players' browsers for that day only. Harmless, but don't churn ids for fun.

## Privacy and licensing notes
- Only composites, the manifest and credits are published. Raw photos, landmarks and per-person crops stay in `data/raw` and `data/work` (git-ignored, never mounted).
- Landmarks are biometric data. Don't keep them longer than a pipeline run needs, and never publish them.
- Composites are derivative works of CC-BY-SA photos: keep the per-round credits accurate.
- Keep the framing on birthplace. The about page spells out the sample bias (public figures), birthplace ≠ heritage, and photo-condition effects.

## Open questions
- Granularity for v1: countries only, or start sub-national for the densest few?
- Include a `mixed` composite per place, or only m/f?
- Leaderboard: worth adding a database, or is the share card enough?
