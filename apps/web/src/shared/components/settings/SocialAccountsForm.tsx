'use client'

import { cn } from '@/shared/utils/cn'
import { fieldClass, fieldLabelClass } from '../forms/fieldStyles'

export interface SocialAccountsFormProps {
    telegram: string
    instagram: string
    onTelegramChange: (value: string) => void
    onInstagramChange: (value: string) => void
}

export function SocialAccountsForm({
    telegram,
    instagram,
    onTelegramChange,
    onInstagramChange,
}: SocialAccountsFormProps) {
    return (
        <div className="flex flex-col gap-6">
            {/* Telegram */}
            <div>
                <label className={cn(fieldLabelClass, 'mb-0')} htmlFor="settings-telegram">
                    Ник в Telegram
                </label>
                <p id="settings-telegram-hint" className="mb-1.5 type-caption text-fg-subtle">
                    Привяжи свой @username
                </p>
                <input
                    id="settings-telegram"
                    type="text"
                    value={telegram}
                    onChange={(e) => onTelegramChange(e.target.value)}
                    placeholder="@username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    aria-describedby="settings-telegram-hint"
                    className={fieldClass}
                />
            </div>

            {/* Instagram */}
            <div>
                <label className={cn(fieldLabelClass, 'mb-0')} htmlFor="settings-instagram">
                    Профиль в Instagram
                </label>
                <p id="settings-instagram-hint" className="mb-1.5 type-caption text-fg-subtle">
                    В формате @твойпрофиль, например: @zingilevskiy
                </p>
                <input
                    id="settings-instagram"
                    type="text"
                    value={instagram}
                    onChange={(e) => onInstagramChange(e.target.value)}
                    placeholder="@profile"
                    autoCapitalize="none"
                    autoCorrect="off"
                    aria-describedby="settings-instagram-hint"
                    className={fieldClass}
                />
            </div>
        </div>
    )
}

SocialAccountsForm.displayName = 'SocialAccountsForm'
