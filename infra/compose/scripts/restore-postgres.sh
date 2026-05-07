#!/usr/bin/env sh
# Phase 3.5 — restore drill. Run against a staging Postgres, NEVER prod.
# Usage: restore-postgres.sh <encrypted-dump-file> <target-db-url>
#   $1 = path to .dump.enc file
#   $2 = libpq URL, e.g. postgres://medplum:pwd@staging:5432/medplum
# Requires BACKUP_PASSPHRASE in the env to decrypt.
#
# Acceptance (Phase 3.5 monthly drill):
#   1. Pull yesterday's *.dump.enc from /backups
#   2. Spin up an empty staging Postgres
#   3. Run this script
#   4. Diff row counts on Patient/ServiceRequest between prod + staging
set -eu

if [ $# -lt 2 ]; then
  echo "usage: $0 <encrypted-dump-file> <target-db-url>" >&2
  exit 2
fi

src=$1
target=$2

if [ ! -f "$src" ]; then
  echo "input not found: $src" >&2
  exit 1
fi
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "BACKUP_PASSPHRASE missing" >&2
  exit 1
fi

tmp=$(mktemp -t vendo-restore-XXXXXX.dump)
trap 'rm -f "$tmp"' EXIT

echo "decrypting $src → $tmp"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$src" -out "$tmp" -pass env:BACKUP_PASSPHRASE

echo "restoring into $target"
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$target" "$tmp"

echo "restore complete"
