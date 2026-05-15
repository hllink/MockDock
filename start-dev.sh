#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # Load nvm for the current shell so the repo Node version can be selected.
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm not found at ${NVM_DIR:-$HOME/.nvm}/nvm.sh" >&2
  exit 1
fi

nvm use
pnpm dev
