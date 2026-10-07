'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { accountApi, type DataExport, type DeletionStatus } from '../api/account'
import { isApiError, messageForOr } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'
import { AlertTriangle, Download } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { fieldClass, fieldLabelClass } from '@/shared/components/forms/fieldStyles'
import { cn } from '@/shared/utils/cn'

/** Цвет статуса выгрузки — роль состояния, а не оттенок. */
const EXPORT_STATUS_TONE: Record<DataExport['status'], string> = {
    ready: 'text-success-fg',
    pending: 'text-fg-muted',
    building: 'text-fg-muted',
    failed: 'text-danger-fg',
}

// i18n-exempt: the word a person types to confirm; it belongs with the
// sentence that asks for it, which is in the dictionary.
const CONFIRM_PHRASE = 'УДАЛИТЬ'

/**
 * Data export and account deletion.
 *
 * This replaces a "Delete account" button that showed a confirm dialog and then
 * a toast reading "feature in development". The product stores weight, body
 * measurements, progress photographs and conversations with a curator, so both
 * operations are obligations rather than niceties.
 */
export function SettingsPrivacy() {
    const { user } = useCurrentUser()
    // Defaults to true while the profile has not answered yet: the wrong
    // guess in that direction asks for a password that turns out to be
    // unnecessary, while the other wrong guess would hide the field an
    // account with a password actually needs.
    const hasPassword = user?.has_password ?? true

    const [status, setStatus] = useState<DeletionStatus | null>(null)
    const [exports, setExports] = useState<DataExport[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)

    const [showDeleteForm, setShowDeleteForm] = useState(false)
    const [password, setPassword] = useState('')
    const [confirmation, setConfirmation] = useState('')

    // Only ever relevant without a password: the code that stands in for it.
    const [code, setCode] = useState('')
    const [codeSent, setCodeSent] = useState(false)
    const [sendingCode, setSendingCode] = useState(false)

    const refresh = async () => {
        const [deletion, exportList] = await Promise.all([
            accountApi.getDeletionStatus(),
            accountApi.listExports(),
        ])
        setStatus(deletion)
        setExports(exportList.exports)
    }

    useEffect(() => {
        // Declared inside the effect: React can then see that nothing is set
        // synchronously, and a component-scope loader cannot be mistaken for a
        // synchronous one.
        async function loadInitial() {
            try {
                await refresh()
            } catch (err) {
                toast.error(messageForOr(err, t('settings.privacy.stateLoadFailed')))
            } finally {
                setLoading(false)
            }
        }
        loadInitial()
    }, [])

    const handleExport = async () => {
        setBusy(true)
        try {
            await accountApi.requestExport()
            toast.success(t('settings.privacy.exportRequested'))
            await refresh()
        } catch (err) {
            toast.error(messageForOr(err, t('settings.privacy.exportFailed')))
        } finally {
            setBusy(false)
        }
    }

    const handleSendCode = async () => {
        setSendingCode(true)
        try {
            await accountApi.requestDeletionCode()
            setCodeSent(true)
            toast.success(t('settings.privacy.codeSent'))
        } catch (err) {
            toast.error(messageForOr(err, t('settings.privacy.codeSendFailed')))
        } finally {
            setSendingCode(false)
        }
    }

    const handleDelete = async () => {
        setBusy(true)
        try {
            await accountApi.requestDeletion(hasPassword ? password : '', hasPassword ? '' : code)
            setShowDeleteForm(false)
            setPassword('')
            setConfirmation('')
            setCode('')
            setCodeSent(false)
            toast.success(t('settings.privacy.deletionRequested'))
            await refresh()
        } catch (err) {
            toast.error(isApiError(err) && err.status === 401
                ? t(hasPassword ? 'settings.privacy.wrongPassword' : 'settings.privacy.wrongCode')
                : t('settings.privacy.deletionFailed'))
        } finally {
            setBusy(false)
        }
    }

    const handleCancel = async () => {
        setBusy(true)
        try {
            await accountApi.cancelDeletion()
            toast.success(t('settings.privacy.deletionCancelled'))
            await refresh()
        } catch (err) {
            // «Удаление уже состоялось» и «нет связи» — разные новости для
            // того, кто передумал удалять аккаунт.
            toast.error(messageForOr(err, t('settings.privacy.cancelFailed')))
        } finally {
            setBusy(false)
        }
    }

    if (loading) {
        return <p className="py-8 text-center text-sm text-fg-muted">{t('settings.privacy.loading')}</p>
    }

    const deletionDate = status?.scheduled_for
        ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(status.scheduled_for))
        : null

    return (
        <div className="flex flex-col gap-6">
            <section className="rounded-card border border-line bg-surface p-5">
                <h2 className="type-title-3 text-fg">{t('settings.privacy.downloadHeading')}</h2>
                <p className="mt-2 text-sm text-fg-muted">
                    {t('settings.privacy.downloadExplanation')}
                </p>

                <Button
                    type="button"
                    variant="secondary"
                    onClick={handleExport}
                    disabled={busy}
                    className="mt-4"
                >
                    {t('settings.privacy.requestExport')}
                </Button>

                {exports.length > 0 && (
                    <ul className="mt-4 divide-y divide-line border-t border-line">
                        {exports.map((item) => {
                            const fresh = item.status === 'ready' && !item.downloaded
                            return (
                                <li key={item.id} className="flex min-h-14 items-center justify-between gap-3 py-2 text-sm">
                                    <span className="text-fg-muted">
                                        <span className="tabular-nums">
                                            {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
                                                .format(new Date(item.requested_at))}
                                        </span>
                                        {' — '}
                                        <span className={item.status === 'ready' && item.downloaded ? 'text-fg-muted' : EXPORT_STATUS_TONE[item.status]}>
                                            {fresh && t('settings.privacy.exportReady')}
                                            {item.status === 'ready' && item.downloaded && t('settings.privacy.exportDownloaded')}
                                            {item.status === 'pending' && t('settings.privacy.exportPending')}
                                            {item.status === 'building' && t('settings.privacy.exportBuilding')}
                                            {item.status === 'failed' && t('settings.privacy.exportFailedStatus')}
                                        </span>
                                    </span>
                                    {fresh && (
                                        <a
                                            href={accountApi.downloadExportUrl(item.id)}
                                            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 font-semibold text-primary hover:underline"
                                        >
                                            <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                            {t('settings.privacy.download')}
                                        </a>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>

            <section className="rounded-card border border-line bg-surface p-5">
                <h2 className="type-title-3 text-fg">{t('settings.privacy.deleteHeading')}</h2>

                {status?.requested ? (
                    <div className="mt-3 rounded-tile bg-warning-soft p-4" role="status">
                        <p className="flex items-start gap-2 text-sm text-warning-fg">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                            {t('settings.privacy.scheduledFor', { date: deletionDate ?? '' })}
                        </p>
                        <Button
                            type="button"
                            onClick={handleCancel}
                            disabled={busy}
                            className="mt-3"
                        >
                            {t('settings.privacy.cancelDeletion')}
                        </Button>
                    </div>
                ) : (
                    <>
                        <p className="mt-2 text-sm text-fg-muted">
                            {t('settings.privacy.whatGoes')}
                        </p>
                        <p className="mt-2 text-sm text-fg-muted">
                            {t('settings.privacy.gracePeriod')}
                        </p>

                        {!showDeleteForm ? (
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setShowDeleteForm(true)}
                                className="mt-4 border-danger text-danger-fg hover:bg-danger-soft"
                            >
                                {t('settings.privacy.deleteAccount')}
                            </Button>
                        ) : (
                            <div className="mt-4 flex flex-col gap-4 rounded-tile border border-danger p-4">
                                {hasPassword ? (
                                    <label className="block">
                                        <span className={fieldLabelClass}>{t('settings.privacy.currentPassword')}</span>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className={fieldClass}
                                            autoComplete="current-password"
                                        />
                                    </label>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        <p className="text-sm text-fg-muted">
                                            {t('settings.privacy.noPasswordExplanation')}
                                        </p>
                                        {!codeSent ? (
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={handleSendCode}
                                                disabled={sendingCode}
                                                className="self-start"
                                            >
                                                {sendingCode ? t('settings.privacy.sendingCode') : t('settings.privacy.sendCode')}
                                            </Button>
                                        ) : (
                                            <label className="block">
                                                <span className={fieldLabelClass}>{t('settings.privacy.codeLabel')}</span>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    autoComplete="one-time-code"
                                                    maxLength={6}
                                                    value={code}
                                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    className={cn(fieldClass, 'tracking-widest')}
                                                />
                                            </label>
                                        )}
                                    </div>
                                )}
                                <label className="block">
                                    <span className={fieldLabelClass}>
                                        {t('settings.privacy.confirmPhrase', { phrase: CONFIRM_PHRASE })}
                                    </span>
                                    <input
                                        type="text"
                                        value={confirmation}
                                        onChange={(e) => setConfirmation(e.target.value)}
                                        autoCapitalize="characters"
                                        autoComplete="off"
                                        className={fieldClass}
                                    />
                                </label>
                                {/* Отказ первым, как в диалогах подтверждения. */}
                                <div className="flex flex-wrap gap-3">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setShowDeleteForm(false)}
                                    >
                                        {t('settings.privacy.cancel')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        onClick={handleDelete}
                                        disabled={
                                            busy ||
                                            confirmation !== CONFIRM_PHRASE ||
                                            (hasPassword ? !password : code.length !== 6)
                                        }
                                    >
                                        {t('settings.privacy.deleteAccount')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    )
}
