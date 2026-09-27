'use client'

import { RoleShell } from '@/shared/components/RoleShell'

export default function FoodTrackerLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <RoleShell activeNavItem="food-tracker">{children}</RoleShell>
}
