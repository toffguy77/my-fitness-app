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
 * Provides consistent padding and overflow handling for content that exceeds viewport height.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
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
                    // Consistent padding using design tokens (Requirement 3.1)
                    'px-4 py-6',
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
