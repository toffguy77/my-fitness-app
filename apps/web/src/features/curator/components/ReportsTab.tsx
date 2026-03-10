'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { curatorApi } from '../api/curatorApi'
import type { WeeklyReportView } from '../types'
import { ReportCard } from './ReportCard'

interface ReportsTabProps {
    clientId: number
}

export function ReportsTab({ clientId }: ReportsTabProps) {
    const [reports, setReports] = useState<WeeklyReportView[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchReports = useCallback(() => {
        setLoading(true)
        curatorApi
            .getWeeklyReports(clientId)
            .then((data) => {
                setReports(data)
                setError(null)
            })
            .catch(() => setError('Не удалось загрузить отчёты'))
            .finally(() => setLoading(false))
    }, [clientId])

    useEffect(() => {
        fetchReports()
    }, [fetchReports])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-red-500">{error}</p>
    }

    if (reports.length === 0) {
        return (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
                <p className="text-sm text-gray-500">Отчётов пока нет</p>
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
                    onFeedbackSaved={fetchReports}
                />
            ))}
        </div>
    )
}
