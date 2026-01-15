'use client'

import { useEffect, useState } from 'react'
import { Activity, Users, Target, AlertTriangle, Clock, TrendingUp } from 'lucide-react'
import MetricCard from './MetricCard'
import MetricsChart from './MetricsChart'
import SkeletonLoader from '@/components/SkeletonLoader'
import { logger } from '@/utils/logger'

interface MetricsData {
  ttfv: {
    average: number
    median: number
    p95: number
    total: number
  }
  dau: {
    today: number
    yesterday: number
    weekAverage: number
    trend: string
  }
  onboarding: {
    completionRate: number
    averageDuration: number
    started: number
    completed: number
  }
  featureAdoption: {
    mealSaving: number
    ocrScan: number
    reports: number
    chat: number
  }
  errorRate: {
    total: number
    rate: number
    critical: number
    warnings: number
  }
  sessionDuration: {
    average: number
    median: number
    p95: number
  }
}

export default function MetricsDashboard() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    fetchMetrics()
  }, [dateRange])

  const fetchMetrics = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      })

      const response = await fetch(`/api/analytics/metrics?${params}`)

      if (!response.ok) {
        throw new Error('Failed to fetch metrics')
      }

      const data = await response.json()
      if (data.success && data.metrics) {
        setMetrics(data.metrics)
      } else {
        throw new Error('Invalid response format')
      }
    } catch (err) {
      logger.error('MetricsDashboard: ошибка загрузки метрик', err)
      setError('Ошибка загрузки метрик')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonLoader variant="card" count={3} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-rose-950/20 border border-rose-800/50 rounded-xl p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-rose-400" size={32} />
        <p className="text-rose-300 font-medium">{error}</p>
      </div>
    )
  }

  if (!metrics) {
    return null
  }

  // Генерируем данные для графиков (заглушка)
  const dauChartData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return {
      date: date.toISOString().split('T')[0],
      value: metrics.dau.today - Math.floor(Math.random() * 10),
    }
  })

  const ttfvChartData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return {
      date: date.toISOString().split('T')[0],
      value: metrics.ttfv.average + Math.floor(Math.random() * 20) - 10,
    }
  })

  return (
    <div className="space-y-6">
      {/* Фильтры */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-zinc-300">
            Период:
          </label>
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            className="px-3 py-2 border border-zinc-800 rounded-lg text-sm bg-zinc-900 text-zinc-100"
          />
          <span className="text-zinc-500">—</span>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            className="px-3 py-2 border border-zinc-800 rounded-lg text-sm bg-zinc-900 text-zinc-100"
          />
        </div>
      </div>

      {/* Ключевые метрики */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Time to First Value"
          value={`${metrics.ttfv.average}с`}
          subtitle={`Медиана: ${metrics.ttfv.median}с, P95: ${metrics.ttfv.p95}с`}
          icon={Clock}
          variant="default"
        />
        <MetricCard
          title="Daily Active Users"
          value={metrics.dau.today}
          subtitle={`Вчера: ${metrics.dau.yesterday}, Среднее за неделю: ${metrics.dau.weekAverage}`}
          trend={{
            value: parseFloat(metrics.dau.trend.replace('%', '').replace('+', '')),
            label: 'vs вчера',
          }}
          icon={Users}
          variant="success"
        />
        <MetricCard
          title="Onboarding Completion"
          value={`${(metrics.onboarding.completionRate * 100).toFixed(1)}%`}
          subtitle={`${metrics.onboarding.completed} из ${metrics.onboarding.started} завершили`}
          icon={Target}
          variant="success"
        />
        <MetricCard
          title="Error Rate"
          value={`${(metrics.errorRate.rate * 100).toFixed(2)}%`}
          subtitle={`Всего: ${metrics.errorRate.total}, Критичных: ${metrics.errorRate.critical}`}
          icon={AlertTriangle}
          variant={metrics.errorRate.rate > 0.05 ? 'danger' : 'warning'}
        />
        <MetricCard
          title="Session Duration"
          value={`${Math.round(metrics.sessionDuration.average / 60)}м`}
          subtitle={`Медиана: ${Math.round(metrics.sessionDuration.median / 60)}м`}
          icon={Activity}
          variant="default"
        />
        <MetricCard
          title="Feature Adoption"
          value={`${(metrics.featureAdoption.mealSaving * 100).toFixed(0)}%`}
          subtitle="Сохранение приемов пищи"
          icon={TrendingUp}
          variant="success"
        />
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MetricsChart
          data={dauChartData}
          type="line"
          title="Daily Active Users (7 дней)"
          color="#10b981"
        />
        <MetricsChart
          data={ttfvChartData}
          type="line"
          title="Time to First Value (7 дней)"
          color="#2563eb"
        />
      </div>

      {/* Feature Adoption детали */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-lg font-semibold text-zinc-100 mb-4">Feature Adoption</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-zinc-400 mb-1">Сохранение приемов пищи</p>
            <p className="text-2xl font-bold text-emerald-300 tabular-nums">
              {(metrics.featureAdoption.mealSaving * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-400 mb-1">OCR сканирование</p>
            <p className="text-2xl font-bold text-emerald-300 tabular-nums">
              {(metrics.featureAdoption.ocrScan * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-400 mb-1">Отчеты</p>
            <p className="text-2xl font-bold text-emerald-300 tabular-nums">
              {(metrics.featureAdoption.reports * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-400 mb-1">Чат с куратором</p>
            <p className="text-2xl font-bold text-emerald-300 tabular-nums">
              {(metrics.featureAdoption.chat * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

