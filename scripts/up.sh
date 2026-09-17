#!/usr/bin/env bash
# One-shot local bootstrap: nvm use, corepack enable, pnpm install, pnpm dev.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() {
  printf '[atelier] %s\n' "$*"
}

wanted="$(tr -d '[:space:]' < .nvmrc)"

source_nvm() {
  if [[ -z "${NVM_DIR:-}" ]]; then
    if [[ -s "$HOME/Library/Application Support/Herd/config/nvm/nvm.sh" ]]; then
      export NVM_DIR="$HOME/Library/Application Support/Herd/config/nvm"
    else
      export NVM_DIR="$HOME/.nvm"
    fi
  fi
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    return 0
  fi
  local brew
  for brew in /opt/homebrew/opt/nvm/nvm.sh /usr/local/opt/nvm/nvm.sh; do
    if [[ -s "$brew" ]]; then
      # shellcheck disable=SC1090
      . "$brew"
      return 0
    fi
  done
  return 1
}

node_major() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || true
}

if source_nvm; then
  nvm use || nvm install
else
  log "nvm not found; using PATH node"
fi

if [[ "$(node_major)" != "$wanted" ]]; then
  log "Node ${wanted} is required (see .nvmrc). Current: $(command -v node 2>/dev/null || echo missing) $(node -v 2>/dev/null || true)"
  log "Install nvm (or Laravel Herd) and retry."
  exit 1
fi

if ! command -v corepack >/dev/null 2>&1; then
  log "corepack is missing. Node ${wanted} should ship it."
  exit 1
fi

corepack enable
pnpm install
exec pnpm dev
