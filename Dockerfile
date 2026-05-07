# syntax=docker/dockerfile:1.7
# Multi-stage build untuk Next.js — standalone output.
# Pakai node:20-bookworm-slim (Debian glibc) bukan Alpine karena sharp punya
# prebuilt binary untuk glibc — Alpine perlu compile dari source dgn node-gyp,
# python, vips-dev (~5+ menit build).
# Image final ~150-200 MB.

# ─────────────────────────────────────────
# Stage 1 — deps
# ─────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# OpenSSL untuk Prisma engine. Tidak perlu install vips-dev — sharp pakai
# prebuilt binary yg sudah include libvips.
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install dependency dulu (layer ini cache di sebagian besar build).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ─────────────────────────────────────────
# Stage 2 — builder
# ─────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Copy dep + source code lengkap untuk build.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (perlu sebelum next build karena di-import di kode).
RUN npx prisma generate --generator client

# Telemetry off + production build.
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SOCKET_URL=https://hulao.id
ARG NEXT_PUBLIC_APP_URL=https://hulao.id
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build

# ─────────────────────────────────────────
# Stage 3 — runner (image final)
# ─────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# OpenSSL untuk Prisma. Bookworm-slim sudah include libvips runtime via
# sharp prebuilt — tidak perlu install terpisah.
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output sudah include node_modules minimal yang ditrace.
# Lihat https://nextjs.org/docs/app/api-reference/next-config-js/output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Script-script one-off (mis. migration data). Standalone trace tidak include
# scripts/ karena bukan bagian dari app code, jadi copy manual.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Sediakan folder uploads (akan di-mount sebagai volume oleh docker compose).
RUN mkdir -p /app/public/uploads/proofs /app/public/uploads/lp-images \
 && chown -R nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
