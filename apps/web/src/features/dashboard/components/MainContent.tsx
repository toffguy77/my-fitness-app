import { forwardRef } from 'react'
import { cn } from '@/shared/utils/cn'

export interface MainContentProps {
    children: React.ReactNode
    className?: string
}

/**
 * MainContent component
 *
 * Scrollable container for dashboard content positioned between header and footer.
 * Provides consistent responsive padding and overflow handling for content that exceeds viewport height.
 * Ensures no horizontal scrolling on any device size.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 12.5
 */
export const MainContent = forwardRef<HTMLDivElement, MainContentProps>(
    ({ children, className }, ref) => {
        return (
            <main
                ref={ref}
                className={cn(
                    // Flex-grow to fill available space between header and footer (Requirement 3.1, 3.3)
                    'flex-grow',
                    // Scrollable when content exceeds viewport height (Requirement 3.4)
                    'overflow-y-auto',
                    // Prevent horizontal scrolling (Requirement 12.5)
                    'overflow-x-hidden',
                    // Full width container
                    'w-full',
                    // Responsive padding using design tokens (Requirement 3.1, 12.1, 12.2, 12.3)
                    // Mobile: minimal padding for maximum content space
                    // Tablet: moderate padding
                    // Desktop: comfortable padding
                    'px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6',
                    // Background color from design system
                    'bg-gray-50',
                    className
                )}
                data-testid="main-content"
            >
                {children}
            </main>
        )
    }
)

MainContent.displayName = 'MainContent'
