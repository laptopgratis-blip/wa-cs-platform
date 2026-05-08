# bank-scraper — Puppeteer + Chromium service untuk scrape KlikBCA Individual.
# Service ini TIDAK ekspos port keluar (hanya internal network), dipanggil
# Next.js via http://bank-scraper:3002.
FROM node:20-bookworm-slim

# Chromium + dependencies untuk Puppeteer + openssl untuk Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-freefont-ttf \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    libasound2 \
    libxshmfence1 \
    ca-certificates \
    openssl \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Skip download Chromium dari Puppeteer — pakai apt version supaya update lewat
# OS package manager + lebih kecil image.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma

COPY src ./src

# Folder untuk screenshot debug + session cookies (di-mount volume di compose).
RUN mkdir -p /app/screenshots /app/sessions

# dumb-init = reaper untuk Chromium child process supaya tidak zombie.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]

EXPOSE 3002
