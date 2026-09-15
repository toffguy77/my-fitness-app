'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { telegramApi, type TelegramLinkState } from '@/features/settings/api/telegram'
import { isApiError } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'

/**
 * Подключение Telegram к аккаунту.
 *
 * Почему ссылка, а не поле для имени пользователя: Telegram-бот не может
 * написать первым. Bot API принимает числовой идентификатор чата, и узнать его
 * можно единственным способом — человек сам открыл бота. Поле
 * «telegram_username» в настройках этому не помогает: по имени бот отправить не
 * может, и попытка не возвращает ошибку — она просто ничего не доставляет.
 *
 * Поэтому состояние здесь читается из привязки, а не из заполненности имени:
 * иначе экран обещал бы уведомления, которые никогда не придут.
 */
export function SettingsTelegram() {
    const [state, setState] = useState<TelegramLinkState | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [unavailable, setUnavailable] = useState(false)

    useEffect(() => {
        async function load() {
            try {
                setState(await telegramApi.status())
            } catch {
                toast.error(t('settings.telegram.loadFailed'))
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const handleConnect = async () => {
        setBusy(true)
        try {
            const link = await telegramApi.connect()
            // Открываем бота: без этого шага chat_id узнать неоткуда.
            window.open(link.url, '_blank', 'noopener,noreferrer')
            toast.success(t('settings.telegram.openBot'))
        } catch (error) {
            if (isApiError(error) && error.status === 503) {
                setUnavailable(true)
            } else {
                toast.error(t('settings.telegram.connectFailed'))
            }
        } finally {
            setBusy(false)
        }
    }

    const handleDisconnect = async () => {
        setBusy(true)
        try {
            setState(await telegramApi.disconnect())
            toast.success(t('settings.telegram.disconnected'))
        } catch {
            toast.error(t('settings.telegram.disconnectFailed'))
        } finally {
            setBusy(false)
        }
    }

    if (loading) {
        return <p className="py-8 text-center text-sm text-gray-500">{t('settings.loading')}</p>
    }

    return (
        <section>
            <h2 className="text-sm font-bold text-gray-900">{t('settings.telegram.heading')}</h2>
            <p className="mt-1 text-sm text-gray-600">{t('settings.telegram.explanation')}</p>

            {unavailable ? (
                <p className="mt-4 text-sm text-gray-500">{t('settings.telegram.unavailable')}</p>
            ) : state?.linked ? (
                <div className="mt-4 flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-900">
                        {t('settings.telegram.connected')}
                        {state.username ? ` · @${state.username}` : ''}
                    </span>
                    <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={busy}
                        className="text-sm font-medium text-red-600 disabled:opacity-50"
                    >
                        {t('settings.telegram.disconnect')}
                    </button>
                </div>
            ) : (
                <div className="mt-4">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-gray-500">
                            {t('settings.telegram.notConnected')}
                        </span>
                        <button
                            type="button"
                            onClick={handleConnect}
                            disabled={busy}
                            className="text-sm font-medium text-blue-600 disabled:opacity-50"
                        >
                            {t('settings.telegram.connect')}
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{t('settings.telegram.whyLink')}</p>
                </div>
            )}
        </section>
    )
}
