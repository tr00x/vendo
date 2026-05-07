#!/usr/bin/env bash
# Generate production Medplum config from template + env vars.
# Run ONCE on the VPS after creating .env.prod and before first `docker compose up`.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${1:-.env.prod}"
OUT="medplum.config.prod.json"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.prod.example and fill it in first." >&2
  exit 1
fi

if [ -f "$OUT" ]; then
  echo "ERROR: $OUT already exists. Delete it first if you want to regenerate keys." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

: "${MEDPLUM_BASE_URL:?must be set in $ENV_FILE}"
: "${APP_BASE_URL:?must be set in $ENV_FILE}"
: "${SUPPORT_EMAIL:?must be set in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?must be set in $ENV_FILE}"

PASS="$(openssl rand -hex 32)"
KEY_ID="vendo-prod-$(date +%s)"
KEY_PEM="$(openssl genpkey -algorithm RSA -aes-256-cbc -pass "pass:${PASS}" -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"

# Strip trailing slash on URLs to avoid double-slash in storage URLs.
MEDPLUM_BASE_URL="${MEDPLUM_BASE_URL%/}"
APP_BASE_URL="${APP_BASE_URL%/}"

jq \
  --arg base    "${MEDPLUM_BASE_URL}/" \
  --arg app     "${APP_BASE_URL}/" \
  --arg storage "${MEDPLUM_BASE_URL}/storage/" \
  --arg support "${SUPPORT_EMAIL}" \
  --arg pgpw    "${POSTGRES_PASSWORD}" \
  --arg key     "${KEY_PEM}" \
  --arg pass    "${PASS}" \
  --arg id      "${KEY_ID}" \
  '.baseUrl = $base
   | .appBaseUrl = $app
   | .issuer = $base
   | .audience = $base
   | .storageBaseUrl = $storage
   | .supportEmail = $support
   | .database.password = $pgpw
   | .signingKey = $key
   | .signingKeyPassphrase = $pass
   | .signingKeyId = $id' \
  medplum.config.prod.template.json > "$OUT"

chmod 640 "$OUT"
# Medplum image runs as the unprivileged `node` user (UID 1000). Set group
# ownership so the container can read the file under :ro mount, while keeping
# `other` blocked.
chown root:1000 "$OUT" 2>/dev/null || chgrp 1000 "$OUT" 2>/dev/null || true
echo "Wrote $OUT (key id: $KEY_ID, perms: 640 root:1000). Back up this file — losing it invalidates all sessions."
