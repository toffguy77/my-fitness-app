'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'

interface OnboardingTooltipProps {
  content: string
  title?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export default function OnboardingTooltip({ 
  content, 
  title,
  position = 'top' 
}: OnboardingTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2',
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        aria-label="Подсказка"
      >
        <Info size={14} />
      </button>
      
      {isOpen && (
        <div
          className={`absolute z-50 w-64 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl ${positionClasses[position]}`}
          role="tooltip"
        >
          {title && (
            <div className="font-semibold mb-1">{title}</div>
          )}
          <div>{content}</div>
          {/* Arrow */}
          <div className={`absolute ${
            position === 'top' ? 'top-full left-1/2 transform -translate-x-1/2 border-t-gray-900 border-t-8 border-x-transparent border-x-8' :
            position === 'bottom' ? 'bottom-full left-1/2 transform -translate-x-1/2 border-b-gray-900 border-b-8 border-x-transparent border-x-8' :
            position === 'left' ? 'left-full top-1/2 transform -translate-y-1/2 border-l-gray-900 border-l-8 border-y-transparent border-y-8' :
            'right-full top-1/2 transform -translate-y-1/2 border-r-gray-900 border-r-8 border-y-transparent border-y-8'
          }`} />
        </div>
      )}
    </div>
  )
}

