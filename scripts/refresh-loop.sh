#!/usr/bin/env bash
# Self-chaining refresh: collect every INTERVAL s until BUDGET s have passed, then return (the workflow then starts the next run).
# Env: INTERVAL (default 900), BUDGET (default 20400 = 5 h 40, under GitHub's 6 h job cap), COMMIT=0 to never touch git, OUT=<dir> to write elsewhere.
set -u
INTERVAL=${INTERVAL:-900}; BUDGET=${BUDGET:-20400}; COMMIT=${COMMIT:-1}
start=$(date +%s); fails=0

commit() {
  [ "$COMMIT" = 1 ] || return 0
  if [ "$(python3 scripts/should_commit.py)" = "skip" ]; then echo "no meaningful change, not committing"; return 0; fi
  git config user.name "semaphore-bot"; git config user.email "semaphore-bot@users.noreply.github.com"
  git add docs/data
  git diff --cached --quiet && return 0
  git commit -q -m "data $(date -u +%FT%TZ)" && git pull --rebase -q && git push -q
}

while :; do
  if python3 -m semaphore ${OUT:+--out "$OUT"} && commit; then fails=0; else fails=$((fails + 1)); echo "iteration failed ($fails in a row)"; fi
  [ "$fails" -ge 3 ] && { echo "3 failures in a row, giving up"; exit 1; }
  [ $(( $(date +%s) - start + INTERVAL )) -ge "$BUDGET" ] && break
  sleep "$INTERVAL"
done
