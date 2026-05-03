// Augmentasi tipe NextAuth: tambahkan id & role ke session.user dan ke JWT.
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'USER' | 'ADMIN' | 'FINANCE'
    } & DefaultSession['user']
  }

  interface User {
    role?: 'USER' | 'ADMIN' | 'FINANCE'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string
    role?: 'USER' | 'ADMIN' | 'FINANCE'
  }
}
