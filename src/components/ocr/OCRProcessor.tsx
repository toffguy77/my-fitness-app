'use client'

import { useState, useEffect } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import type { OCRResult, OCRModelTier } from '@/types/ocr'
import { recognizeTextHybrid } from '@/utils/ocr/hybrid'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'

interface OCRProcessorProps {
  imageFile: File
  onResult: (result: OCRResult) => void
  onError: (error: Error) => void
  preferredTier?: OCRModelTier
  openRouterApiKey?: string
}

export default function OCRProcessor({
  imageFile,
  onResult,
  onError,
  preferredTier = 'balanced',
  openRouterApiKey,
}: OCRProcessorProps) {
  const [processing, setProcessing] = useState(true)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<string>('Инициализация...')

  useEffect(() => {
    let cancelled = false
    let progressInterval: NodeJS.Timeout | null = null

    const processImage = async () => {
      try {
        setStatus('Обработка изображения...')
        setProgress(20)

        // Симуляция прогресса для UX
        progressInterval = setInterval(() => {
          setProgress((prev) => {
            if (prev >= 90) return prev
            return prev + 5
          })
        }, 500)

        const result = await recognizeTextHybrid(
          imageFile,
          preferredTier,
          openRouterApiKey
        )

        if (progressInterval) {
          clearInterval(progressInterval)
          progressInterval = null
        }

        if (cancelled) return

        setProgress(100)
        setStatus('Готово!')
        setProcessing(false)

        // Небольшая задержка для показа 100%
        setTimeout(() => {
          if (!cancelled) {
            onResult(result)
          }
        }, 300)
      } catch (error) {
        if (progressInterval) {
          clearInterval(progressInterval)
          progressInterval = null
        }

        if (cancelled) return

        logger.error('OCRProcessor: ошибка обработки', error)
        setProcessing(false)
        onError(error instanceof Error ? error : new Error('Ошибка обработки изображения'))
      }
    }

    processImage()

    return () => {
      cancelled = true
      if (progressInterval) {
        clearInterval(progressInterval)
      }
    }
  }, [imageFile, preferredTier, openRouterApiKey, onResult, onError])

  return (
    <div className="w-full max-w-md mx-auto p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-white" size={24} />
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-100">{status}</p>
            <div className="mt-2 bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-white h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-1 tabular-nums">{progress}%</p>
          </div>
        </div>
        <div className="text-xs text-zinc-500">
          {preferredTier === 'fast' && 'Используется быстрая обработка'}
          {preferredTier === 'balanced' && 'Используется сбалансированная обработка'}
          {preferredTier === 'advanced' && 'Используется продвинутая обработка'}
        </div>
      </div>
    </div>
  )
}
