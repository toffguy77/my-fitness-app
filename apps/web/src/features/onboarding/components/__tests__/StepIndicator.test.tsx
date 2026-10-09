import { render } from '@testing-library/react'
import { StepIndicator } from '../StepIndicator'

describe('StepIndicator', () => {
    it('renders correct number of dots for totalSteps', () => {
        const { container } = render(
            <StepIndicator currentStep={0} totalSteps={5} />
        )
        const dots = container.querySelectorAll('.rounded-full')
        expect(dots).toHaveLength(5)
    })

    it('renders totalSteps-1 connecting lines', () => {
        const { container } = render(
            <StepIndicator currentStep={0} totalSteps={5} />
        )
        // Lines have h-0.5 w-8 classes
        const lines = container.querySelectorAll('.h-0\\.5')
        expect(lines).toHaveLength(4)
    })

    describe('at first step (currentStep=0)', () => {
        it('gives the first dot blue styling and rest gray', () => {
            const { container } = render(
                <StepIndicator currentStep={0} totalSteps={5} />
            )
            const dots = container.querySelectorAll('.rounded-full')
            expect(dots[0]).toHaveClass('bg-primary')
            expect(dots[1]).toHaveClass('bg-line')
            expect(dots[2]).toHaveClass('bg-line')
            expect(dots[3]).toHaveClass('bg-line')
            expect(dots[4]).toHaveClass('bg-line')
        })

        it('gives all connecting lines gray styling', () => {
            const { container } = render(
                <StepIndicator currentStep={0} totalSteps={5} />
            )
            const lines = container.querySelectorAll('.h-0\\.5')
            lines.forEach((line) => {
                expect(line).toHaveClass('bg-line')
            })
        })
    })

    describe('at middle step (currentStep=2)', () => {
        it('gives completed and active dots blue styling, future dots gray', () => {
            const { container } = render(
                <StepIndicator currentStep={2} totalSteps={5} />
            )
            const dots = container.querySelectorAll('.rounded-full')
            // Steps 0, 1 are completed; step 2 is active => all blue
            expect(dots[0]).toHaveClass('bg-primary')
            expect(dots[1]).toHaveClass('bg-primary')
            expect(dots[2]).toHaveClass('bg-primary')
            // Steps 3, 4 are future => gray
            expect(dots[3]).toHaveClass('bg-line')
            expect(dots[4]).toHaveClass('bg-line')
        })

        it('colors connecting lines correctly', () => {
            const { container } = render(
                <StepIndicator currentStep={2} totalSteps={5} />
            )
            const lines = container.querySelectorAll('.h-0\\.5')
            // Lines 0 and 1 connect completed steps => blue
            expect(lines[0]).toHaveClass('bg-primary')
            expect(lines[1]).toHaveClass('bg-primary')
            // Lines 2 and 3 are after current step => gray
            expect(lines[2]).toHaveClass('bg-line')
            expect(lines[3]).toHaveClass('bg-line')
        })
    })

    describe('at last step (currentStep=4)', () => {
        it('gives all dots blue styling', () => {
            const { container } = render(
                <StepIndicator currentStep={4} totalSteps={5} />
            )
            const dots = container.querySelectorAll('.rounded-full')
            dots.forEach((dot) => {
                expect(dot).toHaveClass('bg-primary')
            })
        })

        it('gives all connecting lines blue styling', () => {
            const { container } = render(
                <StepIndicator currentStep={4} totalSteps={5} />
            )
            const lines = container.querySelectorAll('.h-0\\.5')
            lines.forEach((line) => {
                expect(line).toHaveClass('bg-primary')
            })
        })
    })

    it('renders with a different totalSteps value', () => {
        const { container } = render(
            <StepIndicator currentStep={1} totalSteps={3} />
        )
        const dots = container.querySelectorAll('.rounded-full')
        const lines = container.querySelectorAll('.h-0\\.5')
        expect(dots).toHaveLength(3)
        expect(lines).toHaveLength(2)
    })
})
