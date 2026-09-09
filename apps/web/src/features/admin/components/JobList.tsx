'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { adminApi, type Job } from '../api/adminApi'
import { isApiError, messageFor } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'

/**
 * Periodic jobs: what exists, when it last ran, and how it went.
 *
 * The endpoints have been there without a caller. Until now the answer to "did
 * that job run, and did it succeed?" was in container logs — which is how a
 * snapshot collector that was never called went unnoticed indefinitely. It is
 * also the only way to start a job that runs on request rather than on a
 * schedule, such as the clean-up after an erasure that deleted nothing.
 */
export function JobList() {
    const [jobs, setJobs] = useState<Job[]>([])
    const [loading, setLoading] = useState(true)
    const [running, setRunning] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        const { jobs } = await adminApi.getJobs()
        setJobs(jobs)
    }, [])

    useEffect(() => {
        async function load() {
            try {
                await refresh()
            } catch (err) {
                toast.error(isApiError(err) ? messageFor(err) : t('admin.jobs.loadFailed'))
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [refresh])

    async function handleRun(name: string) {
        setRunning(name)
        try {
            await adminApi.runJob(name)
            toast.success(t('admin.jobs.started', { name }))
            // The run is detached from the request, so the result is not back
            // yet. Give it a moment, then show whatever the history says.
            setTimeout(() => { refresh().catch(() => {}) }, 3000)
        } catch (err) {
            toast.error(isApiError(err) ? messageFor(err) : t('admin.jobs.runFailed'))
        } finally {
            setRunning(null)
        }
    }

    if (loading) {
        return <p className="py-8 text-center text-sm text-gray-500">{t('admin.jobs.loading')}</p>
    }

    return (
        <ul className="space-y-2">
            {jobs.map((job) => (
                <li key={job.name} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate font-mono text-sm text-gray-900">{job.name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{job.schedule}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleRun(job.name)}
                            disabled={running === job.name}
                            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            {t('admin.jobs.run')}
                        </button>
                    </div>

                    <p className="mt-3 text-sm">
                        {job.last_run ? <LastRun run={job.last_run} /> : (
                            <span className="text-gray-400">{t('admin.jobs.neverRan')}</span>
                        )}
                    </p>
                </li>
            ))}
        </ul>
    )
}

function LastRun({ run }: { run: NonNullable<Job['last_run']> }) {
    const when = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
        .format(new Date(run.started_at))

    // A failure has to read as a failure. A job whose error sits in a tooltip
    // is a job nobody knows is broken.
    if (run.status === 'failed') {
        return (
            <>
                <span className="font-medium text-red-600">{t('admin.jobs.failed')}</span>
                <span className="text-gray-500">{' — '}{when}</span>
                {run.error && <span className="mt-1 block text-xs text-red-600">{run.error}</span>}
            </>
        )
    }

    if (run.status === 'running') {
        return <span className="text-blue-600">{t('admin.jobs.inProgress', { when })}</span>
    }

    return (
        <span className="text-gray-600">
            {t('admin.jobs.succeeded', { when, items: String(run.items_processed) })}
        </span>
    )
}
