# data/

Pipeline working directory. Everything here is git-ignored except this file.

- `raw/`     downloaded source photos + Wikidata metadata (never served)
- `work/`    landmarks, crops, rejects (never served)
- `public/`  what the site serves: `rounds.json`, `faces/`, `credits/`

Only `public/` is mounted into the container. See PLAN.md > Data contract.
