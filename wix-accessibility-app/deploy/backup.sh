#!/bin/sh
# Nightly SQLite backup. Cron example (on the VPS host):
#   15 3 * * * /path/to/wix-accessibility-app/deploy/backup.sh >> /var/log/a11y-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p ../backups
docker compose -f docker-compose.yml exec -T app node -e "
const { DatabaseSync } = require('node:sqlite');
new DatabaseSync('/app/data/app.db').exec(\"VACUUM INTO '/app/data/backup.db'\");
"
docker compose -f docker-compose.yml cp app:/app/data/backup.db "../backups/app-$STAMP.db"
docker compose -f docker-compose.yml exec -T app rm -f /app/data/backup.db
find ../backups -name 'app-*.db' -mtime +14 -delete
echo "backup ok: app-$STAMP.db"
