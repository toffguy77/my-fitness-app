'use client'

import { BarChart3, TrendingUp, Calendar } from 'lucide-react'

interface PreviewItem {
  title: string
  description: string
  icon: React.ReactNode
  preview: string
}

const previews: PreviewItem[] = [
  {
    title: 'Детальная аналитика',
    description: 'Графики прогресса по калориям, белкам, жирам и углеводам',
    icon: <BarChart3 size={20} />,
    preview: '📊 Графики за неделю, месяц, год с трендами и сравнениями',
  },
  {
    title: 'Еженедельные отчеты',
    description: 'Автоматические отчеты с анализом вашего прогресса',
    icon: <TrendingUp size={20} />,
    preview: '📈 Сводка за неделю, достижения, рекомендации от тренера',
  },
  {
    title: 'Планирование питания',
    description: 'Составление плана питания на неделю вперед',
    icon: <Calendar size={20} />,
    preview: '📅 План приемов пищи, распределение КБЖУ по дням',
  },
]

export default function PremiumPreview() {
  return (
    <div className="space-y-4">
      {previews.map((preview, index) => (
        <div
          key={index}
          className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200"
        >
          <div className="flex items-start gap-3 mb-2">
            <div className="flex-shrink-0 w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
              {preview.icon}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-1">{preview.title}</h4>
              <p className="text-sm text-gray-600 mb-2">{preview.description}</p>
              <div className="text-xs text-gray-500 bg-white rounded-lg p-2 border border-gray-200">
                {preview.preview}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

