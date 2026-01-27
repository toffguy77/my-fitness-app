import React from 'react'

export interface LogoProps {
    width?: number
    height?: number
    className?: string
}

export const Logo: React.FC<LogoProps> = ({
    width = 200,
    height = 60,
    className = 'text-gray-900'
}) => {
    return (
        <svg
            width={width}
            height={height}
            viewBox="0 0 200 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Left Weight */}
            <rect x="20" y="18" width="6" height="24" rx="1" fill="currentColor" />
            <rect x="30" y="12" width="8" height="36" rx="2" fill="currentColor" />

            {/* Text */}
            <text
                x="100"
                y="38"
                fontFamily="Inter, -apple-system, sans-serif"
                fontWeight="700"
                fontSize="24"
                letterSpacing="0.15em"
                textAnchor="middle"
                fill="currentColor"
            >
                BURCEV
            </text>

            {/* Right Weight */}
            <rect x="162" y="12" width="8" height="36" rx="2" fill="currentColor" />
            <rect x="174" y="18" width="6" height="24" rx="1" fill="currentColor" />
        </svg>
    )
}
