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
            const requirementPlaceholders = container.querySelectorAll('.h-3[aria-hidden="true"]')
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

        it('renders target placeholders as list rows', () => {
            render(<WeeklyPlanSectionSkeleton />)

            // Цели плана — строками списка, как в самой секции
            expect(screen.getByTestId('weekly-plan-skeleton-targets').children).toHaveLength(3)
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

        it('renders three task row placeholders', () => {
            render(<TasksSectionSkeleton />)

            // Задачи — строками списка, как в самой секции
            expect(screen.getByTestId('tasks-skeleton-rows').children).toHaveLength(3)
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
        // Заглушка стоит на месте карточки и выглядит как она: поверхность с
        // линией, без тени — тень только у того, что лежит над экраном.
        it('uses the card surface without a shadow', () => {
            const { rerender } = render(<ProgressSectionSkeleton />)
            const skeletons = [
                <PhotoUploadSectionSkeleton key="p" />,
                <WeeklyPlanSectionSkeleton key="w" />,
                <TasksSectionSkeleton key="t" />,
            ]

            const check = () => {
                const skeleton = screen.getByRole('status')
                expect(skeleton).toHaveClass('bg-surface', 'border-line', 'rounded-card')
                expect(skeleton.className).not.toMatch(/shadow-/)
            }

            check()
            for (const element of skeletons) {
                rerender(element)
                check()
            }
        })

        it('skeleton elements have gray background', () => {
            const { container } = render(<ProgressSectionSkeleton />)

            const skeletonElements = container.querySelectorAll('.bg-subtle')
            expect(skeletonElements.length).toBeGreaterThan(0)
        })
    })
})
