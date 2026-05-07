#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f medplum.config.json ]; then
  echo "medplum.config.json already exists. Refusing to overwrite. Delete it first if you want to regenerate keys."
  exit 1
fi

PASS="$(openssl rand -hex 32)"
KEY_ID="vendo-dev-$(date +%s)"
KEY_PEM="$(openssl genpkey -algorithm RSA -aes-256-cbc -pass "pass:${PASS}" -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"

jq --arg key "$KEY_PEM" --arg pass "$PASS" --arg id "$KEY_ID" \
  '.signingKey = $key | .signingKeyPassphrase = $pass | .signingKeyId = $id' \
  medplum.config.template.json > medplum.config.json

chmod 600 medplum.config.json
echo "Generated medplum.config.json with key id $KEY_ID"
