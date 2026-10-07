'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { Input } from '@/shared/components/ui/Input'
import { Button, buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { AuthPanel, AuthShell, AuthStatusIcon } from '@/features/auth/components/AuthShell'
import { cn } from '@/shared/utils/cn'
import toast from 'react-hot-toast'
import { requestPasswordReset } from '@/features/auth/api/passwordReset'
import { isApiError, serverMessageFrom } from '@/shared/errors/apiErrors'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [error, setError] = useState('')

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        const trimmedEmail = email.trim()
        setEmail(trimmedEmail)

        // Validate email
        if (!trimmedEmail) {
            setError('Введите email')
            return
        }

        if (!validateEmail(trimmedEmail)) {
            setError('Введите корректный email адрес')
            return
        }

        setIsLoading(true)

        try {
            await requestPasswordReset(trimmedEmail)

            setIsSubmitted(true)
            toast.success('Проверьте почту для инструкций по сбросу пароля')
        } catch (err) {
            const serverMessage = serverMessageFrom(err)
            let errorMessage: string
            if (isApiError(err) && err.status === 429) {
                errorMessage = 'Слишком много запросов. Попробуйте позже.'
            } else if (serverMessage) {
                errorMessage = serverMessage
            } else if (isApiError(err)) {
                errorMessage = 'Не удалось отправить письмо'
            } else {
                errorMessage = 'Произошла ошибка'
            }
            setError(errorMessage)
            toast.error(errorMessage)
        } finally {
            setIsLoading(false)
        }
    }

    if (isSubmitted) {
        return (
            <AuthShell
                centered
                logo={false}
                icon={
                    <AuthStatusIcon tone="success">
                        <MailCheck className="h-7 w-7" strokeWidth={1.8} />
                    </AuthStatusIcon>
                }
                title="Проверьте почту"
                description={
                    <>
                        Если аккаунт с адресом <strong className="font-semibold text-fg">{email}</strong> существует, вы получите инструкции по сбросу пароля.
                    </>
                }
            >
                <p className="text-center text-sm text-fg-muted">
                    Не получили письмо? Проверьте папку "Спам" или попробуйте снова.
                </p>

                <div className="mt-8 space-y-2">
                    <Button
                        onClick={() => {
                            setIsSubmitted(false)
                            setEmail('')
                        }}
                        variant="secondary"
                        size="lg"
                        className="w-full"
                    >
                        Попробовать другой email
                    </Button>

                    <Link href="/auth" className={cn(buttonBase, buttonVariants.ghost, buttonSizes.lg, 'w-full')}>
                        Вернуться к входу
                    </Link>
                </div>
            </AuthShell>
        )
    }

    return (
        <AuthShell
            title="Забыли пароль?"
            description="Введите ваш email и мы отправим инструкции по сбросу пароля."
        >
            <AuthPanel>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-fg-muted">
                            Email адрес
                        </label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value)
                                setError('')
                            }}
                            placeholder="your.email@example.com"
                            error={error}
                            disabled={isLoading}
                            autoFocus
                            required
                        />
                    </div>

                    <Button type="submit" size="lg" className="w-full" isLoading={isLoading} disabled={isLoading}>
                        {isLoading ? 'Отправка...' : 'Отправить инструкции'}
                    </Button>
                </form>
            </AuthPanel>

            <div className="mt-6 flex justify-center">
                <Link
                    href="/auth"
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary"
                >
                    <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Вернуться к входу
                </Link>
            </div>
        </AuthShell>
    )
}
