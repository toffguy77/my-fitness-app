'use client'

import { useState } from 'react'
import { Download, FileText, FileJson, File, Loader2 } from 'lucide-react'
import { exportToCSV, exportToJSON, exportToPDF, type DailyLog } from '@/utils/export'
import toast from 'react-hot-toast'
import type { NutritionTarget } from '@/utils/export'

type ExportButtonProps = {
  data: DailyLog[]
  targets?: NutritionTarget[]
  filename?: string
}

export default function ExportButton({ data, targets, filename }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const handleExport = async (format: 'csv' | 'json' | 'pdf') => {
    if (!data || data.length === 0) {
      toast.error('Нет данных для экспорта')
      return
    }

    setIsExporting(true)
    setShowMenu(false)

    try {
      switch (format) {
        case 'csv':
          exportToCSV(data, filename)
          toast.success('Данные экспортированы в CSV')
          break
        case 'json':
          exportToJSON(data, filename)
          toast.success('Данные экспортированы в JSON')
          break
        case 'pdf':
          await exportToPDF(data, targets, filename)
          toast.success('Данные экспортированы в PDF')
          break
      }
    } catch (error) {
      toast.error(`Ошибка экспорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isExporting || !data || data.length === 0}
        className="flex items-center gap-2 px-4 py-2 bg-white text-zinc-950 rounded-lg font-medium text-sm hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isExporting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Экспорт...
          </>
        ) : (
          <>
            <Download size={16} />
            Экспорт
          </>
        )}
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-zinc-900 rounded-xl shadow-lg border border-zinc-800 z-20">
            <div className="py-1">
              <button
                onClick={() => handleExport('csv')}
                className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2 transition-colors"
              >
                <FileText size={16} />
                CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2 transition-colors"
              >
                <FileJson size={16} />
                JSON
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2 transition-colors"
              >
                <File size={16} />
                PDF
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

