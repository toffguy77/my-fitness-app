'use client'

import { RoleShell } from '@/shared/components/RoleShell'
import { useSession } from '@/shared/hooks/useSession'

export default function ContentLayout({ children }: { children: React.ReactNode }) {
    // Content is readable without an account; the difference is only whether it
    // is wrapped in the signed-in chrome. While the session is still being
    // restored the bare page is the safe answer — it is what a visitor sees,
    // and it does not flash navigation at somebody who has none.
    const session = useSession()

    if (session !== 'authenticated') {
        return <>{children}</>
    }

    return <RoleShell activeNavItem="content">{children}</RoleShell>
}
