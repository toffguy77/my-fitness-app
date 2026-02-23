'use client'

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
            <div className="flex flex-col gap-1.5">
                <label className="font-medium text-gray-900" htmlFor="settings-telegram">
                    Ник в Telegram
                </label>
                <p className="text-sm text-gray-500">Привяжи свой @username</p>
                <input
                    id="settings-telegram"
                    type="text"
                    value={telegram}
                    onChange={(e) => onTelegramChange(e.target.value)}
                    placeholder="@username"
                    className="w-full rounded-xl bg-blue-50 px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                />
            </div>

            {/* Instagram */}
            <div className="flex flex-col gap-1.5">
                <label className="font-medium text-gray-900" htmlFor="settings-instagram">
                    Профиль в Instagram
                </label>
                <p className="text-sm text-gray-500">
                    В формате @твойпрофиль, например: @zingilevskiy
                </p>
                <input
                    id="settings-instagram"
                    type="text"
                    value={instagram}
                    onChange={(e) => onInstagramChange(e.target.value)}
                    placeholder="@profile"
                    className="w-full rounded-xl bg-blue-50 px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                />
            </div>
        </div>
    )
}

SocialAccountsForm.displayName = 'SocialAccountsForm'
