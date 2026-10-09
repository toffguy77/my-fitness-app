'use client'

import { AdminConversationList } from '@/features/admin/components/AdminConversationList'

import { t } from '@/shared/i18n'
export default function AdminChatsPage() {
    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5">
            <h1 className="type-title-1 mb-5 text-fg">{t('admin.chats.allChats')}</h1>
            <AdminConversationList />
        </div>
    )
}
