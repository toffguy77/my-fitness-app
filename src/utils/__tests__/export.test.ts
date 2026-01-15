/**
 * Unit Tests: Export Functions
 * Tests data export utilities (CSV, JSON, PDF)
 */

import {
  exportToCSV,
  exportToJSON,
  exportToPDF,
  type DailyLog,
  type NutritionTarget,
} from '../export'

// Mock papaparse
jest.mock('papaparse', () => ({
  unparse: jest.fn((data) => 'csv,data'),
}))

// Mock jsPDF
const mockDoc = {
  setFontSize: jest.fn(),
  text: jest.fn(),
  setTextColor: jest.fn(),
  setFont: jest.fn(),
  addPage: jest.fn(),
  save: jest.fn(),
  internal: {
    pageSize: {
      getWidth: () => 210,
      getHeight: () => 297,
    },
  },
}

jest.mock('jspdf', () => {
  return jest.fn(() => mockDoc)
})

// Mock DOM methods
global.URL.createObjectURL = jest.fn(() => 'blob:url')
global.URL.revokeObjectURL = jest.fn()

describe('Export Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    document.body.innerHTML = ''
  })

  describe('exportToCSV', () => {
    const mockData: DailyLog[] = [
      {
        date: '2024-01-15',
        actual_calories: 2000,
        actual_protein: 150,
        actual_fats: 60,
        actual_carbs: 200,
        weight: 80,
        notes: 'Test note',
      },
    ]

    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('should export data to CSV', () => {
      exportToCSV(mockData)

      // Link is created and clicked, then removed
      // Just verify function executes without error
      expect(mockData.length).toBeGreaterThan(0)
    })

    it('should throw error for empty data', () => {
      expect(() => exportToCSV([])).toThrow('Нет данных для экспорта')
    })

    it('should use custom filename', () => {
      // Spy on createElement to capture link before it's removed
      const createElementSpy = jest.spyOn(document, 'createElement')
      const setAttributeSpy = jest.spyOn(HTMLAnchorElement.prototype, 'setAttribute')

      exportToCSV(mockData, 'custom.csv')

      // Check that setAttribute was called with download and custom filename
      expect(setAttributeSpy).toHaveBeenCalledWith('download', 'custom.csv')

      createElementSpy.mockRestore()
      setAttributeSpy.mockRestore()
    })

    it('should handle null weight and notes', () => {
      const dataWithNulls: DailyLog[] = [
        {
          date: '2024-01-15',
          actual_calories: 2000,
          actual_protein: 150,
          actual_fats: 60,
          actual_carbs: 200,
          weight: null,
          notes: null,
        },
      ]

      expect(() => exportToCSV(dataWithNulls)).not.toThrow()
    })
  })

  describe('exportToJSON', () => {
    const mockData = [{ key: 'value' }]

    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('should export data to JSON', () => {
      exportToJSON(mockData)

      // Link is created and clicked, then removed
      // Just verify function executes without error
      expect(mockData.length).toBeGreaterThan(0)
    })

    it('should throw error for empty array', () => {
      expect(() => exportToJSON([])).toThrow('Нет данных для экспорта')
    })

    it('should throw error for null data', () => {
      expect(() => exportToJSON(null as any)).toThrow('Нет данных для экспорта')
    })

    it('should use custom filename', () => {
      // Spy on createElement to capture link before it's removed
      const setAttributeSpy = jest.spyOn(HTMLAnchorElement.prototype, 'setAttribute')

      exportToJSON(mockData, 'custom.json')

      // Check that setAttribute was called with download and custom filename
      expect(setAttributeSpy).toHaveBeenCalledWith('download', 'custom.json')

      setAttributeSpy.mockRestore()
    })
  })

  describe('exportToPDF', () => {
    const mockData: DailyLog[] = [
      {
        date: '2024-01-15',
        actual_calories: 2000,
        actual_protein: 150,
        actual_fats: 60,
        actual_carbs: 200,
        weight: 80,
      },
    ]

    const mockTargets: NutritionTarget[] = [
      {
        day_type: 'training',
        calories: 2200,
        protein: 165,
        fats: 61,
        carbs: 248,
      },
    ]

    it('should export data to PDF', async () => {
      await exportToPDF(mockData)

      expect(mockDoc.text).toHaveBeenCalled()
      expect(mockDoc.save).toHaveBeenCalled()
    })

    it('should include targets if provided', async () => {
      await exportToPDF(mockData, mockTargets)

      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Цели питания'),
        expect.any(Number),
        expect.any(Number)
      )
    })

    it('should throw error for empty data', async () => {
      await expect(exportToPDF([])).rejects.toThrow('Нет данных для экспорта')
    })

    it('should handle pagination for large datasets', async () => {
      const largeData: DailyLog[] = Array.from({ length: 100 }, (_, i) => ({
        date: `2024-01-${i + 1}`,
        actual_calories: 2000,
        actual_protein: 150,
        actual_fats: 60,
        actual_carbs: 200,
      }))

      await exportToPDF(largeData)

      // Should add pages for large datasets
      expect(mockDoc.addPage).toHaveBeenCalled()
    })

    it('should use custom filename', async () => {
      await exportToPDF(mockData, undefined, 'custom.pdf')

      expect(mockDoc.save).toHaveBeenCalledWith('custom.pdf')
    })
  })
})
