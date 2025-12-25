'use client'

import { TrendingUp, BarChart3, Users, MessageSquare, Calendar, Target } from 'lucide-react'

interface PremiumBenefit {
  icon: React.ReactNode
  title: string
  description: string
}

const benefits: PremiumBenefit[] = [
  {
    icon: <BarChart3 size={24} />,
    title: 'Расширенная аналитика',
    description: 'Детальные графики прогресса, тренды и статистика за любой период',
  },
  {
    icon: <TrendingUp size={24} />,
    title: 'Персональные отчеты',
    description: 'Еженедельные и месячные отчеты с рекомендациями от координатора',
  },
  {
    icon: <Users size={24} />,
    title: 'Работа с координатором',
    description: 'Персональные консультации и корректировка плана питания',
  },
  {
    icon: <MessageSquare size={24} />,
    title: 'Приоритетная поддержка',
    description: 'Быстрые ответы на вопросы и помощь в решении проблем',
  },
  {
    icon: <Calendar size={24} />,
    title: 'Планирование питания',
    description: 'Составление плана питания на неделю вперед',
  },
  {
    icon: <Target size={24} />,
    title: 'Персональные цели',
    description: 'Индивидуальные цели и задачи от координатора',
  },
]

export default function PremiumBenefits() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {benefits.map((benefit, index) => (
        <div
          key={index}
          className="flex items-start gap-3 p-4 bg-zinc-800 rounded-xl border border-zinc-700 hover:border-zinc-600 transition-colors"
        >
          <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center text-zinc-950">
            {benefit.icon}
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-zinc-100 mb-1">{benefit.title}</h4>
            <p className="text-sm text-zinc-400">{benefit.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

