import type { Metadata } from 'next'

// The page itself is a client component and cannot export metadata. The link
// that opens it carries a personal token: an indexed copy would let a stranger
// unsubscribe its owner.
export const metadata: Metadata = {
    title: 'Отписка от писем',
    robots: { index: false, follow: false },
}

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
    return children
}
