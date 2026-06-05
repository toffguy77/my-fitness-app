'use client'

import { useState } from 'react'
import { z } from 'zod'
import { SettingsPageLayout } from './SettingsPageLayout'
import { PasswordInput } from '@/shared/components/forms/PasswordInput'
import { passwordSchema } from '@/features/auth/utils/validation'
import { changePassword } from '../api/settings'

const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'Введите текущий пароль'),
        newPassword: passwordSchema,
        confirmPassword: z.string().min(1, 'Подтвердите новый пароль'),
    })
    .superRefine((data, ctx) => {
        if (data.newPassword === data.confirmPassword) return
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['confirmPassword'],
            message: 'Пароли не совпадают',
        })
    })

export function SettingsPassword() {
    return (
        <SettingsPageLayout title="Изменить пароль">
            {() => <PasswordForm />}
        </SettingsPageLayout>
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
            const msg = err instanceof Error ? err.message : 'Не удалось изменить пароль'
            setServerError(msg)
        } finally {
            setSaving(false)
        }
    }

    if (success) {
        return (
            <div className="rounded-lg bg-green-50 p-4 text-green-800">
                <p className="font-medium">Пароль успешно изменён</p>
                <button
                    onClick={() => setSuccess(false)}
                    className="mt-3 text-sm text-green-700 underline"
                >
                    Изменить ещё раз
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <PasswordInput
                label="Текущий пароль"
                placeholder="Введите текущий пароль"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={errors.currentPassword}
            />

            <PasswordInput
                label="Новый пароль"
                placeholder="Минимум 8 символов"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={errors.newPassword}
                showRequirements
            />

            <PasswordInput
                label="Подтвердите новый пароль"
                placeholder="Повторите новый пароль"
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
                {saving ? 'Сохранение...' : 'Изменить пароль'}
            </button>
        </div>
    )
}

SettingsPassword.displayName = 'SettingsPassword'
