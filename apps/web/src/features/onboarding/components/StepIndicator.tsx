'use client'

import { cn } from '@/shared/utils/cn'

interface StepIndicatorProps {
    currentStep: number
    totalSteps: number
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
    return (
        <div className="flex items-center justify-center gap-0">
            {Array.from({ length: totalSteps }, (_, i) => {
                const isCompleted = i < currentStep
                const isActive = i === currentStep

                return (
                    <div key={i} className="flex items-center">
                        {/* Dot */}
                        <div
                            className={cn(
                                'h-3 w-3 rounded-full transition-colors',
                                isCompleted || isActive
                                    ? 'bg-violet-500'
                                    : 'bg-gray-300'
                            )}
                        />

                        {/* Connecting line (not after last dot) */}
                        {i < totalSteps - 1 && (
                            <div
                                className={cn(
                                    'h-0.5 w-8 transition-colors',
                                    i < currentStep
                                        ? 'bg-violet-500'
                                        : 'bg-gray-300'
                                )}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

StepIndicator.displayName = 'StepIndicator'
