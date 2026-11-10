#!/bin/bash
# Serves Semaphore on http://localhost:8000 and refreshes the data every 10 minutes, so the page never reaches "Statut inconnu". Ctrl-C to stop.
cd "$(dirname "$0")/.." || exit 1
command -v caffeinate >/dev/null && { caffeinate -i -w $$ & }  # macOS only: keep the Mac from idle-sleeping
python3 -m http.server 8000 --directory docs >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
while true; do
  python3 -m semaphore || echo "refresh failed, retrying in 10 min"
  sleep 600
done
