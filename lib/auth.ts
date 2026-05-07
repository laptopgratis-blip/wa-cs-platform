// NextAuth configuration — credentials (email/password) + Google OAuth.
// Pakai strategi JWT karena Credentials provider tidak kompatibel dengan
// database session di Prisma Adapter.
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const googleId = process.env.GOOGLE_CLIENT_ID
const googleSecret = process.env.GOOGLE_CLIENT_SECRET
const googleEnabled = Boolean(googleId && googleSecret)

export const authOptions: NextAuthOptions = {
  // Adapter tetap dipakai supaya akun Google tersimpan di tabel Account/User,
  // tapi session di-handle JWT (lihat session.strategy di bawah).
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        })
        if (!user || !user.password) return null

        const ok = await bcrypt.compare(parsed.data.password, user.password)
        if (!ok) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        }
      },
    }),
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: googleId!,
            clientSecret: googleSecret!,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Saat login pertama: salin id & role ke token. Skip validasi user-exists
      // di bawah karena baru ke-fetch dari authorize().
      if (user) {
        token.uid = user.id
        token.role = (user as { role?: 'USER' | 'ADMIN' | 'FINANCE' }).role ?? 'USER'
        token.userCheckedAt = Date.now()
        return token
      }
      // Refresh role dari DB kalau token sudah ada tapi role belum tersimpan
      // (mis. login pertama via Google → user dibuat oleh adapter).
      if (!token.role && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email as string },
          select: { id: true, role: true },
        })
        if (dbUser) {
          token.uid = dbUser.id
          token.role = dbUser.role
          token.userCheckedAt = Date.now()
        }
      }

      // Self-heal: validasi uid masih ada di DB. Cache 5 menit per token supaya
      // tidak hit DB tiap request. Kalau user sudah hilang (data loss / delete
      // admin), return token kosong — NextAuth treat as logged out, browser
      // otomatis redirect ke /login di request berikutnya tanpa error FK 500.
      if (token.uid) {
        const lastCheck = (token.userCheckedAt as number | undefined) ?? 0
        if (Date.now() - lastCheck > 5 * 60 * 1000) {
          const exists = await prisma.user.findUnique({
            where: { id: token.uid as string },
            select: { id: true },
          })
          if (!exists) return {} as typeof token
          token.userCheckedAt = Date.now()
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id
        session.user.role = (token.role as 'USER' | 'ADMIN' | 'FINANCE') ?? 'USER'
      }
      return session
    },
  },
  events: {
    async createUser({ user }) {
      // User dari OAuth (Google) belum punya TokenBalance — buatkan saldo awal.
      if (!user.id) return
      await prisma.tokenBalance.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, balance: 0 },
      })

      // Kalau email-nya cocok dengan ADMIN_EMAIL, naikkan role jadi ADMIN.
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()
      if (adminEmail && user.email?.toLowerCase() === adminEmail) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN' },
        })
      }
    },
  },
}
