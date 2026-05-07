#!/usr/bin/env bash
# Vendo prod watchdog — runs every 60s via systemd timer.
#
# Goal: catch states where a container is running but its app is stuck —
# e.g. portal returns non-2xx on /api/health for ≥3 consecutive checks,
# or any vendo-prod-* container reports `unhealthy`. Docker's
# `restart: unless-stopped` already covers crashes; this script is the
# safety net for "container alive, app unhappy."
#
# Behaviour:
#   - Checks each watched container's docker health status.
#   - Probes portal.example.com/api/health from inside the host.
#   - On consecutive failures (FAIL_THRESHOLD), `docker compose up -d`
#     the affected service, then resets the counter.
#   - Per-container cooldown so we don't thrash on a permanent failure.
#   - Logs to syslog (journal) AND to /var/log/vendo-watchdog.log.
#
# Exit code is always 0 — the timer should never report failure (we
# handle our own retry semantics). Errors land in the log.

set -uo pipefail

COMPOSE_DIR="/opt/vendo/infra/compose"
COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="/var/log/vendo-watchdog.log"
STATE_DIR="/var/lib/vendo-watchdog"
FAIL_THRESHOLD=3                    # consecutive failures → restart
COOLDOWN_SEC=600                    # 10-min minimum between restarts per service
HEALTH_URL="https://portal.example.com/api/health"
HEALTH_TIMEOUT=8                    # seconds for the curl probe

mkdir -p "$STATE_DIR"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE=/dev/null

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] watchdog: $*"
  echo "$msg" | tee -a "$LOG_FILE" >&2
  command -v logger >/dev/null && logger -t vendo-watchdog "$*"
}

# Compose's stack interpolation requires the env file be sourced; we
# don't `set -a` because .env.prod has values with embedded spaces
# (e.g. SMTP_FROM_NAME="Vendo Demo Clinic"). Compose itself
# reads .env.prod via --env-file, but `compose ps` and `up` resolve
# variable substitution from the calling shell — pass --env-file each
# time so we never depend on host-shell state.
COMPOSE="docker compose -f $COMPOSE_DIR/$COMPOSE_FILE --env-file $COMPOSE_DIR/.env.prod"

# Containers to watch. Keys are service names from compose; values are
# the corresponding `vendo-prod-*-1` container names actually running.
# The portal also gets the HTTP health probe — others rely solely on
# docker's own healthcheck.
declare -A SERVICES=(
  [portal]=vendo-prod-portal-1
  [medplum-server]=vendo-prod-medplum-server-1
  [medplum-backend]=vendo-prod-medplum-backend-1
  [postgres]=vendo-prod-postgres-1
  [redis]=vendo-prod-redis-1
)

# Returns "healthy" / "unhealthy" / "starting" / "none" / "missing".
docker_health() {
  local container="$1"
  local out
  out=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null)
  if [[ -z "$out" ]]; then echo missing; else echo "$out"; fi
}

# Returns 0 on HTTP 2xx within timeout; non-zero otherwise.
probe_portal_http() {
  curl -fsS --max-time "$HEALTH_TIMEOUT" -o /dev/null "$HEALTH_URL"
}

# Per-service failure counter & cooldown timestamp helpers.
fail_count_path()  { echo "$STATE_DIR/$1.fails"; }
last_restart_path(){ echo "$STATE_DIR/$1.last_restart"; }

read_int() { local p="$1"; if [[ -f "$p" ]]; then cat "$p"; else echo 0; fi; }
write_int(){ local p="$1"; echo "$2" > "$p"; }

cooldown_ok() {
  local svc="$1"
  local last; last=$(read_int "$(last_restart_path "$svc")")
  local now; now=$(date +%s)
  (( now - last >= COOLDOWN_SEC ))
}

restart_service() {
  local svc="$1"
  log "RESTART $svc — exceeded $FAIL_THRESHOLD failures"
  if ! cooldown_ok "$svc"; then
    log "$svc still in cooldown ($COOLDOWN_SEC s); skipping"
    return
  fi
  if $COMPOSE up -d --no-deps "$svc" >>"$LOG_FILE" 2>&1; then
    log "$svc restarted OK"
    write_int "$(last_restart_path "$svc")" "$(date +%s)"
    write_int "$(fail_count_path "$svc")" 0
  else
    log "$svc restart FAILED — see log tail"
  fi
}

check_one() {
  local svc="$1"
  local container="$2"
  local health; health=$(docker_health "$container")
  local ok=0

  case "$health" in
    healthy)
      ok=1 ;;
    starting|none)
      # Don't count startup-state ticks as failures — Docker's
      # built-in restart policy already handles startup-time crashes,
      # and "none" means the container has no healthcheck so we
      # treat it as healthy unless it's missing entirely.
      ok=1 ;;
    unhealthy)
      ok=0
      log "$svc docker-health=unhealthy" ;;
    missing)
      ok=0
      log "$svc container missing ($container) — compose will recreate" ;;
    *)
      log "$svc docker-health=$health (treating as unhealthy)"
      ok=0 ;;
  esac

  # The portal also gets an end-to-end HTTP probe. A healthy docker
  # status with a failing /api/health means the request handler is
  # stuck (e.g. Medplum unreachable or stuck event loop).
  if [[ "$svc" == "portal" && "$ok" == "1" ]]; then
    if ! probe_portal_http; then
      log "$svc HTTP probe failed"
      ok=0
    fi
  fi

  local fp; fp=$(fail_count_path "$svc")
  if (( ok == 1 )); then
    if [[ -f "$fp" ]] && (( $(read_int "$fp") > 0 )); then
      log "$svc recovered"
    fi
    write_int "$fp" 0
    return
  fi

  local fc; fc=$(($(read_int "$fp") + 1))
  write_int "$fp" "$fc"
  log "$svc fail #$fc / $FAIL_THRESHOLD"
  if (( fc >= FAIL_THRESHOLD )); then
    restart_service "$svc"
  fi
}

# Make sure compose can be invoked at all — if .env.prod is missing,
# bail loudly (the timer will retry next minute).
if [[ ! -f "$COMPOSE_DIR/.env.prod" ]]; then
  log "FATAL: $COMPOSE_DIR/.env.prod missing — cannot run compose"
  exit 0
fi

for svc in "${!SERVICES[@]}"; do
  check_one "$svc" "${SERVICES[$svc]}"
done

exit 0
