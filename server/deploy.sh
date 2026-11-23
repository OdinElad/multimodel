#!/bin/sh
# Pulls the server files from GitHub into the directory this runs in.
# Usage (on the server): sh deploy.sh   (run from public_html/weather)
set -e
BASE=https://raw.githubusercontent.com/OdinElad/multimodel/main/server
for f in api.php push_lib.php alerts_lib.php subscribe.php alerts_cron.php setup_keys.php; do
  curl -fsS -o "$f.new" "$BASE/$f"
  php -l "$f.new" >/dev/null
  mv "$f.new" "$f"
done
echo "deployed $(date -u +%FT%TZ)"
