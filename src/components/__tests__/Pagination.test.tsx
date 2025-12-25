/**
 * Tests for Pagination component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Pagination from '../Pagination'

describe('Pagination', () => {
  const mockOnPageChange = jest.fn()

  beforeEach(() => {
    mockOnPageChange.mockClear()
  })

  it('does not render when totalPages <= 1', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={mockOnPageChange} />
    )
    
    expect(container.firstChild).toBeNull()
  })

  it('renders page numbers correctly', () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={mockOnPageChange} />
    )
    
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('calls onPageChange when page is clicked', async () => {
    const user = userEvent.setup()
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={mockOnPageChange} />
    )
    
    const page2Button = screen.getByText('2')
    await user.click(page2Button)
    
    expect(mockOnPageChange).toHaveBeenCalledWith(2)
  })

  it('disables previous button on first page', () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={mockOnPageChange} />
    )
    
    const prevButton = screen.getByLabelText('Предыдущая страница')
    expect(prevButton).toBeDisabled()
  })

  it('disables next button on last page', () => {
    render(
      <Pagination currentPage={5} totalPages={5} onPageChange={mockOnPageChange} />
    )
    
    const nextButton = screen.getByLabelText('Следующая страница')
    expect(nextButton).toBeDisabled()
  })

  it('shows ellipsis for large page counts', () => {
    render(
      <Pagination currentPage={10} totalPages={20} onPageChange={mockOnPageChange} />
    )
    
    const ellipsis = screen.getAllByText('...')
    expect(ellipsis.length).toBeGreaterThan(0)
  })

  it('displays total items count when provided', () => {
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={mockOnPageChange}
        itemsPerPage={20}
        totalItems={100}
      />
    )
    
    expect(screen.getByText(/Показано.*1.*20.*из.*100/)).toBeInTheDocument()
  })

  it('highlights current page', () => {
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={mockOnPageChange} />
    )
    
    const currentPageButton = screen.getByText('3')
    expect(currentPageButton).toHaveClass('bg-white', 'text-zinc-950')
  })
})

