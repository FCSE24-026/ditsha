#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
CONTAINER_NAME="${2:-ditsha-backend-db-1}"
DB_USER="${3:-postgres}"
DB_NAME="${4:-ditsha}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "Usage: $0 <path-to-backup.sql> [container-name] [db-user] [db-name]" >&2
    exit 1
fi

echo "WARNING: Restoring backup will apply SQL dump to '$DB_NAME' in container '$CONTAINER_NAME'."
echo "Restoring database '$DB_NAME' from '$BACKUP_FILE'..."

cat "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME"
echo "Database restore completed."
