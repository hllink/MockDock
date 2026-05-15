#!/bin/sh
set -eu

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:52052}"
ESCAPED_BACKEND_URL="$(printf '%s' "$BACKEND_URL" | sed 's/[|&]/\\&/g')"
sed "s|__BACKEND_URL__|$ESCAPED_BACKEND_URL|g" \
  /etc/nginx/combined.conf.template \
  > /etc/nginx/http.d/default.conf

node /app/apps/server/dist/src/index.js &
server_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

cleanup() {
  kill "$server_pid" "$nginx_pid" 2>/dev/null || true
}

trap cleanup INT TERM

while kill -0 "$server_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 1
done

cleanup
wait "$server_pid" 2>/dev/null || true
wait "$nginx_pid" 2>/dev/null || true
