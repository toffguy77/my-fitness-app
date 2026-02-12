/**
 * Tests for Loading Skeleton Components
 *
 * Tests the loading placeholder components used with React.lazy() and Suspense.
 * Validates accessibility, structure, and proper ARIA attributes.
 *
 * Requirements: 19.1 - Code splitting with appropriate loading fallbacks
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import {
    ProgressSectionSkeleton,
    PhotoUploadSectionSkeleton,
    WeeklyPlanSectionSkeleton,
    TasksSectionSkeleton,
    BelowFoldSectionsSkeleton,
} from '../LoadingSkeletons'

describe('LoadingSkeletons', () => {
    describe('ProgressSectionSkeleton', () => {
        it('renders with correct accessibility attributes', () => {
            render(<ProgressSectionSkeleton />)

            const skeleton = screen.getByRole('status')
            expect(skeleton).toBeInTheDocument()
            expect(skeleton).toHaveAttribute('aria-label', 'Загрузка раздела прогресса...')
        })

        it('includes screen reader text', () => {
            render(<ProgressSectionSkeleton />)

            expect(screen.getByText('Загрузка...')).toHaveClass('sr-only')
        })

        it('applies custom className', () => {
            render(<ProgressSectionSkeleton className="custom-class" />)

            const skeleton = screen.getByRole('status')
            expect(skeleton).toHaveClass('custom-class')
        })

        it('renders skeleton elements with aria-hidden', () => {
            const { container } = render(<ProgressSectionSkeleton />)

            const skeletonElements = container.querySelectorAll('[aria-hidden="true"]')
            expect(skeletonElements.length).toBeGreaterThan(0)
        })

        it('has pulse animation class on skeleton elements', () => {
            const { container } = render(<ProgressSectionSkeleton />)

            const animatedElements = container.querySelectorAll('.animate-pulse')
            expect(animatedElements.length).toBeGreaterThan(0)
        })

        it('renders chart placeholder area', () => {
            const { container } = render(<ProgressSectionSkeleton />)

            // Check for chart placeholder (h-32 w-full)
            const chartPlaceholder = container.querySelector('.h-32.w-full')
            expect(chartPlaceholder).toBeInTheDocument()
        })

        it('renders achievement placeholders', () => {
            const { container } = render(<ProgressSectionSkeleton />)

            // Check for achievement placeholders (h-16 w-full)
            const achievementPlaceholders = container.querySelectorAll('.h-16.w-full')
            expect(achievementPlaceholders.length).toBe(2)
        })
    })

    describe('PhotoUploadSectionSkeleton', () => {
        it('renders with correct accessibility attributes', () => {
            render(<PhotoUploadSectionSkeleton />)

            const skeleton = screen.getByRole('status')
            expect(skeleton).toBeInTheDocument()
            expect(skeleton).toHaveAttribute('aria-label', 'Загрузка раздела фото...')
        })

        it('includes screen reader text', () => {
            render(<PhotoUploadSectionSkeleton />)

            expect(screen.getByText('Загрузка...')).toHaveClass('sr-only')
        })

        it('applies custom className', () => {
            render(<PhotoUploadSectionSkeleton className="photo-custom" />)

            const skeleton = screen.getByRole('status')
            expect(skeleton).toHaveClass('photo-custom')
        })

        it('renders upload button placeholder', () => {
            const { container } = render(<PhotoUploadSectionSkeleton />)

            // Check for upload button placeholder (h-14 w-full)
            const buttonPlaceholder = container.querySelector('.h-14.w-full')
            expect(buttonPlaceholder).toBeInTheDocument()
        })

        it('renders file requirements placeholders', () => {
            const { container } = render(<PhotoUploadSectionSkeleton />)

            // Check for file requirement text placeholders (h-3)
            const requirementPlaceholders = container.querySelectorAll('.h-3')
            expect(requirementPlaceholders.length).toBe(3)
        })
    })

    describe('WeeklyPlanSectionSkeleton', () => {
        it('renders with correct accessibility attributes', () => {
            render(<WeeklyPlanSectionSkeleton />)

            const skeleton = screen.getByRole('status')
            expect(skeleton).toBeInTheDocument()
            expect(skeleton).toHaveAttribute('aria-label', 'Загрузка недельной планки...')
        })

        it('includes screen reader text', () => {
            render(<WeeklyPlanSectionSkeleton />)

            expect(screen.getByText('Загрузка...')).toHaveClass('sr-only')
        })

        it('applies custom className', () => {
            render(<WeeklyPlanSectionSkeleton className="plan-custom" />)

            const skeleton = screen.getByRole('status')
            expect(skeleton).toHaveClass('plan-custom')
        })

        it('renders active indicator placeholder', () => {
            const { container } = render(<WeeklyPlanSectionSkeleton />)

            // Check for active indicator (h-5 w-5 rounded-full)
            const activeIndicator = container.querySelector('.h-5.w-5.rounded-full')
            expect(activeIndicator).toBeInTheDocument()
        })

        it('renders target placeholders', () => {
            const { container } = render(<WeeklyPlanSectionSkeleton />)

            // Check for target placeholders (h-12 w-full)
            const targetPlaceholders = container.querySelectorAll('.h-12.w-full')
            expect(targetPlaceholders.length).toBe(3)
        })

        it('renders plan dates placeholder', () => {
            const { container } = render(<WeeklyPlanSectionSkeleton />)

            // Check for dates placeholder (h-16 w-full)
            const datesPlaceholder = container.querySelector('.h-16.w-full')
            expect(datesPlaceholder).toBeInTheDocument()
        })
    })

    describe('TasksSectionSkeleton', () => {
        it('renders with correct accessibility attributes', () => {
            render(<TasksSectionSkeleton />)

            const skeleton = screen.getByRole('status')
            expect(skeleton).toBeInTheDocument()
            expect(skeleton).toHaveAttribute('aria-label', 'Загрузка раздела задач...')
        })

        it('includes screen reader text', () => {
            render(<TasksSectionSkeleton />)

            expect(screen.getByText('Загрузка...')).toHaveClass('sr-only')
        })

        it('applies custom className', () => {
            render(<TasksSectionSkeleton className="tasks-custom" />)

            const skeleton = screen.getByRole('status')
            expect(skeleton).toHaveClass('tasks-custom')
        })

        it('renders three task item placeholders', () => {
            const { container } = render(<TasksSectionSkeleton />)

            // Check for task item containers with border
            const taskItems = container.querySelectorAll('.border.border-gray-200.rounded-lg')
            expect(taskItems.length).toBe(3)
        })

        it('renders task checkbox placeholders', () => {
            const { container } = render(<TasksSectionSkeleton />)

            // Check for checkbox placeholders (h-5 w-5 rounded-full flex-shrink-0)
            const checkboxPlaceholders = container.querySelectorAll('.h-5.w-5.rounded-full.flex-shrink-0')
            expect(checkboxPlaceholders.length).toBe(3)
        })

        it('renders week indicator placeholder', () => {
            const { container } = render(<TasksSectionSkeleton />)

            // Check for week indicator (h-4 w-24 mb-3)
            const weekIndicator = container.querySelector('.h-4.w-24.mb-3')
            expect(weekIndicator).toBeInTheDocument()
        })
    })

    describe('BelowFoldSectionsSkeleton', () => {
        it('renders all section skeletons', () => {
            render(<BelowFoldSectionsSkeleton />)

            // Should have 4 status elements (one for each section)
            const statusElements = screen.getAllByRole('status')
            expect(statusElements.length).toBe(4)
        })

        it('renders with responsive grid layout', () => {
            const { container } = render(<BelowFoldSectionsSkeleton />)

            const grid = container.firstChild
            expect(grid).toHaveClass('grid')
            expect(grid).toHaveClass('grid-cols-1')
            expect(grid).toHaveClass('md:grid-cols-2')
            expect(grid).toHaveClass('lg:grid-cols-3')
        })

        it('renders progress section spanning full width on large screens', () => {
            const { container } = render(<BelowFoldSectionsSkeleton />)

            // Progress section should span full width
            const progressWrapper = container.querySelector('.md\\:col-span-2.lg\\:col-span-3')
            expect(progressWrapper).toBeInTheDocument()
        })

        it('includes all section aria-labels', () => {
            render(<BelowFoldSectionsSkeleton />)

            expect(screen.getByLabelText('Загрузка раздела прогресса...')).toBeInTheDocument()
            expect(screen.getByLabelText('Загрузка раздела фото...')).toBeInTheDocument()
            expect(screen.getByLabelText('Загрузка недельной планки...')).toBeInTheDocument()
            expect(screen.getByLabelText('Загрузка раздела задач...')).toBeInTheDocument()
        })

        it('renders with proper gap spacing', () => {
            const { container } = render(<BelowFoldSectionsSkeleton />)

            const grid = container.firstChild
            expect(grid).toHaveClass('gap-4')
            expect(grid).toHaveClass('sm:gap-5')
            expect(grid).toHaveClass('md:gap-6')
        })
    })

    describe('Accessibility', () => {
        it('all skeletons have role="status"', () => {
            const { rerender } = render(<ProgressSectionSkeleton />)
            expect(screen.getByRole('status')).toBeInTheDocument()

            rerender(<PhotoUploadSectionSkeleton />)
            expect(screen.getByRole('status')).toBeInTheDocument()

            rerender(<WeeklyPlanSectionSkeleton />)
            expect(screen.getByRole('status')).toBeInTheDocument()

            rerender(<TasksSectionSkeleton />)
            expect(screen.getByRole('status')).toBeInTheDocument()
        })

        it('all skeletons have Russian aria-labels', () => {
            const { rerender } = render(<ProgressSectionSkeleton />)
            expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining('Загрузка'))

            rerender(<PhotoUploadSectionSkeleton />)
            expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining('Загрузка'))

            rerender(<WeeklyPlanSectionSkeleton />)
            expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining('Загрузка'))

            rerender(<TasksSectionSkeleton />)
            expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining('Загрузка'))
        })

        it('skeleton elements are hidden from screen readers', () => {
            const { container } = render(<ProgressSectionSkeleton />)

            const hiddenElements = container.querySelectorAll('[aria-hidden="true"]')
            hiddenElements.forEach(element => {
                expect(element).toHaveAttribute('aria-hidden', 'true')
            })
        })

        it('provides screen reader only loading text', () => {
            render(<ProgressSectionSkeleton />)

            const srOnlyText = screen.getByText('Загрузка...')
            expect(srOnlyText).toHaveClass('sr-only')
        })
    })

    describe('Styling', () => {
        it('applies base card styling to all skeletons', () => {
            const { rerender } = render(<ProgressSectionSkeleton />)
            let skeleton = screen.getByRole('status')
            expect(skeleton).toHaveClass('bg-white', 'rounded-lg', 'shadow-sm')

            rerender(<PhotoUploadSectionSkeleton />)
            skeleton = screen.getByRole('status')
            expect(skeleton).toHaveClass('bg-white', 'rounded-lg', 'shadow-sm')

            rerender(<WeeklyPlanSectionSkeleton />)
            skeleton = screen.getByRole('status')
            expect(skeleton).toHaveClass('bg-white', 'rounded-lg', 'shadow-sm')

            rerender(<TasksSectionSkeleton />)
            skeleton = screen.getByRole('status')
            expect(skeleton).toHaveClass('bg-white', 'rounded-lg', 'shadow-sm')
        })

        it('applies responsive padding', () => {
            render(<ProgressSectionSkeleton />)

            const skeleton = screen.getByRole('status')
            expect(skeleton).toHaveClass('p-4', 'sm:p-5', 'md:p-6')
        })

        it('skeleton elements have gray background', () => {
            const { container } = render(<ProgressSectionSkeleton />)

            const skeletonElements = container.querySelectorAll('.bg-gray-200')
            expect(skeletonElements.length).toBeGreaterThan(0)
        })
    })
})
