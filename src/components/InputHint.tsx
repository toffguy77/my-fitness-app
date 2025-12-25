'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'

interface InputHintProps {
  hint: string
  className?: string
}

export default function InputHint({ hint, className = '' }: InputHintProps) {
  return (
    <div className={`flex items-start gap-1 text-xs text-zinc-500 mt-1 ${className}`}>
      <Info size={12} className="mt-0.5 flex-shrink-0 text-zinc-500" />
      <span>{hint}</span>
    </div>
  )
}

