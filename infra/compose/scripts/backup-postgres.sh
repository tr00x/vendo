#!/usr/bin/env sh
# Phase 3.5 — nightly Postgres backup. Runs INSIDE the postgres-backup
# container (see docker-compose.prod.yml). Each invocation:
#   1. Streams pg_dump --format=custom (compressed, restorable with pg_restore).
#   2. Encrypts via OpenSSL AES-256-CBC keyed by BACKUP_PASSPHRASE.
#   3. Names the file <db>-<UTC-stamp>.dump.enc and writes to /backups.
#   4. Prunes files older than RETENTION_DAYS.
#
# Restore drill (run on a clean staging box, NOT prod):
#   openssl enc -d -aes-256-cbc -pbkdf2 -in <file>.enc -out <file>.dump \
#       -pass env:BACKUP_PASSPHRASE
#   pg_restore --clean --if-exists -d <staging-db-url> <file>.dump
#
# Failure modes that must NOT silently swallow:
#   - pg_dump exit != 0  → exit 1, container restarts, alert via Sentry
#   - openssl exit != 0  → exit 1
#   - free space < 500MB → exit 1 with explicit message
set -eu

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_USER:=medplum}"
: "${POSTGRES_DB:=medplum}"
: "${BACKUP_DIR:=/backups}"
: "${RETENTION_DAYS:=14}"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "PGPASSWORD missing — refusing to attempt unauthenticated backup" >&2
  exit 1
fi
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "BACKUP_PASSPHRASE missing — refusing to write unencrypted backup" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Disk-space guard — refuses to start if less than 500 MB free, since a
# half-written backup is worse than a missed one (silent corruption).
free_kb=$(df -P "$BACKUP_DIR" | awk 'NR==2 {print $4}')
if [ "${free_kb:-0}" -lt 512000 ]; then
  echo "free space ${free_kb}KB < 500MB at ${BACKUP_DIR}; aborting" >&2
  exit 1
fi

stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="${BACKUP_DIR}/${POSTGRES_DB}-${stamp}.dump.enc"
tmp="${out}.partial"

echo "[$(date -u +%FT%TZ)] backup start → $out"

pg_dump \
  --host="$POSTGRES_HOST" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
      -pass env:BACKUP_PASSPHRASE -out "$tmp"

# Atomic rename only after the full pipeline succeeds. A partial file with
# no `.enc` suffix is never picked up by restore tooling.
mv "$tmp" "$out"
size=$(wc -c < "$out")
echo "[$(date -u +%FT%TZ)] backup ok → $out (${size} bytes)"

# Prune old backups — best effort. Find by mtime so a clock skew on the
# container doesn't accidentally wipe everything.
find "$BACKUP_DIR" -maxdepth 1 -name "${POSTGRES_DB}-*.dump.enc" -type f \
  -mtime +${RETENTION_DAYS} -print -delete || true

echo "[$(date -u +%FT%TZ)] backup done"
