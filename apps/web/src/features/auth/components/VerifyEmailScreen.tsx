'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { verifyEmail, resendVerificationCode } from '@/features/auth/api/verification'
import { CodeInput } from './CodeInput'
import { AuthPanel, AuthShell } from './AuthShell'
import { t } from '@/shared/i18n'
import { serverMessageFrom } from '@/shared/errors/apiErrors'

export function VerifyEmailScreen() {
    const router = useRouter()
    const [code, setCode] = useState<string[]>(Array(6).fill(''))
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [resendCooldown, setResendCooldown] = useState(60)
    const [attempts, setAttempts] = useState(0)

    // Get email from localStorage for display
    const userEmail = typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('user') || '{}').email || ''
        : ''

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return
        const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
        return () => clearTimeout(timer)
    }, [resendCooldown])

    const submittingRef = useRef(false)

    const handleSubmit = useCallback(async () => {
        const codeStr = code.join('')
        if (codeStr.length !== 6) return
        if (submittingRef.current) return
        submittingRef.current = true

        setIsLoading(true)
        setError(null)

        try {
            await verifyEmail(codeStr)
            toast.success(t('auth.verify.confirmed'))

            // Update user in localStorage
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            user.email_verified = true
            localStorage.setItem('user', JSON.stringify(user))

            // Navigate based on onboarding status
            if (!user.onboarding_completed) {
                router.push('/onboarding')
            } else {
                router.push('/dashboard')
            }
        } catch (err) {
            const msg = serverMessageFrom(err) || (err instanceof Error ? err.message : '') || t('auth.verify.checkFailed')
            setError(msg)
            setAttempts((a) => a + 1)
            setCode(Array(6).fill(''))
        } finally {
            submittingRef.current = false
            setIsLoading(false)
        }
    }, [code, router])

    // Auto-submit when all 6 digits entered. Wrapped so the submission — which
    // sets state — is not a synchronous update inside the effect body.
    useEffect(() => {
        if (!code.every((d) => d !== '') || isLoading) return

        async function submit() {
            await handleSubmit()
        }
        submit()
    }, [code, isLoading, handleSubmit])

    async function handleResend() {
        setError(null)
        setAttempts(0)
        try {
            await resendVerificationCode()
            toast.success(t('auth.verify.resent'))
            setResendCooldown(60)
        } catch (err) {
            const msg = serverMessageFrom(err) || t('auth.verify.resendFailed')
            toast.error(msg)
        }
    }

    const isBlocked = attempts >= 5

    return (
        <AuthShell
            title={t('auth.verify.title')}
            description={t('auth.verify.sentTo', { email: userEmail })}
        >
            <AuthPanel>
                <CodeInput
                    value={code}
                    onChange={setCode}
                    disabled={isLoading || isBlocked}
                    error={!!error}
                />

                {error && (
                    <p className="mt-4 text-center text-sm text-danger-fg">{error}</p>
                )}

                {isBlocked && (
                    <p className="mt-4 text-center text-sm text-fg-muted">
                        {t('auth.verify.tooManyAttempts')}
                    </p>
                )}

                <div className="mt-6 flex justify-center">
                    <button
                        type="button"
                        disabled={resendCooldown > 0}
                        onClick={handleResend}
                        className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-primary tabular-nums transition-colors hover:bg-subtle disabled:font-normal disabled:text-fg-subtle disabled:hover:bg-transparent"
                    >
                        {resendCooldown > 0
                            ? t('auth.verify.resendIn', { seconds: resendCooldown })
                            : t('auth.verify.resend')}
                    </button>
                </div>
            </AuthPanel>
        </AuthShell>
    )
}
