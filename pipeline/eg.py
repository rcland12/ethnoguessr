#!/usr/bin/env python3
"""Ethnoguessr data pipeline.

One file on purpose: it's run with `python -I` (it reads downloaded images),
which keeps the script's own directory off sys.path, so sibling modules
wouldn't import.

    pip install -r pipeline/requirements.txt   # once, in a venv
    python -I pipeline/eg.py harvest  [CC ...]   # Wikidata -> data/raw/people/<CC>.jsonl
    python -I pipeline/eg.py download [CC ...]   # Commons metadata + thumbnails
    python -I pipeline/eg.py faces    [CC ...]   # landmarks + quality filter
    python -I pipeline/eg.py composite [CC ...]  # aligned, segmented average faces
    python -I pipeline/eg.py publish              # data/public (what the site serves)
    python -I pipeline/eg.py all      [CC ...]   # all of the above

Every stage caches its output and skips work already done, so re-running is
cheap and an interrupted run resumes. With no country codes, every country in
COUNTRIES is processed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import re
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
WORK = DATA / "work"
PUBLIC = DATA / "public"
MODELS = Path(__file__).resolve().parent / ".cache" / "models"

# Wikimedia asks every client to identify itself with a way to reach its
# operator. EG_CONTACT overrides the default (the project's repository).
USER_AGENT = (
    "Ethnoguessr/2.0 (geography game; "
    f"{os.environ.get('EG_CONTACT', 'https://github.com/rcland12/ethnoguessr')}) python-requests"
)

# Tuning ---------------------------------------------------------------------

#: Candidates pulled from Wikidata per country and sex (before any filtering).
CANDIDATES_PER_SEX = 320
#: Born on or after this year: older photos are mostly black-and-white scans.
MIN_BIRTH_YEAR = 1945
#: Commons thumbnail width. 960 is one of Wikimedia's standard thumbnail steps.
THUMB_WIDTH = 960
#: Faces averaged into one composite (best-quality first). Fewer -> noisy and
#: closer to an identifiable individual.
MIN_FACES = 25
MAX_FACES = 80

#: Composite canvas, and where the eyes land on it.
SIZE = 640
EYE_Y = 0.45
EYE_DIST = 0.25  # inter-ocular distance as a fraction of SIZE

ALLOWED_LICENSE = re.compile(r"^(cc0|public domain|pd\b|cc[ -]by(-sa)?[ -]?\d|cc[ -]by(-sa)?$|attribution)", re.I)

# Countries ------------------------------------------------------------------

#: ISO 3166-1 alpha-2 -> display label. Order is just for readable logs.
COUNTRIES: dict[str, str] = {
    # Africa
    "NG": "Nigeria", "GH": "Ghana", "SN": "Senegal", "ML": "Mali", "CM": "Cameroon",
    "CD": "DR Congo", "ET": "Ethiopia", "SO": "Somalia", "KE": "Kenya", "UG": "Uganda",
    "TZ": "Tanzania", "ZA": "South Africa", "ZW": "Zimbabwe", "AO": "Angola",
    "SD": "Sudan", "EG": "Egypt", "MA": "Morocco", "DZ": "Algeria", "TN": "Tunisia",
    "MG": "Madagascar",
    # Europe
    "GB": "United Kingdom", "IE": "Ireland", "FR": "France", "ES": "Spain", "PT": "Portugal",
    "IT": "Italy", "DE": "Germany", "NL": "Netherlands", "SE": "Sweden", "NO": "Norway",
    "FI": "Finland", "IS": "Iceland", "DK": "Denmark", "PL": "Poland", "UA": "Ukraine",
    "RU": "Russia", "GR": "Greece", "RO": "Romania", "HU": "Hungary", "RS": "Serbia",
    "AL": "Albania", "LT": "Lithuania",
    # Middle East, Caucasus, Central Asia
    "TR": "Turkey", "GE": "Georgia", "AM": "Armenia", "AZ": "Azerbaijan", "IR": "Iran",
    "IQ": "Iraq", "SY": "Syria", "LB": "Lebanon", "IL": "Israel", "SA": "Saudi Arabia",
    "YE": "Yemen", "KZ": "Kazakhstan", "UZ": "Uzbekistan", "AF": "Afghanistan",
    "MN": "Mongolia",
    # South Asia
    "PK": "Pakistan", "IN": "India", "NP": "Nepal", "BD": "Bangladesh", "LK": "Sri Lanka",
    # East and Southeast Asia
    "CN": "China", "JP": "Japan", "KR": "South Korea", "TW": "Taiwan", "VN": "Vietnam",
    "TH": "Thailand", "MM": "Myanmar", "KH": "Cambodia", "MY": "Malaysia",
    "ID": "Indonesia", "PH": "Philippines",
    # Oceania
    "AU": "Australia", "NZ": "New Zealand", "PG": "Papua New Guinea", "FJ": "Fiji",
    "WS": "Samoa", "TO": "Tonga",
    # Americas
    "US": "United States", "CA": "Canada", "MX": "Mexico", "GT": "Guatemala",
    "CU": "Cuba", "JM": "Jamaica", "HT": "Haiti", "DO": "Dominican Republic",
    "CO": "Colombia", "VE": "Venezuela", "EC": "Ecuador", "PE": "Peru", "BO": "Bolivia",
    "PY": "Paraguay", "BR": "Brazil", "AR": "Argentina", "CL": "Chile", "UY": "Uruguay",
}

SEXES = {"m": "Q6581097", "f": "Q6581072"}


def log(*a):
    print(*a, flush=True)


def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def write_atomic(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict]):
    write_atomic(path, "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))


def file_key(filename: str) -> str:
    return hashlib.sha1(filename.encode()).hexdigest()


# 1. Harvest -----------------------------------------------------------------

WDQS = "https://query.wikidata.org/sparql"

QUERY = """
SELECT ?p ?pLabel ?img ?born ?coord ?placeLabel WHERE {{
  ?country wdt:P297 "{cc}" .
  ?place wdt:P17 ?country ; wdt:P625 ?coord .
  ?p wdt:P19 ?place ; wdt:P31 wd:Q5 ; wdt:P21 wd:{sex} ; wdt:P18 ?img ; wdt:P569 ?born .
  FILTER(YEAR(?born) >= {year})
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,mul". }}
}}
LIMIT {limit}
"""

POINT = re.compile(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)")


def sparql(s: requests.Session, query: str) -> list[dict]:
    for attempt in range(5):
        r = s.get(WDQS, params={"query": query, "format": "json"}, timeout=90)
        if r.status_code == 200:
            return r.json()["results"]["bindings"]
        wait = int(r.headers.get("Retry-After", 0)) or 10 * (attempt + 1)
        log(f"  WDQS {r.status_code}, retrying in {wait}s")
        time.sleep(wait)
    raise RuntimeError("WDQS kept failing")


def harvest(cc: str, s: requests.Session):
    out = RAW / "people" / f"{cc}.jsonl"
    if out.exists():
        return
    rows: dict[str, dict] = {}
    for sex, qid in SEXES.items():
        # Over-fetch, then sample: LIMIT alone returns the oldest items first,
        # which skews towards the most famous people.
        q = QUERY.format(cc=cc, sex=qid, year=MIN_BIRTH_YEAR, limit=CANDIDATES_PER_SEX * 6)
        found: dict[str, dict] = {}
        for b in sparql(s, q):
            m = POINT.match(b.get("coord", {}).get("value", ""))
            img = b["img"]["value"]
            if not m or not re.search(r"\.(jpe?g|png|webp|tiff?)$", img, re.I):
                continue
            qid_p = b["p"]["value"].rsplit("/", 1)[1]
            if qid_p in found:
                continue
            found[qid_p] = {
                "qid": qid_p,
                "name": b.get("pLabel", {}).get("value", qid_p),
                "sex": sex,
                "born": b["born"]["value"][:4],
                "place": b.get("placeLabel", {}).get("value", ""),
                "lng": round(float(m.group(1)), 4),
                "lat": round(float(m.group(2)), 4),
                "file": urllib.parse.unquote(img.rsplit("/", 1)[1]).replace("_", " "),
            }
        picked = list(found.values())
        random.Random(f"{cc}-{sex}").shuffle(picked)
        for row in picked[:CANDIDATES_PER_SEX]:
            rows[row["qid"]] = row
        log(f"  {cc} {sex}: {len(found)} candidates, kept {min(len(found), CANDIDATES_PER_SEX)}")
        time.sleep(1)
    write_jsonl(out, list(rows.values()))


# 2. Download ----------------------------------------------------------------

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
TAG = re.compile(r"<[^>]+>")


def clean_html(s: str) -> str:
    return re.sub(r"\s+", " ", TAG.sub("", s or "")).strip()


def commons_meta(s: requests.Session, files: list[str]) -> dict[str, dict]:
    """License, author and a thumbnail URL for up to 50 files per request."""
    out: dict[str, dict] = {}
    for i in range(0, len(files), 50):
        chunk = files[i : i + 50]
        params = {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|mime|size",
            "iiurlwidth": THUMB_WIDTH,
            "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Credit",
            "titles": "|".join("File:" + f for f in chunk),
        }
        for attempt in range(5):
            r = s.get(COMMONS_API, params=params, timeout=60)
            if r.status_code == 200:
                break
            time.sleep(5 * (attempt + 1))
        r.raise_for_status()
        q = r.json()["query"]
        # Titles come back normalized; map them back to what we asked for.
        norm = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for page in q.get("pages", []):
            title = page["title"]
            asked = norm.get(title, title)[len("File:") :]
            info = (page.get("imageinfo") or [None])[0]
            if not info:
                continue
            em = info.get("extmetadata", {})
            out[asked] = {
                "thumb": info.get("thumburl") or info.get("url"),
                "page": info.get("descriptionurl"),
                "mime": info.get("mime"),
                "width": info.get("width"),
                "height": info.get("height"),
                "license": clean_html(em.get("LicenseShortName", {}).get("value", "")),
                "licenseUrl": em.get("LicenseUrl", {}).get("value"),
                "author": clean_html(em.get("Artist", {}).get("value", ""))[:200] or "Unknown",
            }
        time.sleep(0.5)
    return out


def image_path(filename: str) -> Path:
    k = file_key(filename)
    return RAW / "img" / k[:2] / f"{k}.jpg"


THROTTLED = [0]


def fetch_image(s: requests.Session, url: str, dest: Path) -> str:
    if dest.exists():
        return "cached"
    for attempt in range(6):
        try:
            r = s.get(url, timeout=60)
        except requests.RequestException:
            time.sleep(3 * (attempt + 1))
            continue
        if r.status_code == 200 and r.content:
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(".part")
            tmp.write_bytes(r.content)
            os.replace(tmp, dest)
            return "ok"
        if r.status_code in (429, 503):
            THROTTLED[0] += 1
            time.sleep(int(r.headers.get("Retry-After", 0)) or 10 * (attempt + 1))
            continue
        return f"http {r.status_code}"
    return "gave up"


def download(cc: str, s: requests.Session):
    people = read_jsonl(RAW / "people" / f"{cc}.jsonl")
    meta_path = RAW / "meta" / f"{cc}.json"
    meta: dict[str, dict] = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    missing = [p["file"] for p in people if p["file"] not in meta]
    if missing:
        meta.update(commons_meta(s, missing))
        write_atomic(meta_path, json.dumps(meta, ensure_ascii=False))

    todo = []
    for p in people:
        m = meta.get(p["file"])
        if not m or not m.get("thumb"):
            continue
        if not ALLOWED_LICENSE.search(m["license"] or ""):
            continue
        if (m.get("width") or 0) < 300:
            continue
        todo.append((m["thumb"], image_path(p["file"])))

    results: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for status in pool.map(lambda t: fetch_image(s, *t), todo):
            results[status] = results.get(status, 0) + 1
    log(f"  {cc}: {len(people)} people, {len(todo)} licensed images, {results}, throttled {THROTTLED[0]}x")
    THROTTLED[0] = 0


# 3. Faces -------------------------------------------------------------------

# MediaPipe face-mesh indices used for alignment and quality checks.
LEFT_EYE = [33, 133, 159, 145, 160, 144, 158, 153]  # subject's right eye (image left)
RIGHT_EYE = [362, 263, 386, 374, 387, 373, 385, 380]
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
             400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
             54, 103, 67, 109]
MOUTH_UPPER, MOUTH_LOWER = 13, 14
CHIN, FOREHEAD = 152, 10


@dataclass
class FaceModels:
    detector: object
    landmarker: object
    segmenter: object


_models: FaceModels | None = None


def models() -> FaceModels:
    global _models
    if _models is None:
        from mediapipe.tasks.python import BaseOptions, vision

        landmarker = vision.FaceLandmarker.create_from_options(
            vision.FaceLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(MODELS / "face_landmarker.task")),
                num_faces=3,
                min_face_detection_confidence=0.5,
                output_facial_transformation_matrixes=True,
            )
        )
        segmenter = vision.ImageSegmenter.create_from_options(
            vision.ImageSegmenterOptions(
                base_options=BaseOptions(
                    model_asset_path=str(MODELS / "selfie_multiclass_256x256.tflite")
                ),
                output_confidence_masks=True,
                output_category_mask=False,
            )
        )
        import cv2

        # MediaPipe's own detector is short-range (selfie distance) and misses
        # the small faces in event photos; YuNet finds them, then the face is
        # cropped so the landmarker sees it large.
        detector = cv2.FaceDetectorYN.create(
            str(MODELS / "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.7, 0.3, 50
        )
        _models = FaceModels(detector, landmarker, segmenter)
    return _models


def load_rgb(path: Path):
    import cv2

    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        return None
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def euler_from_matrix(m: np.ndarray) -> tuple[float, float, float]:
    """Yaw, pitch, roll in degrees from MediaPipe's facial transformation matrix."""
    r = m[:3, :3]
    sy = math.hypot(r[0, 0], r[1, 0])
    pitch = math.degrees(math.atan2(r[2, 1], r[2, 2]))
    yaw = math.degrees(math.atan2(-r[2, 0], sy))
    roll = math.degrees(math.atan2(r[1, 0], r[0, 0]))
    return yaw, pitch, roll


def analyze(path: Path) -> dict:
    """Landmarks + quality checks for one image. Returns {'ok': bool, 'reason': ...}."""
    import cv2
    import mediapipe as mp

    rgb = load_rgb(path)
    if rgb is None:
        return {"ok": False, "reason": "unreadable"}
    h, w = rgb.shape[:2]

    # Mostly black-and-white or sepia photos would drag skin tone towards grey.
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    if float(np.median(hsv[..., 1])) < 18:
        return {"ok": False, "reason": "grayscale"}

    det = models().detector
    det.setInputSize((w, h))
    _, found = det.detect(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    if found is None or len(found) == 0:
        return {"ok": False, "reason": "no face"}
    boxes = sorted(found[:, :4].tolist(), key=lambda b: -b[2] * b[3])
    bx, by, bw, bh = boxes[0]
    # Group photos: only accept if the main face clearly dominates, so we
    # don't average in a bystander instead of the person the photo is of.
    if len(boxes) > 1 and boxes[1][2] > 0.6 * bw:
        return {"ok": False, "reason": "multiple faces"}

    # Square crop around the face, padded at the image edges, for the landmarker.
    side = int(max(bw, bh) * 2.4)
    cx, cy = bx + bw / 2, by + bh / 2
    x0c, y0c = int(cx - side / 2), int(cy - side / 2)
    crop = cv2.copyMakeBorder(rgb, side, side, side, side, cv2.BORDER_REPLICATE)[
        y0c + side : y0c + 2 * side, x0c + side : x0c + 2 * side
    ]
    crop = np.ascontiguousarray(crop)
    res = models().landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop))
    if not res.face_landmarks:
        return {"ok": False, "reason": "no landmarks"}
    # The crop holds one face; if the landmarker sees more, take the one nearest its center.
    idx = min(
        range(len(res.face_landmarks)),
        key=lambda i: np.hypot(res.face_landmarks[i][1].x - 0.5, res.face_landmarks[i][1].y - 0.5),
    )
    pts = np.array(
        [[p.x * side + x0c, p.y * side + y0c] for p in res.face_landmarks[idx]], dtype=np.float32
    )
    le, re_ = pts[LEFT_EYE].mean(0), pts[RIGHT_EYE].mean(0)
    iod = float(np.linalg.norm(re_ - le))
    if iod < 45:
        return {"ok": False, "reason": "face too small", "iod": iod}

    yaw, pitch, roll = euler_from_matrix(np.array(res.facial_transformation_matrixes[idx]))
    if abs(yaw) > 16 or abs(pitch) > 18:
        return {"ok": False, "reason": "not frontal", "yaw": yaw, "pitch": pitch}

    # The whole head plus some margin should be in frame (hair and chin
    # matter for the composite's silhouette).
    x0, y0 = pts.min(0)
    x1, y1 = pts.max(0)
    fh = y1 - y0
    if x0 < 0.15 * iod or x1 > w - 0.15 * iod or y0 - 0.35 * fh < 0 or y1 + 0.15 * fh > h:
        return {"ok": False, "reason": "cropped"}

    # Sharpness of the face region, scale-normalized.
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    crop = gray[int(y0) : int(y1), int(x0) : int(x1)]
    crop = cv2.resize(crop, (160, int(160 * crop.shape[0] / max(crop.shape[1], 1)) or 1))
    sharp = float(cv2.Laplacian(crop, cv2.CV_64F).var())
    if sharp < 25:
        return {"ok": False, "reason": "blurry", "sharp": sharp}

    mouth_open = float(np.linalg.norm(pts[MOUTH_LOWER] - pts[MOUTH_UPPER]) / iod)

    np.save(landmark_path(path), pts.astype(np.float32))
    return {
        "ok": True,
        "iod": round(iod, 1),
        "yaw": round(yaw, 1),
        "pitch": round(pitch, 1),
        "roll": round(roll, 1),
        "sharp": round(sharp, 1),
        "mouth": round(mouth_open, 3),
    }


def landmark_path(img: Path) -> Path:
    p = WORK / "landmarks" / img.parent.name / (img.stem + ".npy")
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def faces(cc: str):
    people = read_jsonl(RAW / "people" / f"{cc}.jsonl")
    out_path = WORK / "faces" / f"{cc}.jsonl"
    done = {r["qid"]: r for r in read_jsonl(out_path)}
    reasons: dict[str, int] = {}
    for p in people:
        if p["qid"] in done:
            r = done[p["qid"]]
        else:
            img = image_path(p["file"])
            if not img.exists():
                continue
            try:
                r = {"qid": p["qid"], **analyze(img)}
            except Exception as e:  # one bad file shouldn't stop the run
                r = {"qid": p["qid"], "ok": False, "reason": f"error: {e}"[:120]}
            done[p["qid"]] = r
        key = "ok" if r["ok"] else r["reason"]
        reasons[key] = reasons.get(key, 0) + 1
    write_jsonl(out_path, list(done.values()))
    log(f"  {cc}: {reasons}")


# 4. Composite ---------------------------------------------------------------


def eye_centers(pts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return pts[LEFT_EYE].mean(0), pts[RIGHT_EYE].mean(0)


def similarity_to_canvas(pts: np.ndarray) -> np.ndarray:
    """2x3 similarity transform putting the eyes at the canvas's eye positions."""
    import cv2

    le, re_ = eye_centers(pts)
    dst_l = np.array([SIZE * (0.5 - EYE_DIST / 2), SIZE * EYE_Y])
    dst_r = np.array([SIZE * (0.5 + EYE_DIST / 2), SIZE * EYE_Y])
    src = np.array([le, re_], dtype=np.float32)
    dst = np.array([dst_l, dst_r], dtype=np.float32)
    m, _ = cv2.estimateAffinePartial2D(src, dst)
    if m is None:  # two points always define a similarity; belt and braces
        raise ValueError("no transform")
    return m


def apply(m: np.ndarray, pts: np.ndarray) -> np.ndarray:
    return pts @ m[:, :2].T + m[:, 2]


def extended_points(pts: np.ndarray) -> np.ndarray:
    """Landmarks plus synthetic points around the head.

    The face mesh stops at the hairline and jaw. Rings pushed outwards from the
    face oval carry the warp smoothly into hair, ears and neck, and a fixed
    border keeps the canvas edges pinned.
    """
    oval = pts[FACE_OVAL]
    center = pts[[CHIN, FOREHEAD]].mean(0)
    rings = [center + (oval - center) * s for s in (1.25, 1.6)]
    border = []
    for t in np.linspace(0, 1, 9)[:-1]:
        v = t * (SIZE - 1)
        border += [[v, 0], [SIZE - 1, v], [SIZE - 1 - v, SIZE - 1], [0, SIZE - 1 - v]]
    return np.vstack([pts, *rings, np.array(border, dtype=np.float32)])


class Warper:
    """Piecewise-affine warp onto a fixed target shape, vectorized with cv2.remap.

    The triangle each output pixel falls in, and its barycentric coordinates,
    depend only on the target shape, so they're computed once per composite;
    each face then costs one remap.
    """

    def __init__(self, target: np.ndarray):
        import cv2
        from scipy.spatial import Delaunay

        self.tri = Delaunay(target).simplices
        ys, xs = np.mgrid[0:SIZE, 0:SIZE]
        grid = np.stack([xs.ravel(), ys.ravel()], 1).astype(np.float64) + 0.0
        index = np.full(SIZE * SIZE, -1, dtype=np.int32)
        idx_img = np.full((SIZE, SIZE), -1, dtype=np.int32)
        for i, t in enumerate(self.tri):
            cv2.fillConvexPoly(idx_img, np.round(target[t]).astype(np.int32), int(i))
        index = idx_img.ravel()
        # Pixels the rasterizer missed on shared edges: nearest triangle via find_simplex.
        miss = index < 0
        if miss.any():
            d = Delaunay(target)
            index[miss] = d.find_simplex(grid[miss])
        index[index < 0] = 0
        self.index = index
        a, b, c = (target[self.tri[index, k]] for k in range(3))
        v0, v1, v2 = b - a, c - a, grid - a
        d00 = (v0 * v0).sum(1)
        d01 = (v0 * v1).sum(1)
        d11 = (v1 * v1).sum(1)
        d20 = (v2 * v0).sum(1)
        d21 = (v2 * v1).sum(1)
        den = d00 * d11 - d01 * d01
        den[den == 0] = 1
        v = (d11 * d20 - d01 * d21) / den
        w = (d00 * d21 - d01 * d20) / den
        self.bary = np.stack([1 - v - w, v, w], 1)

    def maps(self, source: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        tri_pts = source[self.tri[self.index]]  # (N, 3, 2)
        src = (tri_pts * self.bary[:, :, None]).sum(1)
        mx = src[:, 0].reshape(SIZE, SIZE).astype(np.float32)
        my = src[:, 1].reshape(SIZE, SIZE).astype(np.float32)
        return mx, my


def person_alpha(rgb_canvas: np.ndarray) -> np.ndarray:
    """Soft foreground mask (hair, skin, clothes) of an aligned face."""
    import mediapipe as mp

    res = models().segmenter.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_canvas))
    import cv2

    background = np.squeeze(res.confidence_masks[0].numpy_view()).astype(np.float32)
    # The model runs at 256x256; its upscaled mask is blocky, and blocks at
    # the same canvas position in every face add up to a visible grid.
    background = cv2.GaussianBlur(background, (0, 0), 3.0)
    return np.clip(1.0 - background, 0, 1)


def srgb_to_linear(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055)


def composite(cc: str, sex: str) -> dict | None:
    import cv2

    people = {p["qid"]: p for p in read_jsonl(RAW / "people" / f"{cc}.jsonl")}
    rows = [
        r for r in read_jsonl(WORK / "faces" / f"{cc}.jsonl")
        if r["ok"] and people.get(r["qid"], {}).get("sex") == sex
    ]
    if len(rows) < MIN_FACES:
        log(f"  {cc}-{sex}: only {len(rows)} usable faces, skipped")
        return None

    # Best inputs first: frontal, sharp, large, mouth closed. Open-mouthed
    # smiles average into a ghostly double mouth.
    def quality(r):
        return (abs(r["yaw"]) / 16 + abs(r["pitch"]) / 18 + r["mouth"] * 6
                - min(r["iod"], 160) / 160 - min(r["sharp"], 400) / 800)

    rows.sort(key=quality)
    # Prefer closed mouths outright when there are plenty; otherwise keep the
    # smiles (sorted last by `quality`) rather than lose the composite.
    closed = [r for r in rows if r["mouth"] < 0.12]
    if len(closed) >= 40:
        rows = closed

    # Align everyone to the canvas by the eyes, then average the shapes.
    aligned = []
    for r in rows[: MAX_FACES + 20]:
        p = people[r["qid"]]
        img_path = image_path(p["file"])
        lm_path = landmark_path(img_path)
        if not lm_path.exists():
            continue
        pts = np.load(lm_path)
        m = similarity_to_canvas(pts)
        aligned.append((p, img_path, m, apply(m, pts)))

    mean_lm = np.mean([a[3] for a in aligned], 0)
    target = extended_points(mean_lm)
    warper = Warper(target)

    acc = np.zeros((SIZE, SIZE, 3), np.float64)
    acc_a = np.zeros((SIZE, SIZE), np.float64)
    used, colors, stacks = [], [], []
    for p, img_path, m, pts_c in aligned:
        rgb = load_rgb(img_path)
        if rgb is None:
            continue
        canvas = cv2.warpAffine(rgb, m, (SIZE, SIZE), flags=cv2.INTER_CUBIC,
                                borderMode=cv2.BORDER_REPLICATE)
        mx, my = warper.maps(extended_points(pts_c))
        warped = cv2.remap(canvas, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        # Small sources get upscaled a lot, and interpolation leaves a faint
        # pixel lattice that many faces at similar scales reinforce into a
        # visible grid. Blur by the upscale factor; it removes no real detail.
        scale = float(np.hypot(m[0, 0], m[0, 1]))
        if scale > 1.4:
            warped = cv2.GaussianBlur(warped, (0, 0), 0.35 * scale)
        alpha = person_alpha(warped)
        # Only confident foreground contributes color; a soft fringe would
        # average background walls into the hair as grey haze.
        alpha = np.clip((alpha - 0.35) / 0.4, 0, 1)
        weight = float(np.clip(1 / scale, 0.3, 1.0))  # sharper sources count more
        # Skin color sample: cheeks and forehead, inside the mean face.
        cheek = warped[int(SIZE * 0.52):int(SIZE * 0.6), int(SIZE * 0.38):int(SIZE * 0.62)]
        colors.append(cv2.cvtColor(cheek, cv2.COLOR_RGB2LAB).reshape(-1, 3).mean(0))
        stacks.append((p, warped, alpha, weight))
        if len(stacks) >= MAX_FACES + 10:
            break

    # Drop color casts (stage lighting, filters): skin tint (LAB a/b) more than
    # 3.5 robust standard deviations from the group's median. Lightness is left
    # out on purpose: the range of skin tones within a country is real signal,
    # and filtering on it would quietly narrow the composite.
    colors = np.array(colors)[:, 1:]
    med = np.median(colors, 0)
    mad = np.median(np.abs(colors - med), 0) * 1.4826 + 1.0
    z = np.abs((colors - med) / mad).max(1)
    keep = [s for s, zz in zip(stacks, z) if zz < 3.5][:MAX_FACES]
    if len(keep) < MIN_FACES:
        log(f"  {cc}-{sex}: {len(keep)} faces after color filtering, skipped")
        return None

    total_w = 0.0
    for p, warped, alpha, weight in keep:
        lin = srgb_to_linear(warped.astype(np.float64) / 255)
        acc += lin * (alpha * weight)[..., None]
        acc_a += alpha * weight
        total_w += weight
        used.append(p)

    n = len(used)
    mean_alpha = acc_a / total_w
    fg = linear_to_srgb(acc / np.maximum(acc_a, 1e-6)[..., None])

    # Averaged headwraps, dyed hair and patterned collars leave rainbow speckle
    # around the face. Calm the color outside the face oval; the face itself
    # (skin tone is the point of the game) is untouched.
    face = np.zeros((SIZE, SIZE), np.float32)
    center = mean_lm[[CHIN, FOREHEAD]].mean(0)
    oval = center + (mean_lm[FACE_OVAL] - center) * 1.04
    cv2.fillConvexPoly(face, np.round(oval).astype(np.int32), 1.0)
    face = cv2.GaussianBlur(face, (0, 0), 10)
    lab = cv2.cvtColor(fg.astype(np.float32), cv2.COLOR_RGB2LAB)
    lab[..., 1:] *= (0.6 + 0.4 * face)[..., None]
    fg = np.clip(cv2.cvtColor(lab, cv2.COLOR_LAB2RGB), 0, 1).astype(np.float64)

    # Studio backdrop: soft radial gradient. Fade the body out below the
    # shoulders so the composite reads as a portrait, not a mush of clothes.
    yy, xx = np.mgrid[0:SIZE, 0:SIZE] / SIZE
    bg_l = 0.80 - 0.12 * np.hypot(xx - 0.5, (yy - 0.4) * 1.2)
    bg = np.stack([bg_l * 0.985, bg_l * 0.975, bg_l * 0.955], -1)
    chin_y = mean_lm[CHIN, 1] / SIZE
    body_fade = np.clip(1 - (yy - (chin_y + 0.12)) / 0.22, 0, 1)
    # Opaque wherever most of the faces have hair or skin; soft only at the fringe.
    a = np.clip((mean_alpha - 0.08) / 0.55, 0, 1) * body_fade
    a = cv2.GaussianBlur(a.astype(np.float32), (0, 0), 1.2)[..., None]
    out = fg * a + bg * (1 - a)

    # Averaging softens detail; a gentle unsharp mask restores some crispness.
    out8 = (np.clip(out, 0, 1) * 255).astype(np.uint8)
    blur = cv2.GaussianBlur(out8, (0, 0), 2.0)
    out8 = cv2.addWeighted(out8, 1.35, blur, -0.35, 0)

    rid = f"{cc}-{sex}"
    dest = WORK / "composites" / f"{rid}.webp"
    dest.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dest), cv2.cvtColor(out8, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, 88])
    info = {"id": rid, "cc": cc, "sex": sex, "n": n, "qids": [p["qid"] for p in used]}
    write_atomic(WORK / "composites" / f"{rid}.json", json.dumps(info))
    log(f"  {rid}: {n} faces -> {dest.relative_to(ROOT)}")
    return info


# 5. Publish -----------------------------------------------------------------


def haversine(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(h)))


def answer_point(points: list[tuple[float, float]]) -> tuple[float, float, float]:
    """Medoid of the birthplaces (always a real place, never the sea between
    islands), plus a full-marks radius from how spread out they are."""
    pts = points[:120]
    best, best_sum = pts[0], float("inf")
    for p in pts:
        s = sum(haversine(p, q) for q in pts)
        if s < best_sum:
            best, best_sum = p, s
    dists = sorted(haversine(best, q) for q in points)
    spread = dists[len(dists) // 2]
    return best[0], best[1], float(min(400, max(75, spread * 0.6)))


def publish():
    import shutil

    rounds, n_credits = [], 0
    staging = DATA / "public.next"
    if staging.exists():
        shutil.rmtree(staging)
    (staging / "faces").mkdir(parents=True)
    (staging / "credits").mkdir(parents=True)

    for info_path in sorted((WORK / "composites").glob("*.json")):
        info = json.loads(info_path.read_text())
        cc, sex, rid = info["cc"], info["sex"], info["id"]
        if cc not in COUNTRIES:
            continue
        people = {p["qid"]: p for p in read_jsonl(RAW / "people" / f"{cc}.jsonl")}
        meta = json.loads((RAW / "meta" / f"{cc}.json").read_text())
        used = [people[q] for q in info["qids"] if q in people]
        lat, lng, radius = answer_point([(p["lat"], p["lng"]) for p in used])

        credits = []
        for p in used:
            m = meta.get(p["file"], {})
            credits.append({
                "name": p["name"],
                "author": m.get("author") or "Unknown",
                "license": m.get("license") or "See source",
                **({"licenseUrl": m["licenseUrl"]} if m.get("licenseUrl") else {}),
                "sourceUrl": m.get("page") or "https://commons.wikimedia.org/wiki/File:"
                + urllib.parse.quote(p["file"].replace(" ", "_")),
            })
        n_credits += len(credits)

        shutil.copy2(WORK / "composites" / f"{rid}.webp", staging / "faces" / f"{rid}.webp")
        (staging / "credits" / f"{rid}.json").write_text(json.dumps(credits, ensure_ascii=False))
        rounds.append({
            "id": rid,
            "label": COUNTRIES[cc],
            "country": cc,
            "lat": round(lat, 4),
            "lng": round(lng, 4),
            "radiusKm": round(radius),
            "sex": sex,
            "n": info["n"],
            "image": f"{rid}.webp",
            "credits": f"{rid}.json",
        })

    manifest = {
        "version": 1,
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "rounds": rounds,
    }
    # Files first, manifest last: the app keys off rounds.json, so it never
    # sees a manifest pointing at faces that aren't there yet. The directory
    # itself stays put (it's a bind mount), so contents are swapped in place.
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for sub in ("faces", "credits"):
        target = PUBLIC / sub
        target.mkdir(exist_ok=True)
        for f in (staging / sub).iterdir():
            os.replace(f, target / f.name)
    write_atomic(PUBLIC / "rounds.json", json.dumps(manifest, indent=1, ensure_ascii=False))
    # Remove files no round references any more.
    live = {r["image"] for r in rounds} | {r["credits"] for r in rounds}
    for sub in ("faces", "credits"):
        for f in (PUBLIC / sub).iterdir():
            if f.name not in live:
                f.unlink()
    shutil.rmtree(staging)
    log(f"published {len(rounds)} rounds ({n_credits} credited photos) to {PUBLIC.relative_to(ROOT)}")


# CLI ------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stage", choices=["harvest", "download", "faces", "composite", "publish", "all"])
    ap.add_argument("countries", nargs="*", help="ISO alpha-2 codes (default: all)")
    ap.add_argument("--force", action="store_true", help="redo composites even if present")
    args = ap.parse_args()

    ccs = [c.upper() for c in args.countries] or list(COUNTRIES)
    unknown = [c for c in ccs if c not in COUNTRIES]
    if unknown:
        sys.exit(f"unknown country codes: {unknown} (add them to COUNTRIES)")

    s = session()

    def composite_all(cc: str):
        for sex in SEXES:
            if args.force or not (WORK / "composites" / f"{cc}-{sex}.webp").exists():
                composite(cc, sex)

    steps = {
        "harvest": lambda cc: harvest(cc, s),
        "download": lambda cc: download(cc, s),
        "faces": faces,
        "composite": composite_all,
    }

    if args.stage == "publish":
        publish()
        return

    if args.stage == "all":
        # Country by country, so finished composites show up as the run goes,
        # and one country failing doesn't stop the rest.
        for i, cc in enumerate(ccs, 1):
            log(f"== [{i}/{len(ccs)}] {cc} {COUNTRIES[cc]}")
            try:
                for step in steps.values():
                    step(cc)
            except Exception as e:
                log(f"  {cc} FAILED: {e!r}")
        publish()
        return

    log(f"== {args.stage}")
    for cc in ccs:
        steps[args.stage](cc)

if __name__ == "__main__":
    main()
