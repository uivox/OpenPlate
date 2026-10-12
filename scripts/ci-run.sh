#!/usr/bin/env bash
# Runs a command; on failure, puts the last lines of its output into a GitHub
# error annotation so the reason is visible on the run page and via the API.
set -o pipefail
LOG=$(mktemp)
"$@" 2>&1 | tee "$LOG"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  msg=$(tail -n 40 "$LOG" | sed -e 's/%/%25/g' -e 's/\r//g' | awk '{printf "%s%%0A", $0}')
  echo "::error title=Failed: $*::${msg}"
fi
exit "$code"
