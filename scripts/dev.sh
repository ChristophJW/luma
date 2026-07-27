#!/usr/bin/env bash
# Run the whole local stack in one terminal.
#
#   ./scripts/dev.sh              api + guest + host
#   ./scripts/dev.sh api guest    only those
#
# Ctrl-C stops everything — the trap kills the whole process group, so no
# orphaned Vite or Metro servers are left holding ports.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVICES=("$@")
if [ ${#SERVICES[@]} -eq 0 ]; then
  SERVICES=(api guest host)
fi

# Colour prefixes so three interleaved logs stay readable.
declare -A COLOUR=([api]=$'\033[33m' [guest]=$'\033[36m' [host]=$'\033[35m')
RESET=$'\033[0m'

PIDS=()

cleanup() {
  echo ""
  echo "stopping…"
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

prefix() {
  local name=$1
  local colour=${COLOUR[$name]:-}
  while IFS= read -r line; do
    printf '%s%-6s%s | %s\n' "$colour" "$name" "$RESET" "$line"
  done
}

start() {
  local name=$1
  shift
  ( "$@" 2>&1 | prefix "$name" ) &
  PIDS+=($!)
}

if [ ! -f .env ]; then
  echo "No .env found. Run 'make setup' first." >&2
  exit 1
fi

if ! docker compose ps --status running --quiet postgres >/dev/null 2>&1; then
  echo "Infrastructure is not running. Starting it…"
  docker compose up -d
fi

for service in "${SERVICES[@]}"; do
  case "$service" in
    api)
      # 0.0.0.0 so a phone on the same wifi can reach it.
      start api uv run --directory api python manage.py runserver 0.0.0.0:8000
      ;;
    guest)
      start guest npm run dev --workspace guest
      ;;
    host)
      start host npm run dev --workspace host
      ;;
    worker)
      start worker uv run --directory api celery -A config worker -l info -Q default,inference
      ;;
    *)
      echo "Unknown service: $service" >&2
      exit 1
      ;;
  esac
done

echo ""
echo "  API     http://127.0.0.1:8000/api/docs"
echo "  Guest   http://127.0.0.1:5173"
echo "  Host    http://127.0.0.1:8081   (press w in the Expo terminal for web)"
echo ""
echo "Ctrl-C stops everything."
echo ""

wait
