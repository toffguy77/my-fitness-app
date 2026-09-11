'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { accountApi, type DataExport, type DeletionStatus } from '../api/account'
import { isApiError, messageFor } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'

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
    const [status, setStatus] = useState<DeletionStatus | null>(null)
    const [exports, setExports] = useState<DataExport[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)

    const [showDeleteForm, setShowDeleteForm] = useState(false)
    const [password, setPassword] = useState('')
    const [confirmation, setConfirmation] = useState('')

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
            } catch {
                toast.error(t('settings.privacy.stateLoadFailed'))
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
            toast.error(isApiError(err) ? messageFor(err) : t('settings.privacy.exportFailed'))
        } finally {
            setBusy(false)
        }
    }

    const handleDelete = async () => {
        setBusy(true)
        try {
            await accountApi.requestDeletion(password)
            setShowDeleteForm(false)
            setPassword('')
            setConfirmation('')
            toast.success(t('settings.privacy.deletionRequested'))
            await refresh()
        } catch (err) {
            toast.error(isApiError(err) && err.status === 401
                ? t('settings.privacy.wrongPassword')
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
        } catch {
            toast.error(t('settings.privacy.cancelFailed'))
        } finally {
            setBusy(false)
        }
    }

    if (loading) {
        return <p className="py-8 text-center text-sm text-gray-500">{t('settings.privacy.loading')}</p>
    }

    const deletionDate = status?.scheduled_for
        ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(status.scheduled_for))
        : null

    return (
        <div className="space-y-10">
            <section>
                <h2 className="text-lg font-semibold text-gray-900">{t('settings.privacy.downloadHeading')}</h2>
                <p className="mt-2 text-sm text-gray-600">
                    {t('settings.privacy.downloadExplanation')}
                </p>

                <button
                    type="button"
                    onClick={handleExport}
                    disabled={busy}
                    className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {t('settings.privacy.requestExport')}
                </button>

                {exports.length > 0 && (
                    <ul className="mt-4 space-y-2">
                        {exports.map((item) => (
                            <li key={item.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm">
                                <span className="text-gray-600">
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
                                        className="text-blue-600 hover:underline"
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
                <h2 className="text-lg font-semibold text-gray-900">{t('settings.privacy.deleteHeading')}</h2>

                {status?.requested ? (
                    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-4">
                        <p className="text-sm text-amber-900">
                            {t('settings.privacy.scheduledFor', { date: deletionDate ?? '' })}
                        </p>
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={busy}
                            className="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                            {t('settings.privacy.cancelDeletion')}
                        </button>
                    </div>
                ) : (
                    <>
                        <p className="mt-2 text-sm text-gray-600">
                            {t('settings.privacy.whatGoes')}
                        </p>
                        <p className="mt-2 text-sm text-gray-600">
                            {t('settings.privacy.gracePeriod')}
                        </p>

                        {!showDeleteForm ? (
                            <button
                                type="button"
                                onClick={() => setShowDeleteForm(true)}
                                className="mt-4 rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                                {t('settings.privacy.deleteAccount')}
                            </button>
                        ) : (
                            <div className="mt-4 space-y-3 rounded-md border border-red-300 p-4">
                                <label className="block text-sm">
                                    {t('settings.privacy.currentPassword')}
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                                        autoComplete="current-password"
                                    />
                                </label>
                                <label className="block text-sm">
                                    {t('settings.privacy.confirmPhrase', { phrase: CONFIRM_PHRASE })}
                                    <input
                                        type="text"
                                        value={confirmation}
                                        onChange={(e) => setConfirmation(e.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                                    />
                                </label>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        disabled={busy || !password || confirmation !== CONFIRM_PHRASE}
                                        className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {t('settings.privacy.deleteAccount')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowDeleteForm(false)}
                                        className="text-sm text-gray-600 hover:underline"
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
