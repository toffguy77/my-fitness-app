'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { accountApi, type DataExport, type DeletionStatus } from '../api/account'
import { isApiError, messageForOr } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'

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
        <div className="space-y-10">
            <section>
                <h2 className="text-lg font-semibold text-fg">{t('settings.privacy.downloadHeading')}</h2>
                <p className="mt-2 text-sm text-fg-muted">
                    {t('settings.privacy.downloadExplanation')}
                </p>

                <button
                    type="button"
                    onClick={handleExport}
                    disabled={busy}
                    className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                    {t('settings.privacy.requestExport')}
                </button>

                {exports.length > 0 && (
                    <ul className="mt-4 space-y-2">
                        {exports.map((item) => (
                            <li key={item.id} className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm">
                                <span className="text-fg-muted">
                                    {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
                                        .format(new Date(item.requested_at))}
                                    {' — '}
                                    {item.status === 'ready' && !item.downloaded && t('settings.privacy.exportReady')}
                                    {item.status === 'ready' && item.downloaded && t('settings.privacy.exportDownloaded')}
                                    {item.status === 'pending' && t('settings.privacy.exportPending')}
                                    {item.status === 'building' && t('settings.privacy.exportBuilding')}
                                    {item.status === 'failed' && t('settings.privacy.exportFailedStatus')}
                                </span>
                                {item.status === 'ready' && !item.downloaded && (
                                    <a
                                        href={accountApi.downloadExportUrl(item.id)}
                                        className="text-primary hover:underline"
                                    >
                                        {t('settings.privacy.download')}
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section>
                <h2 className="text-lg font-semibold text-fg">{t('settings.privacy.deleteHeading')}</h2>

                {status?.requested ? (
                    <div className="mt-2 rounded-md border border-warning/30 bg-warning-soft p-4">
                        <p className="text-sm text-warning-fg">
                            {t('settings.privacy.scheduledFor', { date: deletionDate ?? '' })}
                        </p>
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={busy}
                            className="mt-3 rounded-md bg-warning px-4 py-2 text-sm text-on-primary hover:bg-warning disabled:opacity-50"
                        >
                            {t('settings.privacy.cancelDeletion')}
                        </button>
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
                            <button
                                type="button"
                                onClick={() => setShowDeleteForm(true)}
                                className="mt-4 rounded-md border border-danger/30 px-4 py-2 text-sm text-danger-fg hover:bg-danger-soft"
                            >
                                {t('settings.privacy.deleteAccount')}
                            </button>
                        ) : (
                            <div className="mt-4 space-y-3 rounded-md border border-danger/30 p-4">
                                {hasPassword ? (
                                    <label className="block text-sm">
                                        {t('settings.privacy.currentPassword')}
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="mt-1 w-full rounded border border-line px-3 py-2"
                                            autoComplete="current-password"
                                        />
                                    </label>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-sm text-fg-muted">
                                            {t('settings.privacy.noPasswordExplanation')}
                                        </p>
                                        {!codeSent ? (
                                            <button
                                                type="button"
                                                onClick={handleSendCode}
                                                disabled={sendingCode}
                                                className="rounded-md border border-line px-4 py-2 text-sm text-fg hover:bg-canvas disabled:opacity-50"
                                            >
                                                {sendingCode ? t('settings.privacy.sendingCode') : t('settings.privacy.sendCode')}
                                            </button>
                                        ) : (
                                            <label className="block text-sm">
                                                {t('settings.privacy.codeLabel')}
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={6}
                                                    value={code}
                                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    className="mt-1 w-full rounded border border-line px-3 py-2"
                                                />
                                            </label>
                                        )}
                                    </div>
                                )}
                                <label className="block text-sm">
                                    {t('settings.privacy.confirmPhrase', { phrase: CONFIRM_PHRASE })}
                                    <input
                                        type="text"
                                        value={confirmation}
                                        onChange={(e) => setConfirmation(e.target.value)}
                                        className="mt-1 w-full rounded border border-line px-3 py-2"
                                    />
                                </label>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        disabled={
                                            busy ||
                                            confirmation !== CONFIRM_PHRASE ||
                                            (hasPassword ? !password : code.length !== 6)
                                        }
                                        className="rounded-md bg-danger px-4 py-2 text-sm text-on-primary hover:bg-danger disabled:opacity-50"
                                    >
                                        {t('settings.privacy.deleteAccount')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowDeleteForm(false)}
                                        className="text-sm text-fg-muted hover:underline"
                                    >
                                        {t('settings.privacy.cancel')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    )
}
