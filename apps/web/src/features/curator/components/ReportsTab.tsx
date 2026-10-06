'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { curatorApi } from '../api/curatorApi'
import type { WeeklyReportView } from '../types'
import { ReportCard } from './ReportCard'

import { t } from '@/shared/i18n'
interface ReportsTabProps {
    clientId: number
}

export function ReportsTab({ clientId }: ReportsTabProps) {
    const [reports, setReports] = useState<WeeklyReportView[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        let cancelled = false

        curatorApi
            .getWeeklyReports(clientId)
            .then((data) => {
                if (!cancelled) {
                    setReports(data)
                    setError(null)
                    setLoading(false)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setError(t('curator.reports.loadFailed'))
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [clientId, refreshKey])

    const handleFeedbackSaved = useCallback(() => {
        setRefreshKey((k) => k + 1)
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" />
            </div>
        )
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-danger-fg">{error}</p>
    }

    if (reports.length === 0) {
        return (
            <div className="rounded-xl border-2 border-dashed border-line p-6 text-center">
                <p className="text-sm text-fg-muted">{t('curator.reports.empty')}</p>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {reports.map((report) => (
                <ReportCard
                    key={report.id}
                    report={report}
                    clientId={clientId}
                    onFeedbackSaved={handleFeedbackSaved}
                />
            ))}
        </div>
    )
}
