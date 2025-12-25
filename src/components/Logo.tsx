'use client'

import React from 'react'

interface LogoProps {
  width?: number
  height?: number
  className?: string
  onClick?: () => void
}

export default function Logo({ width = 200, height = 60, className = '', onClick }: LogoProps) {
  const svgContent = (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 200 60" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left Weight */}
      <rect x="20" y="18" width="6" height="24" rx="1" fill="#F4F4F5"/>
      <rect x="30" y="12" width="8" height="36" rx="2" fill="#F4F4F5"/>
      
      {/* Text */}
      <text 
        x="100" 
        y="38" 
        fontFamily="Inter, -apple-system, sans-serif" 
        fontWeight="700" 
        fontSize="24" 
        letterSpacing="0.15em" 
        textAnchor="middle" 
        fill="#F4F4F5"
      >
        BURCEV
      </text>
      
      {/* Right Weight */}
      <rect x="162" y="12" width="8" height="36" rx="2" fill="#F4F4F5"/>
      <rect x="174" y="18" width="6" height="24" rx="1" fill="#F4F4F5"/>
    </svg>
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`hover:opacity-80 transition-opacity ${className}`}
        aria-label="BURCEV"
      >
        {svgContent}
      </button>
    )
  }

  return svgContent
}

