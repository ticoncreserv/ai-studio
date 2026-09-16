#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/fixtures/laravel-app"
mkdir -p "$TARGET/public" "$TARGET/resources/js/Pages/Quotes" "$TARGET/app/Models" "$TARGET/routes"
echo "Fixture app is checked in at fixtures/laravel-app (no vendor/ or node_modules)."
if command -v php >/dev/null 2>&1; then
  php "$TARGET/artisan" route:list --json >/dev/null
  echo "artisan route:list --json ok"
else
  echo "PHP is not installed; fixture artisan checks are skipped. Production preview uses php artisan serve on the cloned app."
fi
