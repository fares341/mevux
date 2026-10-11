#!/usr/bin/env bash
# تحديث السيستم بعد رفع نسخة جديدة من الكود:  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --build db app caddy
docker compose --profile tools run --rm tools npm run db:push
echo "تم التحديث."
