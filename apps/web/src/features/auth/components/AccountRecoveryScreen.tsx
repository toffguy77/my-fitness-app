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
import { Button } from '@/shared/components/ui/Button'
import { AuthPanel, AuthShell } from './AuthShell'

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
        <AuthShell centered data-testid="account-recovery">
            <AuthPanel>
                <h1 className="type-title-2 text-fg">{t('auth.recovery.title')}</h1>
                <p className="mt-3 type-body text-fg-muted">
                    {t('auth.recovery.body')}{' '}
                    <span className="font-semibold text-fg tabular-nums">{formatDate(scheduledFor)}</span>.{' '}
                    {t('auth.recovery.reassurance')}
                </p>

                <div className="mt-8 space-y-2">
                    <Button onClick={handleCancel} isLoading={busy} disabled={busy} size="lg" block>
                        {busy ? t('auth.recovery.cancelling') : t('auth.recovery.cancel')}
                    </Button>

                    {/* Not a trap: somebody who meant it can carry on and let the
                        deletion happen. */}
                    <Button
                        variant="ghost"
                        size="lg"
                        block
                        onClick={() => {
                            onDismiss()
                            router.push('/dashboard')
                        }}
                        className="text-fg-muted"
                    >
                        {t('auth.recovery.continueAnyway')}
                    </Button>
                </div>
            </AuthPanel>
        </AuthShell>
    )
}
