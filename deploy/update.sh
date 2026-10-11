#!/usr/bin/env bash
# تحديث آمن:  bash deploy/update.sh
# 1) نسخة احتياطية  2) بناء النسخة الجديدة  3) تعديلات قاعدة البيانات (بتقف لو فيها مسح)  4) تشغيل النسخة الجديدة
# لو أي خطوة فشلت، السيستم القديم بيفضل شغال والداتا زي ما هي.
set -euo pipefail
cd "$(dirname "$0")/.."
echo ">> 1/4 نسخة احتياطية قبل التحديث"
BK=$(bash deploy/backup.sh pre-update)
echo "   اتحفظت في $BK"
echo ">> 2/4 بناء النسخة الجديدة (السيستم الحالي لسه شغال)"
docker compose build app tools
echo ">> 3/4 تعديلات قاعدة البيانات"
if ! docker compose --profile tools run --rm tools npm run db:migrate; then
  echo "✗ التحديث وقف قبل ما يغيّر حاجة. السيستم القديم شغال زي ما هو، والنسخة الاحتياطية في $BK"
  exit 1
fi
echo ">> 4/4 تشغيل النسخة الجديدة"
docker compose up -d db app caddy
# keep the last 20 pre-update backups
ls -1dt /var/backups/mevix/pre-update-* 2>/dev/null | tail -n +21 | xargs -r rm -rf
echo "✓ اتحدّث. لو فيه مشكلة: bash deploy/restore.sh $BK"
