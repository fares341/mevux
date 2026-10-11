#!/usr/bin/env bash
# استرجاع نسخة احتياطية.  الاستخدام: bash deploy/restore.sh /var/backups/mevix/<الاسم>
# بيعمل نسخة من الوضع الحالي الأول، عشان لو غيّرت رأيك.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:?اكتب مسار النسخة: ls /var/backups/mevix}"
[ -s "$SRC/db.dump" ] || { echo "✗ مفيش db.dump في $SRC"; exit 1; }
read -rp "هسترجع $SRC وهتتشال الداتا الحالية (هعمل لها نسخة الأول). اكتب نعم للتأكيد: " OK
[ "$OK" = "نعم" ] || { echo "اتلغى."; exit 1; }
echo ">> نسخة من الوضع الحالي قبل الاسترجاع"
bash deploy/backup.sh before-restore >/dev/null
docker compose stop app
docker compose exec -T db pg_restore -U mevix -d mevix --clean --if-exists --no-owner < "$SRC/db.dump"
if [ -s "$SRC/uploads.tar.gz" ]; then
  docker compose run --rm --no-deps -T --entrypoint sh app -c "rm -rf /data/uploads/* && tar xzf - -C /data" < "$SRC/uploads.tar.gz"
fi
docker compose start app
echo "✓ اتسترجعت $SRC"
