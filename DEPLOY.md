# Vendo Production Deployment — Cloudflare Tunnel + Docker

End-to-end guide to ship Vendo to a single VPS, served via Cloudflare Tunnel
(no open ports, automatic TLS, free DDoS protection).

**Total time:** ~30 minutes if you have the VPS, domain, and Cloudflare account ready.

---

## 0. Prerequisites

- VPS with **2 vCPU, 4 GB RAM, 40 GB SSD** minimum (Hetzner CX22 / DO 4 GB / Linode 4 GB).
  Ubuntu 24.04 LTS recommended.
- Domain on Cloudflare (free plan is fine). You'll use **two** subdomains:
  - `portal.example.com` — the portal (what doctors and clinic staff type)
  - `medplum.example.com` — the Medplum API (referenced from portal config; not customer-facing)
- SSH access to the VPS as root or a sudoer.

---

## 1. VPS prep (5 min)

```bash
ssh root@your-vps
# Install Docker + compose plugin
apt update && apt install -y ca-certificates curl gnupg jq git openssl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

# Tighten firewall — Cloudflare Tunnel is outbound, no inbound ports needed.
ufw allow OpenSSH
ufw --force enable
```

---

## 2. Clone the repo + scaffold env (5 min)

```bash
mkdir -p /opt && cd /opt
git clone <your-repo-url> vendo
cd vendo/infra/compose

cp .env.prod.example .env.prod
chmod 600 .env.prod
```

Generate the two secrets and put them into `.env.prod`:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env.prod
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env.prod
# Then edit .env.prod and fill in the URL fields + CF_TUNNEL_TOKEN (next step).
nano .env.prod
```

Required values in `.env.prod`:

| Var | What | Where it comes from |
|---|---|---|
| `APP_BASE_URL` | `https://portal.example.com` | Subdomain you'll point at the portal |
| `MEDPLUM_BASE_URL` | `https://medplum.example.com` | Subdomain for the Medplum API |
| `SUPPORT_EMAIL` | `support@example.com` | Address shown in Medplum templates |
| `POSTGRES_PASSWORD` | random 48-hex | Already filled by command above |
| `SESSION_SECRET` | random 64-hex | Already filled by command above |
| `CF_TUNNEL_TOKEN` | `eyJhIjoi…` | Step 3 below |

---

## 3. Create the Cloudflare Tunnel (10 min)

In the Cloudflare dashboard:

1. **Zero Trust → Networks → Tunnels → Create tunnel.**
2. Connector: **Cloudflared.** Tunnel name: `vendo-prod`. Save.
3. **Install connector → Docker.** Copy the long token from the displayed
   command (the part after `--token`). Paste into `.env.prod` as
   `CF_TUNNEL_TOKEN`. Skip running their command — our compose handles it.
4. **Public hostnames → Add a public hostname:**
   - Subdomain: `portal` · Domain: `example.com` · Service:
     `http://portal:3000`
5. **Add a public hostname:**
   - Subdomain: `medplum` · Domain: `example.com` · Service:
     `http://medplum-server:8103`
6. Save. Both subdomains now resolve through Cloudflare to the tunnel.

> **Note:** the service hostnames (`portal`, `medplum-server`) are the Docker
> service names from `docker-compose.prod.yml` — Cloudflared resolves them via
> the Compose network because it runs in the same network.

---

## 4. Generate Medplum production config (1 min)

```bash
# Still in /opt/vendo/infra/compose
./scripts/gen-prod-config.sh .env.prod
# → writes medplum.config.prod.json (chmod 600). Back this file up — losing it
#   invalidates every existing user session and Binary signing URL.
```

---

## 5. First boot (5 min)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml ps          # all should be healthy
docker compose -f docker-compose.prod.yml logs -f portal cloudflared
```

When `cloudflared` shows `Connection registered`, browse to
`https://portal.example.com/login` — the password sign-in form should load
over Cloudflare's TLS cert.

---

## 6. Bootstrap admin + seed users (5 min)

The first admin must be created against a fresh Medplum instance:

```bash
# Create the super-admin via Medplum's bootstrap endpoint.
# Replace the email/password — store the password in your password manager.
curl -X POST https://medplum.example.com/auth/newproject \
  -H 'content-type: application/json' \
  -d '{
    "firstName":"Vendo",
    "lastName":"Admin",
    "email":"admin@example.com",
    "password":"<strong-password>",
    "projectName":"Vendo Demo Production",
    "recaptchaToken":"dev-bypass"
  }'
```

Then run the seed (creates referring doctors + front-desk staff + Schedule + Slots) by
SSHing into the box and running, from `/opt/vendo`:

```bash
# One-time: seed the production project. Edit the seed env first to point at
# the prod admin you just created.
cp infra/compose/seed/.env.example infra/compose/seed/.env.prod
nano infra/compose/seed/.env.prod   # set MEDPLUM_BASE_URL + SEED_ADMIN_EMAIL/PASSWORD
docker run --rm --network vendo-prod_default \
  -v /opt/vendo:/work -w /work \
  -e DOTENV_FILE=/work/infra/compose/seed/.env.prod \
  node:22-alpine sh -c 'corepack enable && pnpm -C infra/compose/seed start'
```

You should see `seed complete` with the user count. Each seeded user uses the
shared password `ClinicPass!2026` — **change these immediately** via the
Medplum admin app or send each user a password-reset link.

---

## 7. Backups — minimum viable

Add a daily Postgres dump to crontab (encrypted at rest, off-host weekly):

```bash
cat > /opt/vendo/scripts/backup.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /opt/vendo/backups
docker exec vendo-prod-postgres-1 pg_dump -U medplum medplum \
  | gzip -9 > "/opt/vendo/backups/medplum-${ts}.sql.gz"
# Keep last 14 daily.
find /opt/vendo/backups -name 'medplum-*.sql.gz' -mtime +14 -delete
BASH
chmod +x /opt/vendo/scripts/backup.sh
( crontab -l 2>/dev/null; echo "30 3 * * * /opt/vendo/scripts/backup.sh" ) | crontab -
```

For off-host: rsync `/opt/vendo/backups` weekly to S3/B2/another VPS.
Restore drill should be tabletop-tested before touching real PHI.

---

## 8. Day-2 ops cheatsheet

```bash
# Tail logs of one service
docker compose -f docker-compose.prod.yml logs -f portal

# Update portal after a git pull
cd /opt/vendo && git pull
cd infra/compose
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build portal

# Restart cloudflared without touching the app
docker compose -f docker-compose.prod.yml restart cloudflared

# Manually trigger a backup
/opt/vendo/scripts/backup.sh

# Restore from backup (DESTRUCTIVE — replaces current DB)
gunzip -c /opt/vendo/backups/medplum-20260501T033000Z.sql.gz \
  | docker exec -i vendo-prod-postgres-1 psql -U medplum medplum
```

---

## What this setup does NOT include

- External pen-test
- Multi-region failover, hot-standby DB
- Centralised log shipping (use `journalctl` on the VPS for now)
- TOTP MFA, self-service forgot-password
- Error aggregation (Sentry / Honeybadger / similar)

See [`TODO.md`](TODO.md) for the full deferred-work list.
