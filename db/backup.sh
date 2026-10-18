#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${1:-ditsha-backend-db-1}"
DB_USER="${2:-postgres}"
DB_NAME="${3:-ditsha}"
BACKUP_DIR="$(dirname "$0")/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${4:-$BACKUP_DIR/ditsha_backup_$TIMESTAMP.sql}"

mkdir -p "$BACKUP_DIR"
echo "Creating backup of database '$DB_NAME' from container '$CONTAINER_NAME'..."
docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

if [ -s "$BACKUP_FILE" ]; then
    echo "Backup successfully created at $BACKUP_FILE"
else
    echo "Backup failed or generated an empty file." >&2
    exit 1
fi
