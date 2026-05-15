#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="${1:-$(node scripts/version.mjs current)}"
PREFIX="${DOCKER_IMAGE_PREFIX:-mockdock}"

SERVER_IMAGE="${PREFIX}-server"
WEB_IMAGE="${PREFIX}-web"
ALL_IN_ONE_IMAGE="${PREFIX}"

for image in "$SERVER_IMAGE" "$WEB_IMAGE" "$ALL_IN_ONE_IMAGE"; do
  docker push "${image}:${VERSION}"
  docker push "${image}:latest"
done

printf 'Pushed images for version %s\n' "$VERSION"
