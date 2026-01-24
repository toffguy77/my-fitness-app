/**
 * Example: LoginForm with integrated logging
 * Demonstrates best practices for logging in React components
 */

'use client'

import { useState } from 'react'
import { useLogger } from '@/shared/hooks/useLogger'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'

interface LoginFormProps {
    onSubmit?: (data: { email: string; password: string }) => void | Promise<void>
}

export function LoginFormWithLogging({ onSubmit }: LoginFormProps) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
    const [isLoading, setIsLoading] = useState(false)

    // Initialize logger with component context
    const { info, warn, error, logUserAction } = useLogger({
        component: 'LoginForm',
        autoLogMount: true,
        autoLogUnmount: true,
    })

    const validateEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        const isValid = emailRegex.test(email)

        if (!isValid) {
            warn('Invalid email format entered', { email_length: email.length })
        }

        return isValid
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        info('Login form submitted', {
            has_email: !!email,
            has_password: !!password,
        })

        const newErrors: { email?: string; password?: string } = {}

        if (!email) {
            newErrors.email = 'Обязательное поле'
            warn('Login attempt with empty email')
        } else if (!validateEmail(email)) {
            newErrors.email = 'Некорректный email'
        }

        if (!password) {
            newErrors.password = 'Обязательное поле'
            warn('Login attempt with empty password')
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            logUserAction('login_validation_failed', {
                errors: Object.keys(newErrors),
            })
            return
        }

        setIsLoading(true)
        const startTime = Date.now()

        try {
            info('Attempting login', { email })

            await onSubmit?.({ email, password })

            const duration = Date.now() - startTime
            info('Login successful', {
                email,
                duration_ms: duration,
            })

            logUserAction('login_success', {
                email,
                duration_ms: duration,
            })
        } catch (err) {
            const duration = Date.now() - startTime

            error('Login failed', err as Error, {
                email,
                duration_ms: duration,
            })

            logUserAction('login_failed', {
                email,
                error_message: (err as Error).message,
                duration_ms: duration,
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value)
        setErrors((prev) => ({ ...prev, email: undefined }))

        // Log user interaction (only in debug mode)
        if (process.env.NODE_ENV === 'development') {
            logUserAction('email_input_changed', {
                length: e.target.value.length,
            })
        }
    }

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value)
        setErrors((prev) => ({ ...prev, password: undefined }))
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="email" className="block text-sm font-medium">
                    Email
                </label>
                <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    aria-invalid={!!errors.email}
                />
                {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium">
                    Password
                </label>
                <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={handlePasswordChange}
                    aria-invalid={!!errors.password}
                />
                {errors.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                )}
            </div>

            <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Загрузка...' : 'Войти'}
            </Button>
        </form>
    )
}
