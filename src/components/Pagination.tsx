'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

type PaginationProps = {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  itemsPerPage?: number
  totalItems?: number
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage = 20,
  totalItems,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      // Показываем все страницы
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Показываем первую страницу
      pages.push(1)

      // Вычисляем диапазон вокруг текущей страницы
      let start = Math.max(2, currentPage - 1)
      let end = Math.min(totalPages - 1, currentPage + 1)

      // Если текущая страница близко к началу
      if (currentPage <= 3) {
        end = 4
      }

      // Если текущая страница близко к концу
      if (currentPage >= totalPages - 2) {
        start = totalPages - 3
      }

      // Добавляем многоточие перед диапазоном
      if (start > 2) {
        pages.push('...')
      }

      // Добавляем страницы в диапазоне
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      // Добавляем многоточие после диапазона
      if (end < totalPages - 1) {
        pages.push('...')
      }

      // Показываем последнюю страницу
      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="text-sm text-zinc-400 tabular-nums">
        {totalItems !== undefined && (
          <span>
            Показано {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} -{' '}
            {Math.min(currentPage * itemsPerPage, totalItems)} из {totalItems}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-zinc-300"
          aria-label="Предыдущая страница"
        >
          <ChevronLeft size={16} />
        </button>

        {getPageNumbers().map((page, index) => {
          if (page === '...') {
            return (
              <span key={`ellipsis-${index}`} className="px-2 text-zinc-500">
                ...
              </span>
            )
          }

          const pageNum = page as number
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors tabular-nums ${
                currentPage === pageNum
                  ? 'bg-white text-zinc-950'
                  : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800'
              }`}
              aria-label={`Страница ${pageNum}`}
              aria-current={currentPage === pageNum ? 'page' : undefined}
            >
              {pageNum}
            </button>
          )
        })}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-zinc-300"
          aria-label="Следующая страница"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

