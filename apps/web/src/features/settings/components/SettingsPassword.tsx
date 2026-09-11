'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'
import { SettingsPageLayout } from './SettingsPageLayout'
import { PasswordInput } from '@/shared/components/forms/PasswordInput'
import { passwordSchema } from '@/features/auth/utils/validation'
import { messageFor } from '@/shared/errors/apiErrors'
import { changePassword } from '../api/settings'
import { providersApi } from '@/features/auth/api/providers'
import { requestPasswordReset } from '@/features/auth/api/passwordReset'
import { t } from '@/shared/i18n'

const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, t('settings.password.enterCurrent')),
        newPassword: passwordSchema,
        confirmPassword: z.string().min(1, t('settings.password.confirmNew')),
    })
    .superRefine((data, ctx) => {
        if (data.newPassword === data.confirmPassword) return
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['confirmPassword'],
            message: t('settings.password.mismatch'),
        })
    })

export function SettingsPassword() {
    return (
        <SettingsPageLayout title={t('settings.titles.password')}>
            {({ profile }) => <PasswordSection email={profile?.email ?? ''} />}
        </SettingsPageLayout>
    )
}

/**
 * An account created through a provider has no password, so the change form —
 * which starts by asking for the current one — cannot be filled in. Such a
 * person could set a password only by guessing that "forgot password" applies
 * to a password they never had.
 *
 * The reset flow is the mechanism either way; this only makes it reachable.
 */
function PasswordSection({ email }: { email: string }) {
    const [hasPassword, setHasPassword] = useState<boolean | null>(null)

    useEffect(() => {
        let cancelled = false
        providersApi
            .linked()
            .then((state) => {
                if (!cancelled) setHasPassword(state.has_password)
            })
            // Falling back to the change form is the safe direction: it is
            // wrong only for a passwordless account, and it says so plainly
            // when the server rejects the empty current password.
            .catch(() => {
                if (!cancelled) setHasPassword(true)
            })
        return () => {
            cancelled = true
        }
    }, [])

    if (hasPassword === null) {
        return <p className="py-8 text-center text-sm text-gray-500">{t('settings.password.loading')}</p>
    }

    return hasPassword ? <PasswordForm /> : <SetPasswordPanel email={email} />
}

function SetPasswordPanel({ email }: { email: string }) {
    const [sending, setSending] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState('')

    async function handleSend() {
        setError('')
        setSending(true)
        try {
            await requestPasswordReset(email)
            setSent(true)
        } catch (err) {
            setError(messageFor(err))
        } finally {
            setSending(false)
        }
    }

    if (sent) {
        return (
            <div className="rounded-lg bg-green-50 p-4 text-green-800">
                <p className="font-medium">{t('settings.password.linkSent', { email })}</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-600">{t('settings.password.noneYet')}</p>
            <p className="text-sm text-gray-600">{t('settings.password.setExplanation')}</p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
                onClick={handleSend}
                disabled={sending || !email}
                className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {sending ? t('settings.password.sending') : t('settings.password.sendSetLink')}
            </button>
        </div>
    )
}

function PasswordForm() {
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const [success, setSuccess] = useState(false)
    const [serverError, setServerError] = useState('')

    async function handleSave() {
        setServerError('')
        const result = changePasswordSchema.safeParse({ currentPassword, newPassword, confirmPassword })
        if (!result.success) {
            const fieldErrors: Record<string, string> = {}
            for (const issue of result.error.issues) {
                const field = issue.path[0] as string
                if (!fieldErrors[field]) fieldErrors[field] = issue.message
            }
            setErrors(fieldErrors)
            return
        }
        setErrors({})
        setSaving(true)
        try {
            await changePassword(currentPassword, newPassword)
            setSuccess(true)
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
        } catch (err) {
            // messageFor reads the server's code — a wrong current password is
            // its own code, not a failed sign-in and not an expired session.
            setServerError(messageFor(err))
        } finally {
            setSaving(false)
        }
    }

    if (success) {
        return (
            <div className="rounded-lg bg-green-50 p-4 text-green-800">
                <p className="font-medium">{t('settings.password.changed')}</p>
                <button
                    onClick={() => setSuccess(false)}
                    className="mt-3 text-sm text-green-700 underline"
                >
                    {t('settings.password.changeAgain')}
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <PasswordInput
                label={t('settings.password.current')}
                placeholder={t('settings.password.enterCurrent')}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={errors.currentPassword}
            />

            <PasswordInput
                label={t('settings.password.new')}
                placeholder={t('settings.password.newPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={errors.newPassword}
                showRequirements
            />

            <PasswordInput
                label={t('settings.password.confirmNew')}
                placeholder={t('settings.password.repeat')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
            />

            {serverError && (
                <p className="text-sm text-red-600">{serverError}</p>
            )}

            <button
                onClick={handleSave}
                disabled={saving}
                className="mt-3 w-full rounded-lg bg-blue-600 py-3 text-white font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? t('settings.saving') : t('settings.password.submit')}
            </button>
        </div>
    )
}

SettingsPassword.displayName = 'SettingsPassword'
