import Papa from 'papaparse'
import jsPDF from 'jspdf'

export type DailyLog = {
  date: string
  actual_calories: number
  actual_protein: number
  actual_fats: number
  actual_carbs: number
  weight?: number | null
  notes?: string | null
}

export type NutritionTarget = {
  day_type: string
  calories: number
  protein: number
  fats: number
  carbs: number
}

/**
 * Экспорт данных в CSV формат
 */
export function exportToCSV(data: DailyLog[], filename?: string): void {
  if (!data || data.length === 0) {
    throw new Error('Нет данных для экспорта')
  }

  const csvData = data.map(log => ({
    Дата: log.date,
    Калории: log.actual_calories,
    Белки: log.actual_protein,
    Жиры: log.actual_fats,
    Углеводы: log.actual_carbs,
    Вес: log.weight || '',
    Комментарий: log.notes || '',
  }))

  const csv = Papa.unparse(csvData)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename || `nutrition_data_${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Экспорт данных в JSON формат
 */
export function exportToJSON(data: unknown, filename?: string): void {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error('Нет данных для экспорта')
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename || `nutrition_data_${new Date().toISOString().split('T')[0]}.json`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Экспорт данных в PDF формат
 */
export async function exportToPDF(
  data: DailyLog[],
  targets?: NutritionTarget[],
  filename?: string
): Promise<void> {
  if (!data || data.length === 0) {
    throw new Error('Нет данных для экспорта')
  }

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const lineHeight = 7
  let yPosition = margin

  // Заголовок
  doc.setFontSize(16)
  doc.text('Отчет о питании', margin, yPosition)
  yPosition += lineHeight * 2

  // Дата создания
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Создано: ${new Date().toLocaleDateString('ru-RU')}`, margin, yPosition)
  yPosition += lineHeight * 2

  // Цели питания (если есть)
  if (targets && targets.length > 0) {
    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0)
    doc.text('Цели питания:', margin, yPosition)
    yPosition += lineHeight

    targets.forEach(target => {
      const targetText = `${target.day_type === 'training' ? 'Тренировочный день' : 'День отдыха'}: ${target.calories} ккал, Б: ${target.protein}г, Ж: ${target.fats}г, У: ${target.carbs}г`

      if (yPosition > pageHeight - margin - lineHeight) {
        doc.addPage()
        yPosition = margin
      }

      doc.setFontSize(10)
      doc.text(targetText, margin + 5, yPosition)
      yPosition += lineHeight
    })

    yPosition += lineHeight
  }

  // Таблица данных
  doc.setFontSize(12)
  doc.setTextColor(0, 0, 0)
  doc.text('Данные:', margin, yPosition)
  yPosition += lineHeight

  // Заголовки таблицы
  const headers = ['Дата', 'Ккал', 'Б', 'Ж', 'У', 'Вес']
  const colWidths = [35, 20, 15, 15, 15, 20]
  let xPosition = margin

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  headers.forEach((header, index) => {
    doc.text(header, xPosition, yPosition)
    xPosition += colWidths[index]
  })
  yPosition += lineHeight
  doc.setFont('helvetica', 'normal')

  // Данные таблицы
  data.forEach(log => {
    if (yPosition > pageHeight - margin - lineHeight) {
      doc.addPage()
      yPosition = margin

      // Повторяем заголовки
      xPosition = margin
      doc.setFont('helvetica', 'bold')
      headers.forEach((header, index) => {
        doc.text(header, xPosition, yPosition)
        xPosition += colWidths[index]
      })
      yPosition += lineHeight
      doc.setFont('helvetica', 'normal')
    }

    xPosition = margin
    const rowData = [
      new Date(log.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      log.actual_calories.toString(),
      log.actual_protein.toString(),
      log.actual_fats.toString(),
      log.actual_carbs.toString(),
      log.weight ? log.weight.toString() : '-',
    ]

    rowData.forEach((cell, index) => {
      doc.text(cell, xPosition, yPosition)
      xPosition += colWidths[index]
    })
    yPosition += lineHeight
  })

  // Сохранение PDF
  doc.save(filename || `nutrition_report_${new Date().toISOString().split('T')[0]}.pdf`)
}
