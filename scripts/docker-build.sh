#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="${1:-$(node scripts/version.mjs current)}"
PREFIX="${DOCKER_IMAGE_PREFIX:-hllink/mockdock}"

SERVER_IMAGE="${PREFIX}-server"
WEB_IMAGE="${PREFIX}-web"
ALL_IN_ONE_IMAGE="${PREFIX}"

docker build \
  --build-arg MOCKDOCK_VERSION="$VERSION" \
  -f apps/server/Dockerfile \
  -t "${SERVER_IMAGE}:${VERSION}" \
  -t "${SERVER_IMAGE}:latest" \
  .

docker build \
  --build-arg MOCKDOCK_VERSION="$VERSION" \
  -f apps/web/Dockerfile \
  -t "${WEB_IMAGE}:${VERSION}" \
  -t "${WEB_IMAGE}:latest" \
  .

docker build \
  --build-arg MOCKDOCK_VERSION="$VERSION" \
  -f Dockerfile.combined \
  -t "${ALL_IN_ONE_IMAGE}:${VERSION}" \
  -t "${ALL_IN_ONE_IMAGE}:latest" \
  .

printf 'Built images for version %s\n' "$VERSION"
