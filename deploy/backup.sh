#!/usr/bin/env bash
# نسخة احتياطية كاملة: قاعدة البيانات + الملفات المرفوعة.  الاستخدام: bash deploy/backup.sh [اسم]
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="${1:-manual}-$(date +%F_%H-%M-%S)"
DIR=/var/backups/mevix/$NAME
mkdir -p "$DIR"
# First install: nothing running yet, so nothing to back up.
if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then echo "(قاعدة البيانات مش شغالة، مفيش حاجة تتنسخ)" >&2; rmdir "$DIR"; echo "none"; exit 0; fi
docker compose exec -T db pg_dump -U mevix -Fc mevix > "$DIR/db.dump"
docker compose exec -T app tar czf - -C /data uploads > "$DIR/uploads.tar.gz" 2>/dev/null || echo "(مفيش ملفات مرفوعة لسه)"
# sanity: the dump must not be empty
[ -s "$DIR/db.dump" ] || { echo "✗ النسخة الاحتياطية فاضية، وقفت."; exit 1; }
echo "$DIR"
