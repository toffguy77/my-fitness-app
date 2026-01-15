'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import PhotoUpload from './PhotoUpload'
import OCRProcessor from './OCRProcessor'
import OCRResultComponent from './OCRResult'
import type { OCRResult, ExtractedNutritionData, OCRModelTier } from '@/types/ocr'
import { logger } from '@/utils/logger'
import { checkAchievementsAfterOCR } from '@/utils/achievements/check'

interface OCRModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: ExtractedNutritionData) => void
  preferredTier?: OCRModelTier
  openRouterApiKey?: string
}

type OCRStep = 'upload' | 'processing' | 'result'

export default function OCRModal({
  isOpen,
  onClose,
  onConfirm,
  preferredTier = 'balanced',
  openRouterApiKey,
}: OCRModalProps) {
  const [step, setStep] = useState<OCRStep>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)

  if (!isOpen) return null

  const handlePhotoSelected = (file: File) => {
    setImageFile(file)
    setStep('processing')
  }

  const handleOCRResult = (result: OCRResult) => {
    setOcrResult(result)
    setStep('result')
  }

  const handleOCRError = (error: Error) => {
    logger.error('OCRModal: ошибка обработки', error)
    // Возвращаемся к загрузке фото
    setStep('upload')
    setImageFile(null)
  }

  const handleConfirm = async (data: ExtractedNutritionData) => {
    // Сохраняем результат OCR в БД (опционально, не блокируем UI)
    if (ocrResult && imageFile) {
      try {
        // Конвертируем File в base64 для отправки на сервер
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = reader.result as string

          try {
            await fetch('/api/ocr/save', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                imageBase64: base64,
                ocrResult: {
                  provider: ocrResult.provider || 'tesseract',
                  modelName: ocrResult.modelName,
                  confidence: ocrResult.confidence,
                  extractedData: data,
                  processingTimeMs: ocrResult.processingTimeMs,
                },
                success: true,
              }),
            })
          } catch (error) {
            // Игнорируем ошибки сохранения (не критично для UX)
            logger.warn('OCRModal: ошибка сохранения результата OCR', { error: error instanceof Error ? error.message : String(error) })
          }
        }
        reader.readAsDataURL(imageFile)
      } catch (error) {
        logger.warn('OCRModal: ошибка конвертации изображения', { error: error instanceof Error ? error.message : String(error) })
      }
    }

    // Проверяем достижения после использования OCR
    checkAchievementsAfterOCR().catch((error) => {
      logger.warn('OCRModal: ошибка проверки достижений после OCR', { error: error instanceof Error ? error.message : String(error) })
    })

    onConfirm(data)
    handleClose()
  }

  const handleEdit = (data: ExtractedNutritionData) => {
    if (ocrResult) {
      setOcrResult({
        ...ocrResult,
        extractedData: data,
      })
    }
  }

  const handleCancel = () => {
    if (step === 'result') {
      setStep('upload')
      setImageFile(null)
      setOcrResult(null)
    } else {
      handleClose()
    }
  }

  const handleClose = () => {
    setStep('upload')
    setImageFile(null)
    setOcrResult(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Сканирование этикетки</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {step === 'upload' && (
            <PhotoUpload
              onPhotoSelected={handlePhotoSelected}
              onCancel={handleCancel}
            />
          )}

          {step === 'processing' && imageFile && (
            <OCRProcessor
              imageFile={imageFile}
              onResult={handleOCRResult}
              onError={handleOCRError}
              preferredTier={preferredTier}
              openRouterApiKey={openRouterApiKey}
            />
          )}

          {step === 'result' && ocrResult && (
            <OCRResultComponent
              result={ocrResult}
              onConfirm={handleConfirm}
              onEdit={handleEdit}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>
    </div>
  )
}
