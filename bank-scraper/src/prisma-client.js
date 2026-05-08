// Singleton Prisma client untuk scraper service. DATABASE_URL di-inject
// dari .env.production via docker-compose env_file (sama URL dengan nextjs,
// resolve ke postgres container di internal network).
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  log: ['error', 'warn'],
})

module.exports = { prisma }
