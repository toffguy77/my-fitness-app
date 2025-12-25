'use client'

import { useState, useEffect } from 'react'
import { X, ArrowRight, Home, UtensilsCrossed, TrendingUp, Trophy } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface TourStep {
  id: string
  title: string
  description: string
  target: string // CSS selector или 'center'
  icon?: React.ReactNode
}

const tourSteps: TourStep[] = [
  {
    id: 'dashboard',
    title: 'Добро пожаловать!',
    description: 'Это ваш дашборд - здесь вы видите сводку за неделю, прогресс по питанию и вес.',
    target: 'center',
    icon: <Home size={24} />,
  },
  {
    id: 'nutrition',
    title: 'Ввод питания',
    description: 'Нажмите на "Питание" в навигации, чтобы добавить приемы пищи и отслеживать КБЖУ.',
    target: 'nav-item-nutrition',
    icon: <UtensilsCrossed size={24} />,
  },
  {
    id: 'reports',
    title: 'Отчеты и аналитика',
    description: 'В разделе "Отчеты" вы найдете графики, статистику и детальную аналитику вашего прогресса (доступно с Premium).',
    target: 'nav-item-reports',
    icon: <TrendingUp size={24} />,
  },
  {
    id: 'achievements',
    title: 'Достижения',
    description: 'Зарабатывайте достижения за регулярное использование приложения и достижение целей!',
    target: 'nav-item-achievements',
    icon: <Trophy size={24} />,
  },
]

interface WelcomeTourProps {
  onComplete: () => void
}

export default function WelcomeTour({ onComplete }: WelcomeTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Показываем тур с небольшой задержкой для плавности
    const timer = setTimeout(() => setIsVisible(true), 300)
    return () => clearTimeout(timer)
  }, [])

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handleSkip = () => {
    handleComplete()
  }

  const handleComplete = () => {
    setIsVisible(false)
    setTimeout(() => {
      onComplete()
    }, 300)
  }

  const currentStepData = tourSteps[currentStep]
  const progress = ((currentStep + 1) / tourSteps.length) * 100

  if (!isVisible) return null

  // Если target - 'center', показываем модальное окно по центру
  if (currentStepData.target === 'center') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleSkip} />
        <div className="relative bg-zinc-900 rounded-2xl shadow-xl max-w-md w-full p-6 animate-slide-in-right border border-zinc-800">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {currentStepData.icon && (
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-zinc-950">
                  {currentStepData.icon}
                </div>
              )}
              <div>
                <h3 className="text-xl font-bold text-zinc-100">{currentStepData.title}</h3>
                <p className="text-sm text-zinc-500 mt-1 tabular-nums">
                  Шаг {currentStep + 1} из {tourSteps.length}
                </p>
              </div>
            </div>
            <button
              onClick={handleSkip}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Пропустить"
            >
              <X size={20} />
            </button>
          </div>

          <p className="text-zinc-300 mb-6">{currentStepData.description}</p>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="w-full bg-zinc-800 rounded-full h-2">
              <div
                className="bg-white h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Пропустить
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2 bg-white text-zinc-950 rounded-lg font-medium hover:bg-zinc-200 transition-colors"
            >
              {currentStep === tourSteps.length - 1 ? 'Начать' : 'Далее'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Для других шагов - highlight элемент и показываем tooltip рядом
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={handleSkip} />
      <div className="fixed z-50">
        {/* Highlight overlay будет добавлен через portal к целевому элементу */}
        <div className="relative bg-zinc-900 rounded-xl shadow-xl p-4 max-w-xs animate-slide-in-right border border-zinc-800">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {currentStepData.icon && (
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-zinc-950 flex-shrink-0">
                  {currentStepData.icon}
                </div>
              )}
              <h3 className="text-lg font-bold text-zinc-100">{currentStepData.title}</h3>
            </div>
            <button
              onClick={handleSkip}
              className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
              aria-label="Пропустить"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-sm text-zinc-300 mb-4">{currentStepData.description}</p>
          
          {/* Progress */}
          <div className="mb-3">
            <div className="w-full bg-zinc-800 rounded-full h-1.5">
              <div
                className="bg-white h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-1 text-center tabular-nums">
              {currentStep + 1} / {tourSteps.length}
            </p>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Пропустить
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-4 py-1.5 bg-white text-zinc-950 rounded-lg text-xs font-medium hover:bg-zinc-200 transition-colors"
            >
              {currentStep === tourSteps.length - 1 ? 'Начать' : 'Далее'}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

