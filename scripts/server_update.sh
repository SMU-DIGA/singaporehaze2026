#!/usr/bin/env bash
# Hourly refresh run from the server's crontab (GitHub's scheduled runs were
# too late or skipped). Fetches the latest data, commits public/data/latest.json
# and pushes to main; the push triggers the GitHub Pages deploy workflow.
#
# crontab: 17 * * * * /home/rainwangphy/singaporehaze2026/scripts/server_update.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="${PYTHON:-/mnt/raid/data/rainwangphy/miniconda3/bin/python3}"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
exec >>"$LOG_DIR/server_update.log" 2>&1

# One run at a time; a slow upstream must not stack up overlapping runs.
exec 9>"$LOG_DIR/.server_update.lock"
flock -n 9 || { echo "$(date '+%F %T') previous run still active, skipping"; exit 0; }

echo "=== $(date '+%F %T %Z') start"
cd "$ROOT" || exit 1

# Optional: DATA_GOV_SG_API_KEY=... in .env raises the official API rate limit.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

git fetch -q origin main && git merge -q --ff-only origin/main || {
  echo "cannot fast-forward to origin/main; resolve the local checkout by hand"
  exit 1
}

"$PYTHON" scripts/update_data.py
refresh=$?

if ! "$PYTHON" -m unittest discover -s tests -p 'test_*.py' -q; then
  echo "tests failed; not committing"
  git checkout -- public/data/latest.json
  exit 1
fi

git add public/data/latest.json
if git diff --staged --quiet; then
  echo "no data change"
else
  git commit -q -m "data: refresh Singapore haze snapshot"
  for attempt in 1 2 3; do
    git push -q origin HEAD:main && { echo "pushed $(git rev-parse --short HEAD)"; break; }
    echo "push failed (attempt $attempt); rebasing on origin/main"
    git pull -q --rebase origin main
    sleep $((attempt * 10))
  done
fi

[ "$refresh" -eq 0 ] || echo "warning: update_data.py exited $refresh (critical upstream failure)"
echo "=== $(date '+%F %T %Z') done"
