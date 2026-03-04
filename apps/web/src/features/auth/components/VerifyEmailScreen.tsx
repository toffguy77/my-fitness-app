'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { verifyEmail, resendVerificationCode } from '@/features/auth/api/verification'
import { CodeInput } from './CodeInput'

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

    const handleSubmit = useCallback(async () => {
        const codeStr = code.join('')
        if (codeStr.length !== 6) return

        setIsLoading(true)
        setError(null)

        try {
            await verifyEmail(codeStr)
            toast.success('Email подтверждён')

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
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Ошибка проверки кода'
            setError(msg)
            setAttempts((a) => a + 1)
            setCode(Array(6).fill(''))
        } finally {
            setIsLoading(false)
        }
    }, [code, router])

    // Auto-submit when all 6 digits entered
    useEffect(() => {
        if (code.every((d) => d !== '') && !isLoading) {
            handleSubmit()
        }
    }, [code, isLoading, handleSubmit])

    async function handleResend() {
        setError(null)
        setAttempts(0)
        try {
            await resendVerificationCode()
            toast.success('Код отправлен повторно')
            setResendCooldown(60)
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Не удалось отправить код'
            toast.error(msg)
        }
    }

    const isBlocked = attempts >= 5

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-md px-4 pb-8 pt-24">
                <h2 className="mb-2 text-center text-xl font-bold text-gray-900">
                    Подтверждение email
                </h2>
                <p className="mb-8 text-center text-sm text-gray-500">
                    Мы отправили код на {userEmail}
                </p>

                <div className="mb-6">
                    <CodeInput
                        value={code}
                        onChange={setCode}
                        disabled={isLoading || isBlocked}
                        error={!!error}
                    />
                </div>

                {error && (
                    <p className="mb-4 text-center text-sm text-red-600">{error}</p>
                )}

                {isBlocked && (
                    <p className="mb-4 text-center text-sm text-gray-600">
                        Слишком много попыток. Запросите новый код.
                    </p>
                )}

                <div className="text-center">
                    <button
                        type="button"
                        disabled={resendCooldown > 0}
                        onClick={handleResend}
                        className="text-sm text-blue-600 transition-colors hover:text-blue-700 disabled:text-gray-400"
                    >
                        {resendCooldown > 0
                            ? `Отправить повторно (${resendCooldown}с)`
                            : 'Отправить повторно'}
                    </button>
                </div>
            </div>
        </div>
    )
}
