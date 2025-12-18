/**
 * Tests for ExportButton component
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExportButton from '../ExportButton'
import { exportToCSV, exportToJSON, exportToPDF } from '@/utils/export'
import toast from 'react-hot-toast'

// Mock export functions
jest.mock('@/utils/export', () => ({
  exportToCSV: jest.fn(),
  exportToJSON: jest.fn(),
  exportToPDF: jest.fn().mockResolvedValue(undefined),
}))

// Mock toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

describe('ExportButton', () => {
  const mockData = [
    {
      date: '2024-01-01',
      actual_calories: 2000,
      actual_protein: 150,
      actual_fats: 60,
      actual_carbs: 200,
      weight: 75,
      notes: 'Test',
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders export button', () => {
    render(<ExportButton data={mockData} />)
    
    expect(screen.getByText('Экспорт')).toBeInTheDocument()
  })

  it('disables button when data is empty', () => {
    render(<ExportButton data={[]} />)
    
    const button = screen.getByText('Экспорт').closest('button')
    expect(button).toBeDisabled()
  })

  it('shows menu when clicked', async () => {
    const user = userEvent.setup()
    render(<ExportButton data={mockData} />)
    
    const button = screen.getByText('Экспорт').closest('button')
    await user.click(button!)
    
    expect(screen.getByText('CSV')).toBeInTheDocument()
    expect(screen.getByText('JSON')).toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('exports to CSV when CSV option is clicked', async () => {
    const user = userEvent.setup()
    render(<ExportButton data={mockData} />)
    
    const button = screen.getByText('Экспорт').closest('button')
    await user.click(button!)
    
    const csvButton = screen.getByText('CSV')
    await user.click(csvButton)
    
    await waitFor(() => {
      expect(exportToCSV).toHaveBeenCalledWith(mockData, undefined)
      expect(toast.success).toHaveBeenCalledWith('Данные экспортированы в CSV')
    })
  })

  it('exports to JSON when JSON option is clicked', async () => {
    const user = userEvent.setup()
    render(<ExportButton data={mockData} />)
    
    const button = screen.getByText('Экспорт').closest('button')
    await user.click(button!)
    
    const jsonButton = screen.getByText('JSON')
    await user.click(jsonButton)
    
    await waitFor(() => {
      expect(exportToJSON).toHaveBeenCalledWith(mockData, undefined)
      expect(toast.success).toHaveBeenCalledWith('Данные экспортированы в JSON')
    })
  })

  it('exports to PDF when PDF option is clicked', async () => {
    const user = userEvent.setup()
    const mockTargets = [{ day_type: 'training', calories: 2000, protein: 150, fats: 60, carbs: 200 }]
    render(<ExportButton data={mockData} targets={mockTargets} />)
    
    const button = screen.getByText('Экспорт').closest('button')
    await user.click(button!)
    
    const pdfButton = screen.getByText('PDF')
    await user.click(pdfButton)
    
    await waitFor(() => {
      expect(exportToPDF).toHaveBeenCalledWith(mockData, mockTargets, undefined)
      expect(toast.success).toHaveBeenCalledWith('Данные экспортированы в PDF')
    })
  })

  it('shows error toast when export fails', async () => {
    const user = userEvent.setup()
    const mockError = new Error('Export failed')
    ;(exportToCSV as jest.Mock).mockImplementation(() => {
      throw mockError
    })
    
    render(<ExportButton data={mockData} />)
    
    const button = screen.getByText('Экспорт').closest('button')
    await user.click(button!)
    
    const csvButton = screen.getByText('CSV')
    await user.click(csvButton)
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Ошибка экспорта: Export failed')
    })
  })

  it('shows loading state during export', async () => {
    const user = userEvent.setup()
    ;(exportToPDF as jest.Mock).mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
    
    render(<ExportButton data={mockData} />)
    
    const button = screen.getByText('Экспорт').closest('button')
    await user.click(button!)
    
    const pdfButton = screen.getByText('PDF')
    await user.click(pdfButton)
    
    expect(screen.getByText('Экспорт...')).toBeInTheDocument()
  })
})

