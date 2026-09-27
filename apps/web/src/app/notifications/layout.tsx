'use client'

import { RoleShell } from '@/shared/components/RoleShell'

export default function NotificationsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Сюда попадают по колокольчику из любой оболочки, включая кураторскую и
    // административную, — значит оболочку выбирает роль, а не эта страница.
    return <RoleShell>{children}</RoleShell>
}
