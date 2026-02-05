import { forwardRef } from 'react'
import { Logo, LogoProps } from './Logo'
import { cn } from '@/shared/utils/cn'

export interface AppLogoProps extends Omit<LogoProps, 'width' | 'height'> {
    size?: 'sm' | 'md' | 'lg'
    onClick?: () => void
}

export const AppLogo = forwardRef<HTMLDivElement, AppLogoProps>(
    ({ size = 'md', onClick, className, ...props }, ref) => {
        const sizes = {
            sm: { width: 120, height: 36 },
            md: { width: 160, height: 48 },
            lg: { width: 200, height: 60 },
        }

        const { width, height } = sizes[size]

        const baseStyles = 'inline-flex items-center justify-center transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600'
        const interactiveStyles = onClick ? 'cursor-pointer hover:opacity-80' : ''

        if (onClick) {
            return (
                <button
                    onClick={onClick}
                    className={cn(baseStyles, interactiveStyles, className)}
                    aria-label="Go to dashboard"
                    data-testid="app-logo"
                >
                    <Logo width={width} height={height} {...props} />
                </button>
            )
        }

        return (
            <div
                ref={ref}
                className={cn(baseStyles, className)}
                data-testid="app-logo"
            >
                <Logo width={width} height={height} {...props} />
            </div>
        )
    }
)

AppLogo.displayName = 'AppLogo'
