#!/bin/sh
# Pulls the server files from GitHub into the directory this runs in.
# Usage (on the server, from public_html/weather): sh deploy.sh mailto:you@example.com
set -e
cd "$(dirname "$0")"
BASE=https://raw.githubusercontent.com/OdinElad/multimodel/main/server
for f in api.php push_lib.php alerts_lib.php subscribe.php alerts_cron.php setup_keys.php .htaccess; do
  curl -fsS -o "$f.new" "$BASE/$f"
  case "$f" in *.php) php -l "$f.new" >/dev/null;; esac
  mv "$f.new" "$f"
done
php setup_keys.php "${1:-}"
echo "deployed $(date -u +%FT%TZ)"
