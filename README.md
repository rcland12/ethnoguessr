# Ethnoguessr 2.0

A geography guessing game. Each round shows a **composite face**: up to 80
photos of different people born in the same country, aligned and averaged into
one face that belongs to nobody. Drop a pin where you think they were born. The
closer you are, the more points you get (up to 5,000 per round).

- **Daily**: five rounds, the same for everyone, with a shareable result card.
- **Endless**: random rounds for as long as you like.
- **Accounts** (optional): email and password, scores saved across devices,
  and an opt-in morning email with the day's game.

Rounds are grouped by **birthplace**, which Wikidata records, not by
ethnicity or ancestry. The about page in the app explains the method and its
biases: the photos are mostly public figures, and birthplace isn't heritage.

## How the faces are made

`pipeline/eg.py` builds them from open data:

1. **Harvest**: Wikidata people born since 1945 with a photo, sex and a
   birthplace with coordinates, per country (today's borders).
2. **Download**: freely licensed thumbnails from Wikimedia Commons, with
   author and license recorded for attribution.
3. **Faces**: YuNet finds faces, and MediaPipe places 478 landmarks. Photos
   with turned heads, small or blurry faces, groups, or black-and-white images
   are dropped.
4. **Composite**: faces are aligned by the eyes, warped onto the group's mean
   shape (piecewise affine), cut from their backgrounds by segmentation, and
   averaged in linear light on a studio backdrop.
5. **Publish**: writes `rounds.json`, the faces and per-round credits for the
   site.

The photos and composites are **not** in this repository. Run the pipeline to
build them (see [pipeline/README.md](pipeline/README.md)). Composites are
derivative works of CC BY / CC BY-SA photos, and the site links every round to
its credits.

## Running it

```bash
npm install
cp .env.example .env     # everything is optional; see the comments
npm run dev
```

Without pipeline output, the site serves placeholder rounds from `demo/`.
Without `SMTP_HOST`, emails (confirmation, password reset, daily) are printed to
the console.

To build real rounds (Python 3.12):

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r pipeline/requirements.txt
# download the three models listed in pipeline/README.md into pipeline/.cache/models/
python -I pipeline/eg.py all NG JP SE      # or no country codes for all of them
```

### Docker

```bash
docker build -t ethnoguessr .
docker run -p 3000:3000 \
  -e ORIGIN=http://localhost:3000 \
  -v "$PWD/data/public:/app/data:ro" \
  -v "$PWD/data/state:/app/state" \
  ethnoguessr
```

Environment variables are documented in [.env.example](.env.example). The
SQLite database lives in `STATE_DIR` (`/app/state` in the image).

## Stack

SvelteKit 2 / Svelte 5, Tailwind 4, Leaflet with Natural Earth borders (no tile
server), SQLite via `node:sqlite`, nodemailer. Pipeline: Python, OpenCV, MediaPipe,
SciPy.

## License

Code: [MIT](LICENSE). Map data: Natural Earth (public domain) via
[world-atlas](https://github.com/topojson/world-atlas). Flags:
[flag-icons](https://github.com/lipis/flag-icons) (MIT). Face models:
MediaPipe (Apache 2.0) and OpenCV Zoo YuNet (MIT).
