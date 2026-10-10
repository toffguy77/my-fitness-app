'use client'

import { RoleShell } from '@/shared/components/RoleShell'

export default function MenuLayout({ children }: { children: React.ReactNode }) {
    // A signed-out visitor is redirected by proxy.ts before this renders.
    return <RoleShell activeNavItem="menu">{children}</RoleShell>
}
