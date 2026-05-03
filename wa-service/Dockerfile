# syntax=docker/dockerfile:1.7
# WA service (Baileys + Socket.io). Pakai tsx di runtime — tidak perlu
# emit JS terpisah karena tsconfig saat ini noEmit:true (type-check only).
# Image final ~250 MB (banyak deps native: baileys, libsignal, dll).

# ─────────────────────────────────────────
# Stage 1 — deps & source
# ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci

# ─────────────────────────────────────────
# Stage 2 — runner
# ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN apk add --no-cache libc6-compat tini

# Non-root user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 wasvc

COPY --from=deps --chown=wasvc:nodejs /app/node_modules ./node_modules
COPY --chown=wasvc:nodejs package.json ./
COPY --chown=wasvc:nodejs tsconfig.json ./
COPY --chown=wasvc:nodejs src ./src

# Sessions volume — Baileys credentials disimpan di sini, di-mount oleh compose.
RUN mkdir -p /app/sessions && chown -R wasvc:nodejs /app/sessions

USER wasvc
EXPOSE 3001

# tini = init process — handle SIGTERM dengan benar supaya graceful shutdown
# (penting untuk Baileys yang perlu close socket bersih).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/index.ts"]
