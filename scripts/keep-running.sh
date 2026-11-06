#!/bin/bash
# Serves Vigie on http://localhost:8000 and refreshes the data every 10 minutes, so the page never reaches "Statut inconnu". Ctrl-C to stop.
cd "$(dirname "$0")/.." || exit 1
caffeinate -i -w $$ &                      # macOS: keep the Mac from idle-sleeping while this runs
python3 -m http.server 8000 --directory docs >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
while true; do
  python3 -m puite || echo "refresh failed, retrying in 10 min"
  sleep 600
done
