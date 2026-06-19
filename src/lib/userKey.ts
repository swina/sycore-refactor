import { auth } from '@/lib/auth'
export const userKey = (key: string) => `${auth.currentUser?.uid ?? 'anon'}_${key}`
