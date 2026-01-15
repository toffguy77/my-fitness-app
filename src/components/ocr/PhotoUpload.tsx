'use client'

import { useState, useRef } from 'react'
import { Camera, X, Upload, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface PhotoUploadProps {
  onPhotoSelected: (file: File) => void
  onCancel?: () => void
  maxSizeMB?: number
  allowedFormats?: string[]
}

const DEFAULT_MAX_SIZE_MB = 10
const DEFAULT_ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp']

export default function PhotoUpload({
  onPhotoSelected,
  onCancel,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  allowedFormats = DEFAULT_ALLOWED_FORMATS,
}: PhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (selectedFile: File) => {
    // Валидация формата
    if (!allowedFormats.includes(selectedFile.type)) {
      toast.error(`Неподдерживаемый формат. Разрешены: ${allowedFormats.join(', ')}`)
      return
    }

    // Валидация размера
    const sizeMB = selectedFile.size / (1024 * 1024)
    if (sizeMB > maxSizeMB) {
      toast.error(`Файл слишком большой. Максимальный размер: ${maxSizeMB}MB`)
      return
    }

    setFile(selectedFile)

    // Создаем preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(selectedFile)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }

  const handleCameraClick = () => {
    cameraInputRef.current?.click()
  }

  const handleGalleryClick = () => {
    fileInputRef.current?.click()
  }

  const handleConfirm = () => {
    if (file) {
      setIsProcessing(true)
      onPhotoSelected(file)
    }
  }

  const handleCancel = () => {
    setFile(null)
    setPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = ''
    }
    onCancel?.()
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {!preview ? (
        <div className="border-2 border-dashed border-zinc-800 rounded-lg p-8 text-center">
          <Camera className="mx-auto h-12 w-12 text-zinc-500 mb-4" />
          <p className="text-zinc-400 mb-4">Выберите фото этикетки</p>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={handleCameraClick}
              className="px-4 py-2 bg-white text-zinc-950 rounded hover:bg-zinc-200 transition-colors flex items-center gap-2"
            >
              <Camera size={18} />
              Камера
            </button>
            <button
              type="button"
              onClick={handleGalleryClick}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <Upload size={18} />
              Галерея
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-4">
            Максимальный размер: {maxSizeMB}MB
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <img
              src={preview}
              alt="Preview"
              className="w-full rounded-lg border border-zinc-800"
            />
            <button
              type="button"
              onClick={handleCancel}
              className="absolute top-2 right-2 bg-red-400 text-white rounded-full p-2 hover:bg-red-500 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="flex-1 px-4 py-2 bg-white text-zinc-950 rounded hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Обработка...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Использовать фото
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isProcessing}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Скрытые input элементы */}
      <input
        ref={fileInputRef}
        type="file"
        accept={allowedFormats.join(',')}
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept={allowedFormats.join(',')}
        capture="environment"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  )
}
