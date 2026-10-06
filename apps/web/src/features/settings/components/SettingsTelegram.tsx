'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { telegramApi, type TelegramLinkState } from '@/features/settings/api/telegram'
import { isApiError, messageForOr } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { CheckCircle2, ExternalLink, Info } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { SettingsCard, SettingsRow, SettingsSection } from './SettingsSection'

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
    const [groupLink, setGroupLink] = useState<string | null>(null)

    useEffect(() => {
        async function load() {
            try {
                setState(await telegramApi.status())
            } catch (err) {
                toast.error(messageForOr(err, t('settings.telegram.loadFailed')))
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    /**
     * Ссылка в рабочую группу — тем, кто не привязал Telegram.
     *
     * Обработчик существует ровно для них: боту некуда им написать, он не пишет
     * первым. Спрашивать её у привязанного человека незачем — он уже получает
     * сообщения; предлагать войти туда, где он есть, тем более.
     *
     * Ответ `503` означает, что группа не настроена или приглашение не положено.
     * Тогда ничего не показывается и ничего не сообщается: это не ошибка
     * человека и не повод занимать его внимание.
     */
    useEffect(() => {
        // Привязан или состояние ещё не прочитано — спрашивать нечего. Сбрасывать
        // прежнее значение здесь не нужно: ссылка рисуется только в ветке «не
        // привязан», так что показать её привязанному человеку она не может.
        if (!state || state.linked) return

        let cancelled = false
        void (async () => {
            try {
                const invite = await telegramApi.groupInvite()
                if (!cancelled) setGroupLink(invite.invite_link)
            } catch {
                if (!cancelled) setGroupLink(null)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [state])

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
        } catch (err) {
            toast.error(messageForOr(err, t('settings.telegram.disconnectFailed')))
        } finally {
            setBusy(false)
        }
    }

    if (loading) {
        return <p className="py-8 text-center text-sm text-fg-muted">{t('settings.loading')}</p>
    }

    return (
        <SettingsSection
            title={t('settings.telegram.heading')}
            titleId="settings-telegram-heading"
            description={t('settings.telegram.explanation')}
        >
            {unavailable ? (
                <p className="flex items-start gap-2 rounded-tile bg-info-soft p-4 text-sm text-info-fg">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    {t('settings.telegram.unavailable')}
                </p>
            ) : state?.linked ? (
                <SettingsCard>
                    <SettingsRow>
                        <span className="flex min-w-0 items-center gap-2 text-base text-fg">
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-success-fg" strokeWidth={1.8} aria-hidden="true" />
                            <span className="truncate">
                                {t('settings.telegram.connected')}
                                {state.username ? ` · @${state.username}` : ''}
                            </span>
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleDisconnect}
                            disabled={busy}
                            className="-mr-2 text-danger-fg hover:bg-danger-soft"
                        >
                            {t('settings.telegram.disconnect')}
                        </Button>
                    </SettingsRow>
                </SettingsCard>
            ) : (
                <>
                    <SettingsCard>
                        <SettingsRow>
                            <span className="text-base text-fg-muted">
                                {t('settings.telegram.notConnected')}
                            </span>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleConnect}
                                disabled={busy}
                            >
                                {t('settings.telegram.connect')}
                            </Button>
                        </SettingsRow>
                    </SettingsCard>
                    <p className="type-caption text-fg-subtle">{t('settings.telegram.whyLink')}</p>

                    {groupLink && (
                        <a
                            href={groupLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-primary hover:underline"
                        >
                            {t('settings.telegram.groupInvite')}
                            <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                        </a>
                    )}
                </>
            )}
        </SettingsSection>
    )
}
