import type { Metadata } from 'next'

/**
 * Every sign-in screen is closed to search here, once.
 *
 * Only /auth and /auth/link/consume said so for themselves; /auth/complete,
 * /auth/email, /auth/link and /auth/verify-email were open to indexing. They
 * stay reachable to crawlers — public pages link to sign-in — so the answer is
 * noindex, not Disallow: a disallowed page is never fetched, and its noindex
 * is never read.
 */
export const metadata: Metadata = {
    robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return children
}
