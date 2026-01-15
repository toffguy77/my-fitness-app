'use client'

import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    label: string
  }
  icon?: LucideIcon
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

export default function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  variant = 'default',
}: MetricCardProps) {
  const variantStyles = {
    default: 'bg-zinc-900 border-zinc-800',
    success: 'bg-zinc-900 border-zinc-800',
    warning: 'bg-zinc-900 border-zinc-800',
    danger: 'bg-zinc-900 border-zinc-800',
  }

  const valueStyles = {
    default: 'text-zinc-100',
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    danger: 'text-rose-300',
  }

  return (
    <div className={`rounded-xl border p-6 ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {Icon && <Icon size={20} className="text-zinc-500" />}
            <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
          </div>
          <div className={`text-3xl font-bold ${valueStyles[variant]} mb-1 tabular-nums`}>
            {typeof value === 'number' ? value.toLocaleString('ru-RU') : value}
          </div>
          {subtitle && (
            <p className="text-xs text-zinc-500">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              {trend.value > 0 ? (
                <TrendingUp size={14} className="text-emerald-400" />
              ) : (
                <TrendingDown size={14} className="text-rose-400" />
              )}
              <span className={`text-xs font-medium tabular-nums ${
                trend.value > 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {Math.abs(trend.value)}% {trend.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
