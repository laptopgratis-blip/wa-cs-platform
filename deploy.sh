#!/bin/bash
# Hulao — deploy script untuk VPS Ubuntu (Docker + Traefik)
# Pakai: bash deploy.sh
set -euo pipefail

echo "🚀 Deploy Hulao..."

# Pastikan .env.production ada — kalau tidak, abort.
if [ ! -f .env.production ]; then
  echo "❌ .env.production tidak ditemukan. Copy dari .env.production.template & isi dulu."
  exit 1
fi

echo "📥 Pull kode terbaru..."
# Branch produksi = chore/favicon-hulao (bukan main). Override via DEPLOY_BRANCH bila perlu.
git pull origin "${DEPLOY_BRANCH:-chore/favicon-hulao}"

echo "🔄 Jalankan database migrations (Prisma)..."
# Migrate via service `migrate` (target deps — punya prisma CLI). Image runner
# standalone tidak punya prisma CLI, jadi tidak bisa dipakai untuk migrate.
# `migrate deploy` aman di production: hanya apply migration yang sudah di-commit,
# tidak pernah generate baru atau prompt interactive.
docker compose run --rm migrate || {
  echo "⚠️  Migrate gagal — periksa DATABASE_URL atau migration files."
  exit 1
}

echo "🔨 Build images..."
docker compose build

echo "🔁 Restart containers..."
docker compose up -d

echo "⏳ Tunggu 5 detik supaya container settle..."
sleep 5

echo "📊 Status containers:"
docker compose ps

echo ""
echo "📝 Recent logs (10 baris terakhir per service):"
docker compose logs --tail=10 nextjs
echo "---"
docker compose logs --tail=10 wa-service

echo ""
echo "✅ Hulao berhasil di-deploy!"
echo "🌐 Cek: https://hulao.id"
