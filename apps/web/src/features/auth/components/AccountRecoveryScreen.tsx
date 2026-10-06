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
import { formatDate, t } from '@/shared/i18n'
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
            toast.success(t('auth.recovery.cancelled'))
            onDismiss()
            router.push('/dashboard')
        } catch (error) {
            toast.error(messageFor(error))
        } finally {
            setBusy(false)
        }
    }

    return (
        <main className="flex min-h-screen flex-col justify-center bg-canvas px-6">
            <div
                className="mx-auto w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-sm"
                data-testid="account-recovery"
            >
                <h1 className="text-lg font-semibold text-fg">{t('auth.recovery.title')}</h1>
                <p className="mt-2 text-sm text-fg-muted">
                    {t('auth.recovery.body')}{' '}
                    <span className="font-medium text-fg">{formatDate(scheduledFor)}</span>.{' '}
                    {t('auth.recovery.reassurance')}
                </p>

                <button
                    onClick={handleCancel}
                    disabled={busy}
                    className="mt-6 w-full rounded-lg bg-primary py-3 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                    {busy ? t('auth.recovery.cancelling') : t('auth.recovery.cancel')}
                </button>

                {/* Not a trap: somebody who meant it can carry on and let the
                    deletion happen. */}
                <button
                    onClick={() => {
                        onDismiss()
                        router.push('/dashboard')
                    }}
                    className="mt-3 w-full text-sm text-fg-muted hover:text-fg"
                >
                    {t('auth.recovery.continueAnyway')}
                </button>
            </div>
        </main>
    )
}
