import { t } from '@/shared/i18n'

/**
 * Where a navigation lands when there is no network.
 *
 * Static on purpose: it is precached and must render without the API, without
 * the session and without anything the network could withhold. The alternative
 * is the browser's own error page, which says nothing about this application
 * and offers nothing to do.
 */
export default function OfflinePage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
            <h1 className="text-lg font-semibold text-gray-900">{t('offline.heading')}</h1>
            <p className="mt-2 max-w-sm text-sm text-gray-600">{t('offline.explanation')}</p>
            <p className="mt-6 max-w-sm text-sm text-gray-500">{t('offline.queued')}</p>
        </main>
    )
}
