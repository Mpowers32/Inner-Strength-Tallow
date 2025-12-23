#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set to run backups}"

timestamp=$(date +"%Y%m%d_%H%M%S")
output_dir=${BACKUP_DIR:-"./backups"}
mkdir -p "$output_dir"

if [[ "$DATABASE_URL" == postgres* ]]; then
  pg_dump "$DATABASE_URL" > "$output_dir/backup_${timestamp}.sql"
  echo "Backup saved to $output_dir/backup_${timestamp}.sql"
else
  echo "Unsupported DATABASE_URL scheme for backup: $DATABASE_URL" >&2
  exit 1
fi
