# pipeline/

Builds the composites the site serves. Everything is in `eg.py` (run it with
`python -I` from the repo root; see CLAUDE.md for commands and PLAN.md > Phase 2
for what each stage does).

| Stage | Out |
|---|---|
| `harvest` | `data/raw/people/<CC>.jsonl`: person, sex, birth year, birthplace + coords, Commons file |
| `download` | `data/raw/meta/<CC>.json` (license, author, thumb URL), `data/raw/img/` |
| `faces` | `data/work/faces/<CC>.jsonl` (ok / reject reason, pose, size, sharpness), `data/work/landmarks/` |
| `composite` | `data/work/composites/<CC>-<m|f>.{webp,json}` |
| `publish` | `data/public/{rounds.json,faces/,credits/}` |

Models live in `.cache/models/` (git-ignored):

- `face_detection_yunet_2023mar.onnx`: https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
- `face_landmarker.task`: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
- `selfie_multiclass_256x256.tflite`: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
