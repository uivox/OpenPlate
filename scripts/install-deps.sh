#!/usr/bin/env bash
# Installs dependencies reproducibly.
#
# With a committed package-lock.json, CI installs exactly the locked versions (npm ci) and never
# changes them during a build. Without one, it falls back to the old behaviour (npm install plus
# `expo install --fix`) and leaves a warning on the run, so builds keep working until the lockfile
# is committed. To create it: run `npm install && npx expo install --fix` locally and commit
# package-lock.json.
set -euo pipefail
if [ -f package-lock.json ]; then
  bash scripts/ci-run.sh npm ci --no-audit --no-fund
else
  echo "::warning title=No package-lock.json::Dependencies are resolved fresh on every build. Commit package-lock.json for reproducible builds."
  bash scripts/ci-run.sh npm install --no-audit --no-fund
  bash scripts/ci-run.sh npx expo install --fix
fi
