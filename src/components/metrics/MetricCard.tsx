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
    default: 'bg-white border-gray-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    danger: 'bg-red-50 border-red-200',
  }

  const valueStyles = {
    default: 'text-gray-900',
    success: 'text-green-700',
    warning: 'text-yellow-700',
    danger: 'text-red-700',
  }

  return (
    <div className={`rounded-xl border p-6 ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {Icon && <Icon size={20} className="text-gray-500" />}
            <h3 className="text-sm font-medium text-gray-600">{title}</h3>
          </div>
          <div className={`text-3xl font-bold ${valueStyles[variant]} mb-1`}>
            {typeof value === 'number' ? value.toLocaleString('ru-RU') : value}
          </div>
          {subtitle && (
            <p className="text-xs text-gray-500">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              {trend.value > 0 ? (
                <TrendingUp size={14} className="text-green-600" />
              ) : (
                <TrendingDown size={14} className="text-red-600" />
              )}
              <span className={`text-xs font-medium ${
                trend.value > 0 ? 'text-green-600' : 'text-red-600'
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

