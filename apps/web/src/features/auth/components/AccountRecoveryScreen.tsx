'use client'

/**
 * The way back, for somebody who asked to delete their account and came back.
 *
 * Thirty days is the cancellation window precisely because people change their
 * minds; signing in is the clearest evidence of that there is. Without this
 * screen the app would greet them as normal and then delete a year of their
 * data on schedule.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { accountApi } from '@/features/settings/api/account'
import { formatDate } from '@/shared/i18n'
import { messageFor } from '@/shared/errors/apiErrors'

export function AccountRecoveryScreen({
    scheduledFor,
    onDismiss,
}: {
    scheduledFor: string
    /** Clears the screen; the navigation is this component's own business. */
    onDismiss: () => void
}) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)

    const handleCancel = async () => {
        setBusy(true)
        try {
            await accountApi.cancelDeletion()
            toast.success('Удаление отменено')
            onDismiss()
            router.push('/dashboard')
        } catch (error) {
            toast.error(messageFor(error))
        } finally {
            setBusy(false)
        }
    }

    return (
        <main className="flex min-h-screen flex-col justify-center bg-gray-50 px-6">
            <div
                className="mx-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
                data-testid="account-recovery"
            >
                <h1 className="text-lg font-semibold text-gray-900">Аккаунт будет удалён</h1>
                <p className="mt-2 text-sm text-gray-600">
                    Вы запросили удаление аккаунта. Дневник питания, замеры, фотографии прогресса и
                    настройки будут удалены{' '}
                    <span className="font-medium text-gray-900">{formatDate(scheduledFor)}</span>.
                    До этого дня всё можно вернуть — одним нажатием.
                </p>

                <button
                    onClick={handleCancel}
                    disabled={busy}
                    className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                    {busy ? 'Отменяем...' : 'Отменить удаление'}
                </button>

                {/* Not a trap: somebody who meant it can carry on and let the
                    deletion happen. */}
                <button
                    onClick={() => {
                        onDismiss()
                        router.push('/dashboard')
                    }}
                    className="mt-3 w-full text-sm text-gray-600 hover:text-gray-900"
                >
                    Продолжить без отмены
                </button>
            </div>
        </main>
    )
}
