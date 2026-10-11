#!/usr/bin/env bash
# تثبيت وتأمين السيستم على VPS (Ubuntu) — شغّله مرة واحدة كـ root من داخل مجلد المشروع:
#   bash deploy/install.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo ">> تحديث النظام وتثبيت الأدوات"
apt-get update -y && apt-get upgrade -y
apt-get install -y ufw fail2ban unattended-upgrades curl openssl
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo ">> الفايروول: SSH و 80 و 443 فقط"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ">> حماية SSH من التخمين + تحديثات أمنية تلقائية"
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

if [ ! -f .env ]; then
  IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')
  read -rp "اسم المستخدم للمدير [admin]: " AU; AU=${AU:-admin}
  read -rp "اسمك: " AN
  read -rsp "كلمة مرور المدير (10 أحرف على الأقل): " AP; echo
  cat > .env <<EOF
SITE_ADDRESS=https://$IP
DB_PASSWORD=$(openssl rand -hex 24)
APP_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=$AU
ADMIN_NAME=$AN
ADMIN_PASSWORD=$AP
EOF
  chmod 600 .env
fi

echo ">> بناء وتشغيل السيستم"
docker compose up -d --build db app caddy
docker compose --profile tools run --rm tools npm run db:push
docker compose --profile tools run --rm tools npm run seed

echo ">> باك أب يومي لقاعدة البيانات (آخر 14 يوم)"
mkdir -p /var/backups/mevix
cat > /etc/cron.daily/mevix-backup <<EOF
#!/bin/sh
cd $(pwd) && docker compose exec -T db pg_dump -U mevix mevix | gzip > /var/backups/mevix/db-\$(date +%F).sql.gz
find /var/backups/mevix -name 'db-*.sql.gz' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/mevix-backup

echo
echo "تم. افتح: $(grep SITE_ADDRESS .env | cut -d= -f2)"
echo "احفظ كلمات مرور الفريق المطبوعة فوق، لن تظهر مرة أخرى."
